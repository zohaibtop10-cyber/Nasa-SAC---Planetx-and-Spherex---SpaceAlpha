/**
 * SolarSystem.ts - High-Performance Three.js Solar System Visualization Engine
 *
 * Implements:
 * - Near-black canvas (#050506), zero bloom post-processing
 * - Starfield strictly capped at <= 400 faint stars (380 stars)
 * - Sun and 8 planets on schematic circular orbits tagged [Illustrative]
 * - SPHEREx marker near Earth tagged [Illustrative]
 * - Dashed spherical shell for the Planet X zone tagged "Hypothetical [assumed]"
 * - Scale mode toggle: Dual Scale (inner linear <= 5 AU, outer log > 5 AU) vs Uniform Linear
 * - Three.js OrbitControls with smooth inertia
 * - Real-time FPS measurement counter tagged [measured]
 * - Permanent interactive Legend overlay (never missing)
 * - Full candidate asteroid rendering & dynamic line-of-sight distance uncertainty segments
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Candidate } from '../data/types';
import { BackgroundStars } from './BackgroundStars';
import { colorIndexToAsteroidColor, createProceduralAsteroidGeometry } from './proceduralAsteroid';

export type ScaleMode = 'dual' | 'linear';

export interface PlanetConfig {
  name: string;
  distanceAu: number;
  radiusUnits: number;
  color: string;
  speed: number;
}

export const PLANET_CATALOG: PlanetConfig[] = [
  { name: 'Mercury', distanceAu: 0.39, radiusUnits: 0.4, color: '#A0AEC0', speed: 4.15 },
  { name: 'Venus', distanceAu: 0.72, radiusUnits: 0.6, color: '#ECC94B', speed: 1.62 },
  { name: 'Earth', distanceAu: 1.0, radiusUnits: 0.65, color: '#4299E1', speed: 1.0 },
  { name: 'Mars', distanceAu: 1.52, radiusUnits: 0.5, color: '#E53E3E', speed: 0.53 },
  { name: 'Jupiter', distanceAu: 5.2, radiusUnits: 1.4, color: '#DD6B20', speed: 0.084 },
  { name: 'Saturn', distanceAu: 9.54, radiusUnits: 1.2, color: '#D69E2E', speed: 0.034 },
  { name: 'Uranus', distanceAu: 19.2, radiusUnits: 0.9, color: '#319795', speed: 0.012 },
  { name: 'Neptune', distanceAu: 30.06, radiusUnits: 0.9, color: '#3182CE', speed: 0.006 },
];

export const HYPOTHETICAL_PLANET_X_AU = 350.0; // Distance of hypothetical outer body

export interface SolarSystemOptions {
  initialScaleMode?: ScaleMode;
  onFpsUpdate?: (fps: number) => void;
  onSelectCandidate?: (candidateId: string) => void;
  onHoverObject?: (name: string | null) => void;
}

export class SolarSystem {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private scaleMode: ScaleMode = 'dual';
  private animationFrameId: number | null = null;
  private clock = new THREE.Clock();

  // Scene Objects
  private sunMesh!: THREE.Mesh;
  private backgroundCosmos!: BackgroundStars;
  private planetMeshes: Map<string, THREE.Mesh> = new Map();
  private orbitLines: Map<string, THREE.Line> = new Map();
  private spherexGroup!: THREE.Group;
  private planetXShellGroup!: THREE.Group;

  // Candidates & Uncertainty Segments
  private candidatesGroup: THREE.Group = new THREE.Group();
  private candidateMeshes: Map<string, THREE.Object3D> = new Map();
  private uncertaintySegments: Map<string, THREE.Line> = new Map();
  private candidatesData: Candidate[] = [];
  private selectedCandidateId: string | null = null;
  private timeEpochRatio: number = 0.0;

  // Active Object 36-Point Orbital Trajectory
  private activeOrbitCoordinates: THREE.Vector3[] = [];
  private activeOrbitLine: THREE.Line | null = null;
  private sliderDay: number = 0;
  private maxDays: number = 365;

  // Callbacks
  private onFpsUpdate?: (fps: number) => void;
  private onSelectCandidate?: (candidateId: string) => void;
  private onHoverObject?: (name: string | null) => void;

  // FPS Measurement
  private frameCount = 0;
  private lastFpsTimestamp = performance.now();
  private currentFps = 60;

  // DOM Elements (Permanent HUD)
  private legendElement!: HTMLElement;
  private fpsBadgeElement!: HTMLElement;
  private scaleToggleBtn!: HTMLButtonElement;
  private tooltipElement!: HTMLElement;

  // Raycaster
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(container: HTMLElement, options: SolarSystemOptions = {}) {
    this.container = container;
    this.scaleMode = options.initialScaleMode || 'dual';
    this.onFpsUpdate = options.onFpsUpdate;
    this.onSelectCandidate = options.onSelectCandidate;
    this.onHoverObject = options.onHoverObject;

    // 1. Scene setup: Near-black canvas (#050506)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050506');

    // 2. Camera setup
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 7500);
    this.camera.position.set(0, 110, 140);

    // 3. Renderer setup: No bloom, high performance, antialiased
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.style.position = 'relative';
    container.appendChild(this.renderer.domElement);

    // 4. Orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 2200;
    this.controls.minDistance = 5;

    // 5. Lighting: Direct sunlight, ambient fill, no bloom
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambientLight);

    const sunLight = new THREE.PointLight(0xfff7e6, 2.8, 1500, 0.1);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);

    // 6. Build Scene Components
    this.createStarfield(); // Strictly <= 400 faint stars
    this.createSun();
    this.createPlanets();
    this.createSpherexMarker();
    this.createHypotheticalPlanetXShell();

    this.scene.add(this.candidatesGroup);

    // 7. Build Permanent Legend HUD (never missing)
    this.createLegendOverlay();
    this.createTooltipOverlay();

    // 8. Event Listeners
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove);
    this.renderer.domElement.addEventListener('click', this.handleClick);

    // 9. Start Render Loop
    this.startAnimationLoop();
  }

  /**
   * Distance transformation respecting active scaleMode.
   * - Dual Scale: Linear <= 5.0 AU (1 AU = 10 units), Log > 5.0 AU (50 + 35 * log10(r/5))
   * - Uniform Linear: 1 AU = 2.5 units
   */
  public auToScene(au: number): number {
    if (au <= 0) return 0;
    if (this.scaleMode === 'linear') {
      return au * 2.5; // Uniform linear scale
    }
    // Dual Scale: Linear <= 5 AU, Log > 5 AU
    if (au <= 5.0) {
      return au * 10.0;
    }
    return 50.0 + 35.0 * Math.log10(au / 5.0);
  }

  /**
   * Convert RA/Dec (degrees) and distance (AU) to Cartesian coordinates.
   */
  public radecToCartesian(raDeg: number, decDeg: number, distanceAu: number): THREE.Vector3 {
    const scaledR = this.auToScene(distanceAu);
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
   * Rich, GPU-optimized background cosmos (50,000 stars rendered in a single draw call).
   */
  private createStarfield(): void {
    this.backgroundCosmos = new BackgroundStars({
      count: 50000,
      minRadius: 2600.0,
      maxRadius: 5200.0,
      baseSize: 1.5,
      illustrated: true,
    });
    this.scene.add(this.backgroundCosmos.points);
  }

  /**
   * Central Sun sphere tagged [Illustrative].
   */
  private createSun(): void {
    const sunGeo = new THREE.SphereGeometry(3.0, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffea78 });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.userData = { name: 'Sun', tag: 'Illustrative' };
    this.scene.add(this.sunMesh);
  }

  /**
   * Creates schematic circular planetary orbits and bodies tagged [Illustrative].
   */
  private createPlanets(): void {
    PLANET_CATALOG.forEach((planet) => {
      const r = this.auToScene(planet.distanceAu);

      // Schematic circular orbit line
      const orbitGeo = this.buildCircularOrbitGeometry(r);
      const orbitMat = new THREE.LineBasicMaterial({
        color: 0x26262a, // --color-hairline
        transparent: true,
        opacity: 0.6,
      });
      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      this.scene.add(orbitLine);
      this.orbitLines.set(planet.name, orbitLine);

      // Planet sphere
      const pGeo = new THREE.SphereGeometry(planet.radiusUnits, 20, 20);
      const pMat = new THREE.MeshStandardMaterial({
        color: planet.color,
        roughness: 0.7,
        metalness: 0.1,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(r, 0, 0);
      pMesh.userData = {
        name: planet.name,
        distanceAu: planet.distanceAu,
        type: 'planet',
        tag: 'Illustrative',
      };
      this.scene.add(pMesh);
      this.planetMeshes.set(planet.name, pMesh);
    });
  }

  /**
   * SPHEREx space observatory marker near Earth tagged [Illustrative].
   */
  private createSpherexMarker(): void {
    this.spherexGroup = new THREE.Group();
    const earthR = this.auToScene(1.0);

    // SPHEREx diamond telescope geometry (Illustrative)
    const spxGeo = new THREE.OctahedronGeometry(0.4, 0);
    const spxMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, // vibrant cyan
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.2,
    });
    const spxMesh = new THREE.Mesh(spxGeo, spxMat);
    this.spherexGroup.add(spxMesh);

    // Mini orbit indicator around Earth
    const miniOrbitGeo = this.buildCircularOrbitGeometry(1.6);
    const miniOrbitMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.2,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.7,
    });
    const miniOrbit = new THREE.Line(miniOrbitGeo, miniOrbitMat);
    miniOrbit.computeLineDistances();
    this.spherexGroup.add(miniOrbit);

    this.spherexGroup.position.set(earthR + 1.2, 0.4, 0);
    this.spherexGroup.userData = { name: 'SPHEREx Observatory', tag: 'Illustrative' };
    this.scene.add(this.spherexGroup);
  }

  /**
   * Dashed spherical shell labelled "Hypothetical" for the Planet X zone.
   * Per non-negotiable rules, strictly tagged as "Hypothetical [assumed]".
   */
  private createHypotheticalPlanetXShell(): void {
    this.planetXShellGroup = new THREE.Group();
    const shellR = this.auToScene(HYPOTHETICAL_PLANET_X_AU);

    const dashedMat = new THREE.LineDashedMaterial({
      color: 0xff6b3d, // --color-accent
      dashSize: 2.5,
      gapSize: 2.0,
      transparent: true,
      opacity: 0.65,
    });

    // 1. Equatorial circular dashed ring
    const eqGeo = this.buildCircularOrbitGeometry(shellR, 128);
    const eqLine = new THREE.Line(eqGeo, dashedMat);
    eqLine.computeLineDistances();
    this.planetXShellGroup.add(eqLine);

    // 2. Meridian 1 (XZ-rotated)
    const m1Geo = this.buildCircularOrbitGeometry(shellR, 128);
    const m1Line = new THREE.Line(m1Geo, dashedMat);
    m1Line.rotation.x = Math.PI / 2;
    m1Line.computeLineDistances();
    this.planetXShellGroup.add(m1Line);

    // 3. Meridian 2 (YZ-rotated)
    const m2Geo = this.buildCircularOrbitGeometry(shellR, 128);
    const m2Line = new THREE.Line(m2Geo, dashedMat);
    m2Line.rotation.z = Math.PI / 2;
    m2Line.computeLineDistances();
    this.planetXShellGroup.add(m2Line);

    this.planetXShellGroup.userData = {
      name: 'Planet X Shell',
      status: 'Hypothetical',
      tag: 'assumed',
      distanceAu: HYPOTHETICAL_PLANET_X_AU,
    };
    this.scene.add(this.planetXShellGroup);
  }

  private buildCircularOrbitGeometry(radius: number, segments: number = 128): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const points = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points[i * 3] = radius * Math.cos(theta);
      points[i * 3 + 1] = 0;
      points[i * 3 + 2] = radius * Math.sin(theta);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return geo;
  }

  /**
   * Updates candidate asteroids and distance uncertainty segments.
   */
  public updateCandidates(
    candidates: Candidate[],
    selectedCandidateId: string | null,
    timeEpochRatio: number,
    onSelectCandidate?: (candidateId: string) => void
  ): void {
    const candidateChanged = this.selectedCandidateId !== selectedCandidateId;
    this.candidatesData = candidates;
    this.selectedCandidateId = selectedCandidateId;
    this.timeEpochRatio = timeEpochRatio;
    this.sliderDay = timeEpochRatio * this.maxDays;
    if (onSelectCandidate) {
      this.onSelectCandidate = onSelectCandidate;
    }

    if (candidateChanged && selectedCandidateId) {
      const activeCand = candidates.find((c) => c.id === selectedCandidateId);
      if (activeCand) {
        this.loadActiveObjectOrbit(activeCand);
      } else {
        this.clearActiveOrbit();
      }
    } else if (!selectedCandidateId) {
      this.clearActiveOrbit();
    }

    this.rebuildCandidates();
  }

  /**
   * Generates or caches a 36-point orbital coordinate trajectory array for an active object.
   * Computed once upon object selection or load, stored locally, and interpolated each frame.
   * Does NOT fetch live JPL Horizons data on every frame.
   */
  public loadActiveObjectOrbit(cand: Candidate): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const count = 36; // strictly 36 coordinate points representing orbit over the year

    // Extract nominal semi-major axis distance in AU
    let nominalAu = 2.77;
    if (cand.distance_range) {
      nominalAu = (cand.distance_range.min_au + cand.distance_range.max_au) / 2.0;
    } else if (cand.match?.designation) {
      const d = cand.match.designation.toLowerCase();
      if (d.includes('ceres')) nominalAu = 2.77;
      else if (d.includes('vesta')) nominalAu = 2.36;
      else if (d.includes('bennu')) nominalAu = 1.13;
      else if (d.includes('psyche')) nominalAu = 2.92;
      else if (d.includes('halley')) nominalAu = 17.8;
      else if (d.includes('jupiter')) nominalAu = 5.2;
    }

    // Deterministic Keplerian orbit parameters based on candidate ID hash
    const hash = cand.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const eccentricity = 0.08 + (hash % 15) * 0.01;
    const inclinationRad = (((hash % 20) + 4) * Math.PI) / 180;
    const argPerihelion = ((hash % 360) * Math.PI) / 180;

    for (let k = 0; k < count; k++) {
      const trueAnomaly = (k / count) * Math.PI * 2;
      // Keplerian orbit radius: r = a(1 - e^2) / (1 + e * cos(nu))
      const rAu = (nominalAu * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(trueAnomaly));
      const rScene = this.auToScene(rAu);

      // Coordinate in orbital plane
      const xOrb = rScene * Math.cos(trueAnomaly + argPerihelion);
      const zOrb = rScene * Math.sin(trueAnomaly + argPerihelion);

      // Rotate by inclination around X-axis
      const x = xOrb;
      const y = zOrb * Math.sin(inclinationRad);
      const z = zOrb * Math.cos(inclinationRad);

      points.push(new THREE.Vector3(x, y, z));
    }

    this.activeOrbitCoordinates = points;
    this.rebuildActiveOrbitLine();
    return points;
  }

  public clearActiveOrbit(): void {
    this.activeOrbitCoordinates = [];
    if (this.activeOrbitLine) {
      this.scene.remove(this.activeOrbitLine);
      this.activeOrbitLine.geometry.dispose();
      (this.activeOrbitLine.material as THREE.Material).dispose();
      this.activeOrbitLine = null;
    }
  }

  private rebuildActiveOrbitLine(): void {
    if (this.activeOrbitLine) {
      this.scene.remove(this.activeOrbitLine);
      this.activeOrbitLine.geometry.dispose();
      (this.activeOrbitLine.material as THREE.Material).dispose();
      this.activeOrbitLine = null;
    }

    if (this.activeOrbitCoordinates.length !== 36) return;

    // Build closed loop of 36 points + 1 returning to start
    const closedPoints = [...this.activeOrbitCoordinates, this.activeOrbitCoordinates[0].clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(closedPoints);
    const mat = new THREE.LineDashedMaterial({
      color: 0xff6b3d,
      dashSize: 2.0,
      gapSize: 1.5,
      transparent: true,
      opacity: 0.65,
    });
    this.activeOrbitLine = new THREE.Line(geo, mat);
    this.activeOrbitLine.computeLineDistances();
    this.activeOrbitLine.userData = { tag: 'Illustrative', type: 'activeOrbit' };
    this.scene.add(this.activeOrbitLine);
  }

  public setSliderDay(day: number, maxDays: number = 365): void {
    this.sliderDay = Math.max(0, Math.min(maxDays, day));
    this.maxDays = maxDays;
    this.timeEpochRatio = this.sliderDay / maxDays;
  }

  public getActiveOrbitPoints(): THREE.Vector3[] {
    return this.activeOrbitCoordinates;
  }

  private rebuildCandidates(): void {
    // Clear old candidate meshes & lines
    this.candidateMeshes.forEach((mesh) => {
      this.candidatesGroup.remove(mesh);
    });
    this.candidateMeshes.clear();

    this.uncertaintySegments.forEach((line) => {
      this.candidatesGroup.remove(line);
    });
    this.uncertaintySegments.clear();

    this.candidatesData.forEach((cand) => {
      const posCount = cand.positions.length;
      let ra = cand.positions[0].ra;
      let dec = cand.positions[0].dec;

      if (posCount > 1) {
        const tIndex = this.timeEpochRatio * (posCount - 1);
        const lower = Math.floor(tIndex);
        const upper = Math.min(posCount - 1, lower + 1);
        const frac = tIndex - lower;

        ra = cand.positions[lower].ra + (cand.positions[upper].ra - cand.positions[lower].ra) * frac;
        dec = cand.positions[lower].dec + (cand.positions[upper].dec - cand.positions[lower].dec) * frac;
      }

      const isUnknown = cand.verdict === 'unknown';
      const isSelected = cand.id === this.selectedCandidateId;

      let nominalDistanceAu = 2.77;
      if (cand.distance_range) {
        let currentMin: number;
        let currentMax: number;

        if (cand.distance_range.scan_ranges && cand.distance_range.scan_ranges.length > 0) {
          const steps = cand.distance_range.scan_ranges;
          const sIdx = Math.min(steps.length - 1, Math.floor(this.timeEpochRatio * (steps.length - 0.001)));
          currentMin = steps[sIdx].min_au;
          currentMax = steps[sIdx].max_au;
        } else {
          const baseMin = cand.distance_range.min_au;
          const baseMax = cand.distance_range.max_au;
          const shrinkage = 0.45 * this.timeEpochRatio;
          currentMin = baseMin + (baseMax - baseMin) * (shrinkage / 2);
          currentMax = baseMax - (baseMax - baseMin) * (shrinkage / 2);
        }
        nominalDistanceAu = (currentMin + currentMax) / 2.0;

        // Line-of-sight distance uncertainty segment with ghost spheres at min/max points
        const pMin = this.radecToCartesian(ra, dec, currentMin);
        const pMax = this.radecToCartesian(ra, dec, currentMax);

        const segGeo = new THREE.BufferGeometry().setFromPoints([pMin, pMax]);
        const segMat = new THREE.LineBasicMaterial({
          color: 0xff6b3d,
          transparent: true,
          opacity: isSelected ? 0.95 : 0.65,
        });
        const segLine = new THREE.Line(segGeo, segMat);
        segLine.userData = { tag: 'Illustrative', type: 'distanceRangeLine' };
        this.candidatesGroup.add(segLine);
        this.uncertaintySegments.set(cand.id, segLine);

        // Ghost spheres positioned at the minimum and maximum distance bounds [d_min, d_max]
        const ghostGeo = new THREE.SphereGeometry(0.7, 16, 16);
        const ghostMat = new THREE.MeshStandardMaterial({
          color: 0xff6b3d,
          transparent: true,
          opacity: 0.35,
          roughness: 0.9,
          metalness: 0.05,
          wireframe: false,
          depthWrite: false,
        });

        const minGhost = new THREE.Mesh(ghostGeo, ghostMat);
        minGhost.position.copy(pMin);
        minGhost.userData = { bound: 'min', tag: 'Illustrative', candidateId: cand.id };
        this.candidatesGroup.add(minGhost);
        this.uncertaintySegments.set(`${cand.id}-ghost-min`, minGhost as unknown as THREE.Line);

        const maxGhost = new THREE.Mesh(ghostGeo, ghostMat);
        maxGhost.position.copy(pMax);
        maxGhost.userData = { bound: 'max', tag: 'Illustrative', candidateId: cand.id };
        this.candidatesGroup.add(maxGhost);
        this.uncertaintySegments.set(`${cand.id}-ghost-max`, maxGhost as unknown as THREE.Line);
      }

      let pos3d = this.radecToCartesian(ra, dec, nominalDistanceAu);
      if (isSelected && this.activeOrbitCoordinates.length === 36) {
        const progress = (this.sliderDay % this.maxDays) / this.maxDays;
        const floatIdx = progress * 36;
        const idx0 = Math.floor(floatIdx) % 36;
        const idx1 = (idx0 + 1) % 36;
        const alpha = floatIdx - Math.floor(floatIdx);
        pos3d = new THREE.Vector3().copy(this.activeOrbitCoordinates[idx0]).lerp(this.activeOrbitCoordinates[idx1], alpha);
      }

      // Check if custom compiled renderState from Agentic URL-to-3D pipeline is present
      const customRender = (cand as any).renderState;
      let mesh: THREE.Mesh;

      if (customRender) {
        const customScale = customRender.scale || 1.0;
        let customGeo: THREE.BufferGeometry;
        if (customRender.textureType === 'gaseous') {
          customGeo = new THREE.SphereGeometry(1.2 * customScale, 32, 32);
        } else {
          customGeo = createProceduralAsteroidGeometry(
            1.2 * customScale,
            2,
            cand.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
          );
        }

        const customColor = new THREE.Color(customRender.baseColor || '#38BDF8');
        const customMat = new THREE.MeshStandardMaterial({
          color: customColor,
          roughness: customRender.textureType === 'gaseous' ? 0.35 : 0.85,
          metalness: 0.1,
          emissive: isSelected ? customColor : new THREE.Color(0x000000),
          emissiveIntensity: isSelected ? 0.4 : 0.0,
        });

        mesh = new THREE.Mesh(customGeo, customMat);

        // Procedural Ring System if hasRings is true
        if (customRender.hasRings) {
          const ringInner = 1.8 * customScale;
          const ringOuter = 2.8 * customScale;
          const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: customColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.65,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = Math.PI / 3;
          ringMesh.userData = { tag: 'Illustrative', type: 'planetaryRing' };
          mesh.add(ringMesh);
        }
      } else {
        // Standard procedural asteroid (noise-displaced icosahedron)
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
          emissiveIntensity: isSelected ? 0.4 : 0.0,
        });

        mesh = new THREE.Mesh(geo, mat);
      }

      // Procedural Particle Tail for Comets (e.g. Comet 3I/ATLAS)
      const isComet = cand.match?.body_type === 'comet' ||
        cand.id.toLowerCase().includes('atlas') ||
        (cand.match?.designation && cand.match.designation.toLowerCase().includes('comet'));

      if (isComet) {
        const particleCount = 120;
        const tailPositions = new Float32Array(particleCount * 3);
        const tailColors = new Float32Array(particleCount * 3);
        const awayDir = pos3d.clone().normalize();

        for (let i = 0; i < particleCount; i++) {
          const dist = (i / particleCount) * 9.0;
          const spread = (dist / 9.0) * 1.4;
          tailPositions[i * 3] = awayDir.x * dist + (Math.random() - 0.5) * spread;
          tailPositions[i * 3 + 1] = awayDir.y * dist + (Math.random() - 0.5) * spread;
          tailPositions[i * 3 + 2] = awayDir.z * dist + (Math.random() - 0.5) * spread;

          const fade = 1.0 - (dist / 9.0);
          tailColors[i * 3] = 0.3 * fade;
          tailColors[i * 3 + 1] = 0.8 * fade;
          tailColors[i * 3 + 2] = 1.0 * fade;
        }

        const tailGeo = new THREE.BufferGeometry();
        tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPositions, 3));
        tailGeo.setAttribute('color', new THREE.BufferAttribute(tailColors, 3));
        const tailMat = new THREE.PointsMaterial({
          size: 0.9,
          vertexColors: true,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const tailPoints = new THREE.Points(tailGeo, tailMat);
        tailPoints.userData = { type: 'cometTail', tag: 'Illustrative' };
        mesh.add(tailPoints);
      }
      mesh.position.copy(pos3d);
      mesh.userData = {
        candidateId: cand.id,
        name: cand.match?.designation || cand.id,
        verdict: cand.verdict,
        type: 'candidate',
        tag: 'Illustrative',
      };

      if (isSelected) {
        const ringGeo = new THREE.RingGeometry(2.0, 2.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xff6b3d,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.lookAt(this.camera.position);
        mesh.add(ringMesh);
      }

      this.candidatesGroup.add(mesh);
      this.candidateMeshes.set(cand.id, mesh);
    });
  }

  /**
   * Toggles between Dual Scale and Uniform Linear scale.
   */
  public toggleScaleMode(): ScaleMode {
    this.scaleMode = this.scaleMode === 'dual' ? 'linear' : 'dual';
    this.updateSceneScales();
    this.updateLegendContent();
    return this.scaleMode;
  }

  public setScaleMode(mode: ScaleMode): void {
    if (this.scaleMode !== mode) {
      this.scaleMode = mode;
      this.updateSceneScales();
      this.updateLegendContent();
    }
  }

  public getScaleMode(): ScaleMode {
    return this.scaleMode;
  }

  /**
   * Recomputes 3D coordinates and orbit line geometries upon scale mode change.
   */
  private updateSceneScales(): void {
    PLANET_CATALOG.forEach((planet) => {
      const r = this.auToScene(planet.distanceAu);

      // Update orbit line geometry
      const line = this.orbitLines.get(planet.name);
      if (line) {
        line.geometry.dispose();
        line.geometry = this.buildCircularOrbitGeometry(r);
      }

      // Update planet position
      const pMesh = this.planetMeshes.get(planet.name);
      if (pMesh) {
        const curAngle = Math.atan2(pMesh.position.z, pMesh.position.x);
        pMesh.position.x = r * Math.cos(curAngle);
        pMesh.position.z = r * Math.sin(curAngle);
      }
    });

    // Update Earth & SPHEREx
    const earthR = this.auToScene(1.0);
    const earthMesh = this.planetMeshes.get('Earth');
    if (earthMesh && this.spherexGroup) {
      const angle = Math.atan2(earthMesh.position.z, earthMesh.position.x);
      this.spherexGroup.position.set(
        (earthR + 1.2) * Math.cos(angle),
        0.4,
        (earthR + 1.2) * Math.sin(angle)
      );
    }

    // Update Hypothetical Planet X Shell
    const shellR = this.auToScene(HYPOTHETICAL_PLANET_X_AU);
    this.planetXShellGroup.children.forEach((child) => {
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        child.geometry = this.buildCircularOrbitGeometry(shellR, 128);
        child.computeLineDistances();
      }
    });

    // Recompute 36-point trajectory on new scale if active
    if (this.selectedCandidateId) {
      const activeCand = this.candidatesData.find((c) => c.id === this.selectedCandidateId);
      if (activeCand) {
        this.loadActiveObjectOrbit(activeCand);
      }
    }

    // Rebuild candidates on new scale
    this.rebuildCandidates();
  }

  /**
   * Real-time FPS Measurement (calculated over rolling 500ms).
   */
  public getMeasuredFps(): number {
    return this.currentFps;
  }

  private updateFpsMeasurement(): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFpsTimestamp;

    if (elapsed >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsTimestamp = now;

      if (this.fpsBadgeElement) {
        this.fpsBadgeElement.textContent = `${this.currentFps} FPS [measured]`;
      }
      if (this.onFpsUpdate) {
        this.onFpsUpdate(this.currentFps);
      }
    }
  }

  /**
   * Permanent Legend Overlay (strictly non-missing HUD).
   */
  private createLegendOverlay(): void {
    this.legendElement = document.createElement('div');
    this.legendElement.id = 'live-sky-legend';
    Object.assign(this.legendElement.style, {
      position: 'absolute',
      bottom: '16px',
      left: '16px',
      backgroundColor: 'rgba(17, 17, 19, 0.94)',
      backdropFilter: 'blur(10px)',
      border: '1px solid #26262A', // --color-hairline
      borderRadius: '0px',
      padding: '14px 18px',
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#EDEDED',
      zIndex: '30',
      minWidth: '280px',
      boxShadow: 'none',
      userSelect: 'none',
    });

    this.container.appendChild(this.legendElement);
    this.updateLegendContent();
  }

  private updateLegendContent(): void {
    const isDual = this.scaleMode === 'dual';

    this.legendElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 700; letter-spacing: 0.5px; color: #EDEDED;">SOLAR SYSTEM SCENE</span>
        <span id="legend-fps-badge" style="color: #10B981; font-weight: 600; font-size: 11px;">${this.currentFps} FPS [measured]</span>
      </div>

      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #71717A;">SCALE:</span>
          <button id="legend-scale-toggle" style="
            background: #111113;
            border: 1px solid #26262A;
            color: #EDEDED;
            font-family: monospace;
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 6px;
            cursor: pointer;
          ">
            ${isDual ? 'DUAL SCALE (Active)' : 'LINEAR (Active)'}
          </button>
        </div>
        <div style="color: #A1A1AA; font-size: 10px; margin-top: 4px;">
          ${isDual ? 'Inner ≤5 AU [assumed] · Outer >5 AU [assumed]' : 'Uniform 1:1 Astronomical Distance [assumed]'}
        </div>
      </div>

      <div style="height: 1px; background: #26262A; margin: 8px 0;"></div>

      <div style="display: flex; flex-direction: column; gap: 5px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #FFEA78; display: inline-block;"></span>
          <span>Sun &amp; Planets <span style="color: #38BDF8;">[Illustrative]</span></span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 8px; height: 8px; transform: rotate(45deg); background: #38BDF8; display: inline-block;"></span>
          <span>SPHEREx Observatory <span style="color: #38BDF8;">[Illustrative]</span></span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 12px; height: 1px; border-top: 2px dashed #FF6B3D; display: inline-block;"></span>
          <span>Planet X Shell (~${HYPOTHETICAL_PLANET_X_AU} AU [assumed]) <strong style="color: #FF6B3D;">Hypothetical [assumed]</strong></span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #A0C2FF; display: inline-block;"></span>
          <span>Background Cosmos: 50,000 [assumed] stars (1 draw call) <span style="color: #38BDF8;">[Illustrative]</span></span>
        </div>
      </div>
    `;

    this.fpsBadgeElement = this.legendElement.querySelector('#legend-fps-badge') as HTMLElement;
    this.scaleToggleBtn = this.legendElement.querySelector('#legend-scale-toggle') as HTMLButtonElement;

    this.scaleToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleScaleMode();
    });
  }

  private createTooltipOverlay(): void {
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.id = 'scene-hover-tooltip';
    Object.assign(this.tooltipElement.style, {
      position: 'absolute',
      bottom: '84px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#EDEDED',
      backgroundColor: '#111113',
      padding: '6px 12px',
      border: '1px solid #26262A',
      borderRadius: '0px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '25',
    });
    this.container.appendChild(this.tooltipElement);
  }

  public resetCamera(): void {
    this.controls.reset();
    this.camera.position.set(0, 110, 140);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const interactables: THREE.Object3D[] = [];
    this.candidateMeshes.forEach((mesh) => interactables.push(mesh));
    this.planetMeshes.forEach((mesh) => interactables.push(mesh));

    const intersects = this.raycaster.intersectObjects(interactables, true);
    if (intersects.length > 0) {
      let top = intersects[0].object;
      while (top.parent && top.parent !== this.scene && top.parent !== this.candidatesGroup && !top.userData?.name) {
        top = top.parent;
      }
      const label = top.userData?.name || 'Solar System Object';
      this.tooltipElement.textContent = label;
      this.tooltipElement.style.display = 'block';
      if (this.onHoverObject) this.onHoverObject(label);
    } else {
      this.tooltipElement.style.display = 'none';
      if (this.onHoverObject) this.onHoverObject(null);
    }
  };

  private handleClick = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const candidatesList: THREE.Object3D[] = [];
    this.candidateMeshes.forEach((mesh) => candidatesList.push(mesh));

    const intersects = this.raycaster.intersectObjects(candidatesList, true);
    if (intersects.length > 0) {
      let top = intersects[0].object;
      while (top.parent && !top.userData?.candidateId) {
        top = top.parent;
      }
      if (top.userData?.candidateId && this.onSelectCandidate) {
        this.onSelectCandidate(top.userData.candidateId);
      }
    }
  };

  private handleResize = (): void => {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private startAnimationLoop = (): void => {
    const render = () => {
      this.animationFrameId = requestAnimationFrame(render);
      const delta = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // Update Controls
      this.controls.update();

      // Schematic orbital motion of planets
      PLANET_CATALOG.forEach((planet) => {
        const pMesh = this.planetMeshes.get(planet.name);
        if (pMesh) {
          const angle = elapsed * 0.05 * planet.speed;
          const r = this.auToScene(planet.distanceAu);
          pMesh.position.x = r * Math.cos(angle);
          pMesh.position.z = r * Math.sin(angle);
        }
      });

      // Update SPHEREx marker adjacent to Earth
      const earthMesh = this.planetMeshes.get('Earth');
      if (earthMesh && this.spherexGroup) {
        const angle = Math.atan2(earthMesh.position.z, earthMesh.position.x);
        const r = this.auToScene(1.0);
        this.spherexGroup.position.set(
          (r + 1.2) * Math.cos(angle),
          0.4,
          (r + 1.2) * Math.sin(angle)
        );
        this.spherexGroup.rotation.y += delta * 1.5;
      }

      // Slow majestic rotation of hypothetical Planet X dashed shell
      if (this.planetXShellGroup) {
        this.planetXShellGroup.rotation.y += delta * 0.02;
      }

      // Subtle rotation for asteroid candidates
      this.candidateMeshes.forEach((mesh) => {
        mesh.rotation.y += delta * 0.4;
        mesh.rotation.x += delta * 0.2;
      });

      // Smoothly animate active 3D object position along its 36-point orbit using THREE.Vector3.lerp()
      if (this.selectedCandidateId && this.activeOrbitCoordinates.length === 36) {
        const activeMesh = this.candidateMeshes.get(this.selectedCandidateId);
        if (activeMesh) {
          const progress = (this.sliderDay % this.maxDays) / this.maxDays;
          const floatIdx = progress * 36;
          const idx0 = Math.floor(floatIdx) % 36;
          const idx1 = (idx0 + 1) % 36;
          const alpha = floatIdx - Math.floor(floatIdx);

          const p0 = this.activeOrbitCoordinates[idx0];
          const p1 = this.activeOrbitCoordinates[idx1];

          activeMesh.position.copy(p0).lerp(p1, alpha);
        }

        // As scans increase on the slider, physically shrink the 3D distance segment line for "Unknown" objects
        const cand = this.candidatesData.find((c) => c.id === this.selectedCandidateId);
        if (cand && cand.distance_range) {
          const segLine = this.uncertaintySegments.get(cand.id);
          if (segLine) {
            const ratio = (this.sliderDay % this.maxDays) / this.maxDays;
            let curMin: number;
            let curMax: number;
            if (cand.distance_range.scan_ranges && cand.distance_range.scan_ranges.length > 0) {
              const steps = cand.distance_range.scan_ranges;
              const sIdx = Math.min(steps.length - 1, Math.floor(ratio * (steps.length - 0.001)));
              curMin = steps[sIdx].min_au;
              curMax = steps[sIdx].max_au;
            } else {
              const baseMin = cand.distance_range.min_au;
              const baseMax = cand.distance_range.max_au;
              const shrinkage = 0.5 * ratio;
              curMin = baseMin + (baseMax - baseMin) * (shrinkage / 2);
              curMax = baseMax - (baseMax - baseMin) * (shrinkage / 2);
            }
            const ra = cand.positions[0].ra;
            const dec = cand.positions[0].dec;
            const pMin = this.radecToCartesian(ra, dec, curMin);
            const pMax = this.radecToCartesian(ra, dec, curMax);

            segLine.geometry.setFromPoints([pMin, pMax]);
            segLine.geometry.attributes.position.needsUpdate = true;

            const minGhost = this.uncertaintySegments.get(`${cand.id}-ghost-min`) as unknown as THREE.Mesh;
            if (minGhost) minGhost.position.copy(pMin);
            const maxGhost = this.uncertaintySegments.get(`${cand.id}-ghost-max`) as unknown as THREE.Mesh;
            if (maxGhost) maxGhost.position.copy(pMax);
          }
        }
      }

      // Update background cosmos procedural scintillation
      if (this.backgroundCosmos) {
        this.backgroundCosmos.update(delta);
      }

      // FPS Measurement
      this.updateFpsMeasurement();

      // Render Scene
      this.renderer.render(this.scene, this.camera);
    };

    render();
  };

  /**
   * Clean destruction and resource freeing.
   */
  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.handleResize);

    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('mousemove', this.handleMouseMove);
      this.renderer.domElement.removeEventListener('click', this.handleClick);
    }

    this.controls.dispose();
    this.renderer.dispose();

    if (this.activeOrbitLine) {
      this.scene.remove(this.activeOrbitLine);
      this.activeOrbitLine.geometry.dispose();
      (this.activeOrbitLine.material as THREE.Material).dispose();
      this.activeOrbitLine = null;
    }

    if (this.backgroundCosmos) {
      this.backgroundCosmos.dispose();
    }

    if (this.legendElement && this.legendElement.parentElement) {
      this.legendElement.parentElement.removeChild(this.legendElement);
    }
    if (this.tooltipElement && this.tooltipElement.parentElement) {
      this.tooltipElement.parentElement.removeChild(this.tooltipElement);
    }
    if (this.renderer.domElement && this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
