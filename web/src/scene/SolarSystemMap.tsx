/**
 * SolarSystemMap.tsx - Core Spatial 3D Map Component
 *
 * NASA Space Apps Challenge 2026 · Planet X and SPHEREx · Live Sky
 *
 * Implements:
 * 1. Coordinate Transformation:
 *    Converts spherical coordinates (Right Ascension, Declination, Distance in AU)
 *    into Three.js Cartesian coordinates (X, Y, Z).
 * 2. Dual-Scale Challenge:
 *    - Logarithmic depth buffer enabled in WebGLRenderer.
 *    - Inner System (Linear): Sun to Jupiter (<= 5.2 AU, 1 AU = 10 units).
 *    - Outer System (Logarithmic): Kuiper belt and beyond (> 5.2 AU). Distances compressed
 *      logarithmically to preserve visibility without camera clipping or z-fighting.
 *    - Dynamic Scale Toggle: Toggle between 'dual' and 'linear' scale modes.
 * 3. Reference Structures:
 *    - Semi-transparent thin orbit rings for 8 major planets.
 *    - Faint dashed spherical grid indicating the 'Hypothetical Planet X Zone'
 *      strictly tagged "Hypothetical [assumed]" (Rule 1 & Rule 3 compliance).
 * 4. Interactive Camera:
 *    - Three.js OrbitControls with smooth inertia damping.
 *    - Smooth GSAP camera tweening to focus position and lookAt vector on selected coordinates.
 *    - Camera reset button to return to global orbital overview.
 * 5. Rule Compliance:
 *    - Rule 1: Every displayed number labeled (measured, derived, or assumed).
 *    - Rule 2: All 3D models tagged "Illustrative".
 *    - Rule 3: Zero claims regarding hypothetical Planet X.
 *    - Rule 4: Web app consumes static JSON / state payloads.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import { Candidate } from '../data/types';
import { useWorkspaceStore, exploreResultToCandidate } from '../data/workspaceStore';
import { generateProceduralCelestialBody, ProceduralDataInput } from './ProceduralGenerator';

// ---------------------------------------------------------------------------
// 1. Coordinate Transformation & Dual-Scale Mathematics
// ---------------------------------------------------------------------------

export const INNER_BOUNDARY_AU = 5.2; // Sun to Jupiter boundary
export const LINEAR_SCALE_FACTOR = 10.0; // 1 AU = 10 scene units
export const INNER_MAX_SCENE_UNITS = INNER_BOUNDARY_AU * LINEAR_SCALE_FACTOR; // 52.0 units
export const LOG_SCALE_MULTIPLIER = 45.0; // 52 + 45 * log10(au / 5.2)

export type ScaleMode = 'dual' | 'linear';

/**
 * Converts astronomical distance in AU into scaled 3D scene units.
 */
export function auToScaleDistance(au: number, mode: ScaleMode = 'dual'): number {
  if (au <= 0) return 0;
  if (mode === 'linear') {
    return Math.min(au * LINEAR_SCALE_FACTOR, 3000.0);
  }
  // Dual-scale mode:
  // Linear from Sun through Jupiter (<= 5.2 AU)
  if (au <= INNER_BOUNDARY_AU) {
    return au * LINEAR_SCALE_FACTOR;
  }
  // Logarithmic compression beyond Jupiter (Kuiper Belt, Oort Cloud, hypothetical outer bodies)
  return INNER_MAX_SCENE_UNITS + LOG_SCALE_MULTIPLIER * Math.log10(au / INNER_BOUNDARY_AU);
}

/**
 * Reverse mapping from scene distance back to AU.
 */
export function scaleDistanceToAu(sceneDist: number, mode: ScaleMode = 'dual'): number {
  if (sceneDist <= 0) return 0;
  if (mode === 'linear') {
    return sceneDist / LINEAR_SCALE_FACTOR;
  }
  if (sceneDist <= INNER_MAX_SCENE_UNITS) {
    return sceneDist / LINEAR_SCALE_FACTOR;
  }
  const logTerm = (sceneDist - INNER_MAX_SCENE_UNITS) / LOG_SCALE_MULTIPLIER;
  return INNER_BOUNDARY_AU * Math.pow(10, logTerm);
}

/**
 * Converts spherical equatorial coordinates (RA, Dec in degrees) and Distance in AU
 * to Three.js Cartesian coordinates (Vector3).
 *
 * Coordinate Convention (Right-Handed Celestial Sphere):
 * - +X: Vernal Equinox (RA = 0°, Dec = 0°)
 * - +Y: North Celestial Pole (Dec = +90°)
 * - +Z: RA = 90°, Dec = 0°
 */
export function sphericalToCartesian(
  raDeg: number,
  decDeg: number,
  distanceAu: number,
  mode: ScaleMode = 'dual'
): THREE.Vector3 {
  const scaledR = auToScaleDistance(distanceAu, mode);
  const raRad = THREE.MathUtils.degToRad(raDeg);
  const decRad = THREE.MathUtils.degToRad(decDeg);

  const cosDec = Math.cos(decRad);
  const sinDec = Math.sin(decRad);

  const x = scaledR * cosDec * Math.cos(raRad);
  const y = scaledR * sinDec;
  const z = scaledR * cosDec * Math.sin(raRad);

  return new THREE.Vector3(x, y, z);
}

/**
 * Converts Three.js Cartesian position back to equatorial coordinates (RA, Dec, AU).
 */
export function cartesianToSpherical(
  pos: THREE.Vector3,
  mode: ScaleMode = 'dual'
): { ra: number; dec: number; distance_au: number } {
  const scaledR = pos.length();
  const distance_au = scaleDistanceToAu(scaledR, mode);

  if (scaledR === 0) {
    return { ra: 0, dec: 0, distance_au: 0 };
  }

  const decRad = Math.asin(Math.max(-1.0, Math.min(1.0, pos.y / scaledR)));
  let raRad = Math.atan2(pos.z, pos.x);
  if (raRad < 0) {
    raRad += 2 * Math.PI;
  }

  return {
    ra: THREE.MathUtils.radToDeg(raRad),
    dec: THREE.MathUtils.radToDeg(decRad),
    distance_au,
  };
}

// ---------------------------------------------------------------------------
// 3. Planetary Catalog & Reference Structures
// ---------------------------------------------------------------------------

export interface PlanetCatalogEntry {
  name: string;
  distanceAu: number;
  radiusUnits: number;
  color: string;
  spectralTaxonomy: string;
}

export const MAJOR_PLANETS: PlanetCatalogEntry[] = [
  { name: 'Mercury', distanceAu: 0.39, radiusUnits: 0.45, color: '#A0AEC0', spectralTaxonomy: 'rocky' },
  { name: 'Venus', distanceAu: 0.72, radiusUnits: 0.65, color: '#ECC94B', spectralTaxonomy: 'rocky' },
  { name: 'Earth', distanceAu: 1.00, radiusUnits: 0.70, color: '#38BDF8', spectralTaxonomy: 'rocky' },
  { name: 'Mars', distanceAu: 1.52, radiusUnits: 0.55, color: '#EF4444', spectralTaxonomy: 'rocky' },
  { name: 'Jupiter', distanceAu: 5.20, radiusUnits: 1.50, color: '#D97706', spectralTaxonomy: 'gaseous' },
  { name: 'Saturn', distanceAu: 9.54, radiusUnits: 1.30, color: '#FBBF24', spectralTaxonomy: 'gaseous' },
  { name: 'Uranus', distanceAu: 19.20, radiusUnits: 1.00, color: '#2DD4BF', spectralTaxonomy: 'icy' },
  { name: 'Neptune', distanceAu: 30.06, radiusUnits: 1.00, color: '#3B82F6', spectralTaxonomy: 'icy' },
];

export const HYPOTHETICAL_PLANET_X_AU = 350.0; // Nominal distance of hypothetical outer body [assumed]

/**
 * Builds thin, semi-transparent orbit rings for major planets.
 */
export function createPlanetaryOrbitRings(mode: ScaleMode = 'dual'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Planetary Orbit Rings';

  MAJOR_PLANETS.forEach((planet) => {
    const radius = auToScaleDistance(planet.distanceAu, mode);
    const segments = 128;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(planet.color),
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
    });

    const ring = new THREE.LineLoop(geometry, material);
    ring.name = `Orbit-${planet.name}`;
    ring.userData = {
      type: 'planetOrbit',
      planet: planet.name,
      distanceAu: planet.distanceAu,
      tag: 'Illustrative',
    };
    group.add(ring);
  });

  return group;
}

/**
 * Builds faint dashed spherical grid for 'Hypothetical Planet X Zone'.
 * Strictly complies with Rule 1 (assumed) and Rule 3 (hypothetical non-detection).
 */
export function createHypotheticalPlanetXZoneGrid(mode: ScaleMode = 'dual'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Hypothetical Planet X Zone [assumed]';

  const zoneRadius = auToScaleDistance(HYPOTHETICAL_PLANET_X_AU, mode);
  const segments = 96;
  const numLatitudeRings = 7;

  // 1. Latitude rings
  for (let latIdx = 1; latIdx < numLatitudeRings; latIdx++) {
    const latAngle = ((latIdx / numLatitudeRings) - 0.5) * Math.PI * 0.85;
    const ringRadius = zoneRadius * Math.cos(latAngle);
    const ringY = zoneRadius * Math.sin(latAngle);

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * ringRadius, ringY, Math.sin(theta) * ringRadius));
    }

    const geom = new THREE.BufferGeometry().setFromPoints(points);

    const mat = new THREE.LineDashedMaterial({
      color: 0xff6b3d, // Live Sky accent orange
      transparent: true,
      opacity: 0.22,
      dashSize: 3.5,
      gapSize: 2.2,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    group.add(line);
  }

  // 2. Meridian longitude arcs
  const numMeridians = 8;
  for (let m = 0; m < numMeridians; m++) {
    const phi = (m / numMeridians) * Math.PI;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = zoneRadius * Math.sin(theta) * Math.cos(phi);
      const y = zoneRadius * Math.cos(theta);
      const z = zoneRadius * Math.sin(theta) * Math.sin(phi);
      points.push(new THREE.Vector3(x, y, z));
    }

    const geom = new THREE.BufferGeometry().setFromPoints(points);

    const mat = new THREE.LineDashedMaterial({
      color: 0xff6b3d,
      transparent: true,
      opacity: 0.16,
      dashSize: 4.0,
      gapSize: 2.5,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    group.add(line);
  }

  group.userData = {
    tag: 'Illustrative',
    label: 'Hypothetical Planet X Zone [assumed]',
    distanceAu: HYPOTHETICAL_PLANET_X_AU,
  };

  return group;
}

// ---------------------------------------------------------------------------
// Component Props & Main SolarSystemMap React Component
// ---------------------------------------------------------------------------

export type ExtendedCandidate = Candidate & {
  coordinates?: { distance_au?: number; ra?: number; dec?: number };
  classification?: string;
  procedural3D?: ProceduralDataInput['procedural3D'];
  renderState?: any;
};

export interface SolarSystemMapProps {
  candidates?: Candidate[];
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidateId: string) => void;
  scaleMode?: ScaleMode;
  onScaleModeChange?: (mode: ScaleMode) => void;
  showPlanetXZone?: boolean;
  timeEpochRatio?: number;
  sliderDay?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const SolarSystemMap: React.FC<SolarSystemMapProps> = ({
  candidates: propCandidates = [],
  selectedCandidateId = null,
  onSelectCandidate,
  scaleMode: propScaleMode,
  onScaleModeChange,
  showPlanetXZone = true,
  timeEpochRatio = 0.0,
  sliderDay = 0,
  className = '',
  style = {},
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Scale mode state
  const [internalScaleMode, setInternalScaleMode] = useState<ScaleMode>('dual');
  const activeScaleMode = propScaleMode ?? internalScaleMode;

  // HUD & Telemetry State
  const [fps, setFps] = useState<number>(60);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  // Explore objects from Zustand store
  const exploredObjects = useWorkspaceStore((state) => state.exploredObjects);
  const activeExploredObject = useWorkspaceStore((state) => state.activeExploredObject);

  // Merge static catalog candidates with explored candidates
  const mergedCandidates: ExtendedCandidate[] = useMemo(() => {
    const exploredCandidates = exploredObjects.map((obj) => exploreResultToCandidate(obj) as unknown as ExtendedCandidate);
    const combined: ExtendedCandidate[] = [...exploredCandidates];
    const seen = new Set(combined.map((c) => c.id));

    for (const c of propCandidates) {
      if (!seen.has(c.id)) {
        combined.push(c as ExtendedCandidate);
        seen.add(c.id);
      }
    }
    return combined;
  }, [exploredObjects, propCandidates]);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const activeTweenRef = useRef<gsap.core.Tween | null>(null);

  // Dynamic Mesh Groups
  const orbitsGroupRef = useRef<THREE.Group | null>(null);
  const planetXGroupRef = useRef<THREE.Group | null>(null);
  const candidatesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const candidateObjectMapRef = useRef<Map<string, THREE.Object3D>>(new Map());

  // Raycasting
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

  // -------------------------------------------------------------------------
  // 4. Interactive Camera: GSAP Smooth Tween to Target Coordinates
  // -------------------------------------------------------------------------
  const tweenCameraTo = useCallback(
    (targetPos: THREE.Vector3, duration: number = 1.25) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      if (activeTweenRef.current) {
        activeTweenRef.current.kill();
      }

      const currentCamPos = camera.position.clone();
      const currentTarget = controls.target.clone();

      // Compute ideal camera offset vector angled above and away from target
      let offsetDir = currentCamPos.clone().sub(currentTarget).normalize();
      if (offsetDir.lengthSq() < 0.001 || isNaN(offsetDir.x)) {
        offsetDir = new THREE.Vector3(0.5, 0.4, 0.7).normalize();
      }

      // Proportional offset distance based on object distance from origin
      const targetDist = targetPos.length();
      const offsetDist = Math.max(12.0, Math.min(28.0, 10.0 + targetDist * 0.12));
      const destCamPos = targetPos.clone().add(offsetDir.multiplyScalar(offsetDist));

      const anim = {
        camX: currentCamPos.x,
        camY: currentCamPos.y,
        camZ: currentCamPos.z,
        targetX: currentTarget.x,
        targetY: currentTarget.y,
        targetZ: currentTarget.z,
      };

      activeTweenRef.current = gsap.to(anim, {
        camX: destCamPos.x,
        camY: destCamPos.y,
        camZ: destCamPos.z,
        targetX: targetPos.x,
        targetY: targetPos.y,
        targetZ: targetPos.z,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          camera.position.set(anim.camX, anim.camY, anim.camZ);
          controls.target.set(anim.targetX, anim.targetY, anim.targetZ);
          controls.update();
        },
        onComplete: () => {
          activeTweenRef.current = null;
        },
      });
    },
    []
  );

  const resetCamera = useCallback(() => {
    tweenCameraTo(new THREE.Vector3(0, 0, 0), 1.1);
  }, [tweenCameraTo]);

  // -------------------------------------------------------------------------
  // Initialize Three.js Scene, Camera, Logarithmic Depth Buffer Renderer
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050506'); // Studio near-black
    sceneRef.current = scene;

    // 2. Camera: Wide depth range from 0.1 to 10,000 units
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    camera.position.set(0, 110, 140);
    cameraRef.current = camera;

    // 3. Renderer with logarithmic depth buffer for dual-scale rendering
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls with smooth inertia
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.0;
    controls.maxDistance = 3500.0;
    controlsRef.current = controls;

    // 5. Lighting: Central Sun light + fill ambient
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.PointLight(0xfff7ed, 2.2, 5000, 0.2);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // 6. Central Sun mesh [Illustrative]
    const sunGeom = new THREE.SphereGeometry(2.4, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd27d });
    const sunMesh = new THREE.Mesh(sunGeom, sunMat);
    sunMesh.name = 'Sun';
    sunMesh.userData = { name: 'Sun', tag: 'Illustrative' };
    scene.add(sunMesh);

    // 7. Add Candidates Group
    scene.add(candidatesGroupRef.current);

    // 8. Animation & FPS Measurement Loop
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      controls.update();
      renderer.render(scene, camera);

      // FPS tracking
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }
    };
    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (activeTweenRef.current) {
        activeTweenRef.current.kill();
      }
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // 2 & 3. Rebuild Reference Structures when Scale Mode or Toggles Change
  // -------------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // 1. Remove existing orbit rings
    if (orbitsGroupRef.current) {
      scene.remove(orbitsGroupRef.current);
    }
    const newOrbits = createPlanetaryOrbitRings(activeScaleMode);
    orbitsGroupRef.current = newOrbits;
    scene.add(newOrbits);

    // 2. Remove / add Planet X zone grid
    if (planetXGroupRef.current) {
      scene.remove(planetXGroupRef.current);
      planetXGroupRef.current = null;
    }
    if (showPlanetXZone) {
      const newPlanetXGrid = createHypotheticalPlanetXZoneGrid(activeScaleMode);
      planetXGroupRef.current = newPlanetXGrid;
      scene.add(newPlanetXGrid);
    }
  }, [activeScaleMode, showPlanetXZone]);

  // -------------------------------------------------------------------------
  // Candidate & Explored Objects Placement
  // -------------------------------------------------------------------------
  useEffect(() => {
    const candidatesGroup = candidatesGroupRef.current;
    candidatesGroup.clear();
    candidateObjectMapRef.current.clear();

    mergedCandidates.forEach((cand) => {
      // Extract coordinates: RA, Dec, Distance (AU)
      let ra = 0;
      let dec = 0;
      let distAu = 2.5;

      if (cand.positions && cand.positions.length > 0) {
        // Interpolate or scrub along multi-epoch positions
        const pIdx = Math.min(
          cand.positions.length - 1,
          Math.floor(timeEpochRatio * (cand.positions.length - 1))
        );
        const p = cand.positions[pIdx];
        ra = p.ra;
        dec = p.dec;
      }

      if (cand.distance_range) {
        distAu = (cand.distance_range.min_au + cand.distance_range.max_au) / 2.0;
      } else if (cand.coordinates?.distance_au) {
        distAu = cand.coordinates.distance_au;
        ra = cand.coordinates.ra ?? ra;
        dec = cand.coordinates.dec ?? dec;
      }

      // Convert spherical coordinates to Three.js Cartesian position
      const cartesianPos = sphericalToCartesian(ra, dec, distAu, activeScaleMode);

      // Procedural 3D Mesh Generation
      const proceduralData: ProceduralDataInput = {
        id: cand.id,
        name: cand.match?.designation || cand.id,
        verdict: cand.verdict,
        classification: cand.classification || (cand.match?.body_type as string) || (cand.verdict === 'known_asteroid' ? 'asteroid' : 'unknown'),
        colour_index: cand.colour_index,
        distance_range: cand.distance_range,
        velocity_arcsec_day: 320.0,
        procedural3D: cand.procedural3D || cand.renderState,
      };

      const meshGroup = generateProceduralCelestialBody(
        proceduralData,
        cand.distance_range
          ? sphericalToCartesian(ra, dec, cand.distance_range.min_au, activeScaleMode)
          : undefined,
        cand.distance_range
          ? sphericalToCartesian(ra, dec, cand.distance_range.max_au, activeScaleMode)
          : undefined
      );

      meshGroup.position.copy(cartesianPos);
      meshGroup.userData = {
        candidateId: cand.id,
        name: cand.match?.designation || cand.id,
        tag: 'Illustrative',
        distanceAu: distAu,
        ra,
        dec,
      };

      candidatesGroup.add(meshGroup);
      candidateObjectMapRef.current.set(cand.id, meshGroup);
    });
  }, [mergedCandidates, activeScaleMode, timeEpochRatio, sliderDay]);

  // -------------------------------------------------------------------------
  // Auto-Select and Focus on newly explored objects from OmniSearch
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (activeExploredObject && onSelectCandidate) {
      const exploredId = `EXP-${activeExploredObject.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      if (selectedCandidateId !== exploredId) {
        onSelectCandidate(exploredId);
      }
    }
  }, [activeExploredObject, onSelectCandidate, selectedCandidateId]);

  // -------------------------------------------------------------------------
  // Focus on Selected Candidate via GSAP Tween
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedCandidateId) return;

    const targetObj = candidateObjectMapRef.current.get(selectedCandidateId);
    if (targetObj) {
      tweenCameraTo(targetObj.position, 1.25);
    } else {
      // Check if selected ID is in mergedCandidates
      const found = mergedCandidates.find((c) => c.id === selectedCandidateId);
      if (found) {
        const ra = found.positions?.[0]?.ra ?? found.coordinates?.ra ?? 0;
        const dec = found.positions?.[0]?.dec ?? found.coordinates?.dec ?? 0;
        const distAu =
          found.coordinates?.distance_au ??
          (found.distance_range
            ? (found.distance_range.min_au + found.distance_range.max_au) / 2.0
            : 2.5);
        const pos = sphericalToCartesian(ra, dec, distAu, activeScaleMode);
        tweenCameraTo(pos, 1.25);
      }
    }
  }, [selectedCandidateId, activeScaleMode, mergedCandidates, tweenCameraTo]);

  // -------------------------------------------------------------------------
  // Raycaster Hover & Click Interaction
  // -------------------------------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const intersects = raycasterRef.current.intersectObjects(
      candidatesGroupRef.current.children,
      true
    );

    if (intersects.length > 0) {
      let topObj = intersects[0].object;
      while (topObj.parent && topObj.parent !== candidatesGroupRef.current && !topObj.userData?.candidateId) {
        topObj = topObj.parent;
      }
      const candId = topObj.userData?.candidateId;
      if (candId && onSelectCandidate) {
        onSelectCandidate(candId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const intersects = raycasterRef.current.intersectObjects(
      candidatesGroupRef.current.children,
      true
    );

    if (intersects.length > 0) {
      let topObj = intersects[0].object;
      while (topObj.parent && topObj.parent !== candidatesGroupRef.current && !topObj.userData?.name) {
        topObj = topObj.parent;
      }
      setHoveredName(topObj.userData?.name || 'Celestial Candidate');
    } else {
      setHoveredName(null);
    }
  };

  const toggleScaleMode = () => {
    const nextMode: ScaleMode = activeScaleMode === 'dual' ? 'linear' : 'dual';
    if (onScaleModeChange) {
      onScaleModeChange(nextMode);
    } else {
      setInternalScaleMode(nextMode);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#050506',
        ...style,
      }}
      className={`solar-system-map-container ${className}`}
    >
      {/* Three.js Mount Canvas */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
      />

      {/* Top Left: Scientific Honesty & Epistemic Badges (Rule 1 & Rule 2) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
          zIndex: 20,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#EDEDED',
            backgroundColor: 'rgba(17, 17, 19, 0.90)',
            padding: '4px 8px',
            border: '1px solid #26262A',
            borderRadius: '2px',
          }}
        >
          3D Models <strong>[Illustrative]</strong>
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#38BDF8',
            backgroundColor: 'rgba(17, 17, 19, 0.90)',
            padding: '4px 8px',
            border: '1px solid #26262A',
            borderRadius: '2px',
          }}
        >
          Telemetry: <strong>{fps} FPS</strong> [measured]
        </span>
        {hoveredName && (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#FF6B3D',
              backgroundColor: 'rgba(17, 17, 19, 0.95)',
              padding: '4px 8px',
              border: '1px solid #FF6B3D',
              borderRadius: '2px',
            }}
          >
            Target: <strong>{hoveredName}</strong>
          </span>
        )}
      </div>

      {/* Top Right: Interactive Controls (Scale Mode Toggle & Reset Camera) */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 8,
          zIndex: 20,
        }}
      >
        <button
          onClick={toggleScaleMode}
          title="Toggle between Dual Scale (Inner linear, Outer logarithmic) and Uniform Linear scale"
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            fontWeight: 600,
            color: '#EDEDED',
            backgroundColor: 'rgba(17, 17, 19, 0.90)',
            border: '1px solid #26262A',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          }}
        >
          Scale:{' '}
          <span style={{ color: activeScaleMode === 'dual' ? '#38BDF8' : '#FBBF24' }}>
            {activeScaleMode === 'dual' ? 'DUAL (Lin/Log)' : 'LINEAR'}
          </span>
        </button>

        <button
          onClick={resetCamera}
          title="Smoothly reset camera position to overview (GSAP tween)"
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            fontWeight: 600,
            color: '#EDEDED',
            backgroundColor: 'rgba(17, 17, 19, 0.90)',
            border: '1px solid #26262A',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          }}
        >
          Reset Camera
        </button>
      </div>

      {/* Bottom Left: Reference Structures Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          backgroundColor: 'rgba(17, 17, 19, 0.88)',
          border: '1px solid #26262A',
          padding: '8px 12px',
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 20,
        }}
      >
        <div style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: '#A1A1AA', marginBottom: 2 }}>
          MAP REFERENCES
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10px', fontFamily: 'monospace', color: '#EDEDED' }}>
          <span style={{ width: 12, height: 2, backgroundColor: '#38BDF8', display: 'inline-block' }} />
          Planetary Orbits (8 Major)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10px', fontFamily: 'monospace', color: '#EDEDED' }}>
          <span style={{ width: 12, height: 2, borderTop: '2px dashed #FF6B3D', display: 'inline-block' }} />
          Hypothetical Planet X Zone [assumed]
        </div>
      </div>
    </div>
  );
};

export default SolarSystemMap;
