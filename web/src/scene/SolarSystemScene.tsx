/**
 * 3D Solar System Scene (Three.js)
 *
 * Implements:
 * - Dual-scale solar system (linear inner <= 5 AU, log outer > 5 AU)
 * - Procedural noise-displaced icosahedrons for candidate minor bodies
 * - Distance uncertainty segment along line-of-sight for unknown candidates
 * - Dynamic segment shrinkage responsive to Time Bar epoch scrubbing
 * - Non-negotiable badge: "All 3D Models [Illustrative]"
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Candidate } from '../data/types';
import { auToSceneDistance, radecToCartesian } from './coordinates';
import { colorIndexToAsteroidColor, createProceduralAsteroidGeometry } from './proceduralAsteroid';

interface SolarSystemSceneProps {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  timeEpochRatio: number; // 0.0 to 1.0 (scrubbing along observation baseline)
}

interface PlanetDef {
  name: string;
  distanceAu: number;
  radiusUnits: number;
  color: string;
  speed: number;
}

const PLANETS: PlanetDef[] = [
  { name: 'Mercury', distanceAu: 0.39, radiusUnits: 0.3, color: '#A0AEC0', speed: 4.15 },
  { name: 'Venus', distanceAu: 0.72, radiusUnits: 0.5, color: '#ECC94B', speed: 1.62 },
  { name: 'Earth', distanceAu: 1.0, radiusUnits: 0.55, color: '#4299E1', speed: 1.0 },
  { name: 'Mars', distanceAu: 1.52, radiusUnits: 0.4, color: '#E53E3E', speed: 0.53 },
  { name: 'Jupiter', distanceAu: 5.2, radiusUnits: 1.2, color: '#DD6B20', speed: 0.084 },
  { name: 'Saturn', distanceAu: 9.54, radiusUnits: 1.0, color: '#D69E2E', speed: 0.034 },
  { name: 'Uranus', distanceAu: 19.2, radiusUnits: 0.8, color: '#319795', speed: 0.012 },
  { name: 'Neptune', distanceAu: 30.06, radiusUnits: 0.8, color: '#3182CE', speed: 0.006 },
];

export const SolarSystemScene: React.FC<SolarSystemSceneProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  timeEpochRatio,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  // References for Three.js lifecycle
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const candidateMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const uncertaintySegmentsRef = useRef<Map<string, THREE.Line>>(new Map());
  const cameraTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const cameraDesiredPosRef = useRef<THREE.Vector3 | null>(null);

  // Mouse interaction state for camera controls
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const sphericalRef = useRef({ radius: 140, theta: Math.PI / 4, phi: Math.PI / 3.2 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050506'); // --color-canvas
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Initial camera placement
    const updateCameraFromSpherical = () => {
      const { radius, theta, phi } = sphericalRef.current;
      const target = cameraTargetRef.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);
    };
    updateCameraFromSpherical();

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(0xfffaed, 2.5, 800, 0.1);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // 3. Sun (Emissive Centerpiece)
    const sunGeo = new THREE.SphereGeometry(2.8, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffea78 });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sunMesh);

    // Sun Glow Halo
    const glowGeo = new THREE.SphereGeometry(3.6, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff9900,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glowMesh);

    // 4. Background Starfield
    const starCount = 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 800 + Math.random() * 400;
      starPos[i] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x888899, size: 1.2, transparent: true, opacity: 0.65 });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 5. Planetary Orbits & Spheres
    const planetGroup = new THREE.Group();
    PLANETS.forEach((planet) => {
      const orbitRadius = auToSceneDistance(planet.distanceAu);

      // Orbit Line
      const orbitGeo = new THREE.BufferGeometry();
      const segments = 128;
      const points = new Float32Array((segments + 1) * 3);
      for (let s = 0; s <= segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        points[s * 3] = orbitRadius * Math.cos(theta);
        points[s * 3 + 1] = 0;
        points[s * 3 + 2] = orbitRadius * Math.sin(theta);
      }
      orbitGeo.setAttribute('position', new THREE.BufferAttribute(points, 3));
      const orbitMat = new THREE.LineBasicMaterial({
        color: 0x26262a, // --color-hairline
        transparent: true,
        opacity: 0.5,
      });
      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      planetGroup.add(orbitLine);

      // Planet Sphere
      const pGeo = new THREE.SphereGeometry(planet.radiusUnits, 16, 16);
      const pMat = new THREE.MeshStandardMaterial({
        color: planet.color,
        roughness: 0.7,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(orbitRadius, 0, 0);
      pMesh.userData = { name: planet.name, type: 'planet' };
      planetGroup.add(pMesh);
    });
    scene.add(planetGroup);

    // 6. Asteroid Belt Disk Representation (2.2 - 3.2 AU)
    const beltInner = auToSceneDistance(2.2);
    const beltOuter = auToSceneDistance(3.2);
    const beltCount = 600;
    const beltGeo = new THREE.BufferGeometry();
    const beltPos = new Float32Array(beltCount * 3);
    for (let b = 0; b < beltCount * 3; b += 3) {
      const r = beltInner + Math.random() * (beltOuter - beltInner);
      const theta = Math.random() * Math.PI * 2;
      beltPos[b] = r * Math.cos(theta);
      beltPos[b + 1] = (Math.random() - 0.5) * 1.5;
      beltPos[b + 2] = r * Math.sin(theta);
    }
    beltGeo.setAttribute('position', new THREE.BufferAttribute(beltPos, 3));
    const beltMat = new THREE.PointsMaterial({ color: 0x555560, size: 0.8, transparent: true, opacity: 0.4 });
    const asteroidBelt = new THREE.Points(beltGeo, beltMat);
    scene.add(asteroidBelt);

    // 7. Mouse Event Handlers for Drag / Orbit / Zoom
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDraggingRef.current = true;
        previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePositionRef.current.x;
        const deltaY = e.clientY - previousMousePositionRef.current.y;
        previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

        sphericalRef.current.theta -= deltaX * 0.006;
        sphericalRef.current.phi = Math.max(
          0.05,
          Math.min(Math.PI - 0.05, sphericalRef.current.phi - deltaY * 0.006)
        );
        updateCameraFromSpherical();
      }

      // Raycast for hover tooltips
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      const interactables: THREE.Object3D[] = [];
      candidateMeshesRef.current.forEach((mesh) => interactables.push(mesh));
      planetGroup.children.forEach((child) => {
        if (child.userData && child.userData.name) interactables.push(child);
      });

      const intersects = raycaster.intersectObjects(interactables, true);
      if (intersects.length > 0) {
        let top = intersects[0].object;
        while (top.parent && top.parent !== scene && top.parent !== planetGroup && !top.userData?.name) {
          top = top.parent;
        }
        setHoveredName(top.userData?.name || 'Solar System Object');
      } else {
        setHoveredName(null);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      sphericalRef.current.radius = Math.max(
        15,
        Math.min(450, sphericalRef.current.radius + e.deltaY * 0.12)
      );
      updateCameraFromSpherical();
    };

    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      const candidatesList: THREE.Object3D[] = [];
      candidateMeshesRef.current.forEach((mesh) => candidatesList.push(mesh));

      const intersects = raycaster.intersectObjects(candidatesList, true);
      if (intersects.length > 0) {
        let top = intersects[0].object;
        while (top.parent && !top.userData?.candidateId) {
          top = top.parent;
        }
        if (top.userData?.candidateId) {
          onSelectCandidate(top.userData.candidateId);
        }
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('click', handleClick);

    // 8. Resize Handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 9. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Slow orbital motion of planets for realism
      planetGroup.children.forEach((child) => {
        if (child.userData?.type === 'planet') {
          const pDef = PLANETS.find((p) => p.name === child.userData.name);
          if (pDef) {
            const angle = elapsedTime * 0.05 * pDef.speed;
            const r = auToSceneDistance(pDef.distanceAu);
            child.position.x = r * Math.cos(angle);
            child.position.z = r * Math.sin(angle);
          }
        }
      });

      // Subtle rotation for asteroid candidates
      candidateMeshesRef.current.forEach((mesh) => {
        mesh.rotation.y += delta * 0.4;
        mesh.rotation.x += delta * 0.2;
      });

      // Smooth camera interpolation towards selected candidate
      if (cameraDesiredPosRef.current) {
        cameraTargetRef.current.lerp(cameraDesiredPosRef.current, 0.05);
        updateCameraFromSpherical();
        if (cameraTargetRef.current.distanceTo(cameraDesiredPosRef.current) < 0.1) {
          cameraDesiredPosRef.current = null;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Candidates & Uncertainty Segments when candidates or timeEpochRatio change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old candidate meshes
    candidateMeshesRef.current.forEach((obj) => scene.remove(obj));
    candidateMeshesRef.current.clear();

    uncertaintySegmentsRef.current.forEach((seg) => scene.remove(seg));
    uncertaintySegmentsRef.current.clear();

    candidates.forEach((cand) => {
      // Determine coordinates from positions array and scrub ratio
      const posCount = cand.positions.length;
      let ra = cand.positions[0].ra;
      let dec = cand.positions[0].dec;

      if (posCount > 1) {
        // Interpolate along track
        const tIndex = timeEpochRatio * (posCount - 1);
        const lower = Math.floor(tIndex);
        const upper = Math.min(posCount - 1, lower + 1);
        const frac = tIndex - lower;

        ra = cand.positions[lower].ra + (cand.positions[upper].ra - cand.positions[lower].ra) * frac;
        dec = cand.positions[lower].dec + (cand.positions[upper].dec - cand.positions[lower].dec) * frac;
      }

      const isUnknown = cand.verdict === 'unknown';
      const isSelected = cand.id === selectedCandidateId;

      // Distance handling:
      // For known object (e.g. Ceres at ~2.77 AU)
      let nominalDistanceAu = 2.77;
      if (cand.distance_range) {
        // Dynamic uncertainty segment shrinking as time scrub / epochs advance
        const baseMin = cand.distance_range.min_au;
        const baseMax = cand.distance_range.max_au;
        // As observation baseline increases (scrubbing), parallax narrows bounds:
        const shrinkage = 0.45 * timeEpochRatio; // up to 45% bound tightening
        const currentMin = baseMin + (baseMax - baseMin) * (shrinkage / 2);
        const currentMax = baseMax - (baseMax - baseMin) * (shrinkage / 2);
        nominalDistanceAu = (currentMin + currentMax) / 2.0;

        // Render 3D Distance Uncertainty Segment along line of sight
        const pMin = radecToCartesian(ra, dec, currentMin);
        const pMax = radecToCartesian(ra, dec, currentMax);

        const segGeo = new THREE.BufferGeometry().setFromPoints([pMin, pMax]);
        const segMat = new THREE.LineBasicMaterial({
          color: 0xff6b3d, // --color-accent
          linewidth: 2,
          transparent: true,
          opacity: isSelected ? 0.95 : 0.65,
        });
        const segLine = new THREE.Line(segGeo, segMat);
        scene.add(segLine);
        uncertaintySegmentsRef.current.set(cand.id, segLine);
      }

      // 3D Cartesian position for candidate mesh
      const pos3d = radecToCartesian(ra, dec, nominalDistanceAu);

      // Create procedural noise-displaced icosahedron
      const geo = createProceduralAsteroidGeometry(
        isUnknown ? 1.4 : 1.1,
        2,
        cand.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
      );

      const color = isUnknown ? new THREE.Color(0xff6b3d) : colorIndexToAsteroidColor(cand.colour_index ?? 1.0);
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.8,
        metalness: 0.1,
        emissive: isSelected ? color : new THREE.Color(0x000000),
        emissiveIntensity: isSelected ? 0.35 : 0.0,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos3d);
      mesh.userData = {
        candidateId: cand.id,
        name: cand.match?.designation || cand.id,
        verdict: cand.verdict,
      };

      // Selection Marker Ring
      if (isSelected) {
        const ringGeo = new THREE.RingGeometry(2.0, 2.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xff6b3d,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.lookAt(cameraRef.current ? cameraRef.current.position : new THREE.Vector3(0, 1, 0));
        mesh.add(ringMesh);
      }

      scene.add(mesh);
      candidateMeshesRef.current.set(cand.id, mesh);
    });
  }, [candidates, selectedCandidateId, timeEpochRatio]);

  // Smooth camera zoom to selected candidate
  useEffect(() => {
    if (!selectedCandidateId) return;
    const mesh = candidateMeshesRef.current.get(selectedCandidateId);
    if (mesh) {
      cameraDesiredPosRef.current = mesh.position.clone();
      sphericalRef.current.radius = 45; // zoom in close
    }
  }, [selectedCandidateId]);

  const handleResetCamera = () => {
    cameraDesiredPosRef.current = new THREE.Vector3(0, 0, 0);
    sphericalRef.current = { radius: 140, theta: Math.PI / 4, phi: Math.PI / 3.2 };
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Canvas Badges (Honesty & Compliance) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--color-text-1)',
            backgroundColor: 'rgba(17, 17, 19, 0.85)',
            padding: '4px 8px',
            border: '1px solid var(--color-hairline)',
            borderRadius: '0px',
          }}
        >
          3D Model <strong>[Illustrative]</strong>
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#888899',
            backgroundColor: 'rgba(17, 17, 19, 0.75)',
            padding: '3px 8px',
            border: '1px solid var(--color-hairline)',
          }}
        >
          Scale: Inner ≤5 AU [linear] · Outer &gt;5 AU [log]
        </span>
      </div>

      {/* Hover Tooltip */}
      {hoveredName && (
        <div
          style={{
            position: 'absolute',
            bottom: 84,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: 'var(--color-text-1)',
            backgroundColor: 'var(--color-surface)',
            padding: '6px 12px',
            border: '1px solid var(--color-hairline)',
            pointerEvents: 'none',
          }}
        >
          {hoveredName}
        </div>
      )}

      {/* Camera Reset Control */}
      <button
        onClick={handleResetCamera}
        style={{
          position: 'absolute',
          bottom: 84,
          right: 20,
          fontFamily: 'monospace',
          fontSize: '11px',
          color: 'var(--color-text-1)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-hairline)',
          padding: '6px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Reset Camera
      </button>
    </div>
  );
};
