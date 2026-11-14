/**
 * ProceduralGenerator.tsx - Procedural 3D Celestial Body Generation System
 *
 * NASA Space Apps Challenge 2026 · Planet X and SPHEREx · Live Sky
 *
 * Implements:
 * 1. Data-Driven Instancing: Synthesizes procedural geometries from JSON candidate/object metadata
 *    without loading static .obj/.gltf assets.
 * 2. Geometry Generation:
 *    - Asteroid/Rocky: Noise-displaced IcosahedronGeometry using Simplex noise in custom ShaderMaterial.
 *    - Comet: Smooth core + trailing particle tail along velocity vector (THREE.Points).
 *    - Star / Brown Dwarf: Glowing sphere with custom emissive shader + sprite-based halo.
 *    - Unknown: Translucent glowing line segment (cylinder) along line of sight, capped by ghost spheres.
 * 3. Material Mapping: Maps colour_index / spectral taxonomy (carbon-rich dark grey, silicate reddish-brown,
 *    icy pale cyan, stellar orange-red, brown dwarf deep magenta).
 * 4. The 'Illustrative' Tag: Attaches a CSS2DObject slightly above the mesh declaring "Illustrative Model"
 *    (Rule 2 compliance).
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// GLSL Simplex Noise Vertex & Fragment Shaders for Asteroid Deformation
// ---------------------------------------------------------------------------
export const SIMPLEX_NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export const ASTEROID_VERTEX_SHADER = `
${SIMPLEX_NOISE_GLSL}

uniform float uNoiseScale;
uniform float uNoiseAmplitude;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normal;
  // Multi-frequency noise displacement
  float n1 = snoise(position * uNoiseScale + vec3(uTime * 0.02));
  float n2 = snoise(position * (uNoiseScale * 2.1) + vec3(uTime * 0.04)) * 0.5;
  float totalDisp = (n1 + n2) * uNoiseAmplitude;

  vec3 displaced = position + normal * totalDisp;
  vPosition = displaced;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

export const ASTEROID_FRAGMENT_SHADER = `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 lightDir = normalize(vec3(0.8, 1.2, 0.6));
  float diff = max(dot(normalize(vNormal), lightDir), 0.18);
  vec3 ambient = uColor * 0.25;
  vec3 diffuse = uColor * diff * 0.85;
  gl_FragColor = vec4(ambient + diffuse, 1.0);
}
`;

export const STAR_VERTEX_SHADER = `
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const STAR_FRAGMENT_SHADER = `
uniform vec3 uEmissiveColor;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = 1.0 - max(0.0, dot(vNormal, viewDir));
  float pulse = 0.90 + 0.10 * sin(uTime * 3.0);
  vec3 coreColor = uEmissiveColor * 1.35;
  vec3 coronaColor = uEmissiveColor * (pow(fresnel, 2.5) * 2.2 + 0.4) * pulse;
  gl_FragColor = vec4(coreColor + coronaColor, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Step 3: Material & Color Mapping
// ---------------------------------------------------------------------------
export function colorIndexToProceduralColor(
  colourIndex: number | null | undefined,
  classification?: string
): THREE.Color {
  const normClass = (classification || '').toLowerCase();

  // Explicit taxonomic overrides
  if (normClass.includes('carbon') || normClass === 'carbon_rich') {
    return new THREE.Color(0x333336); // Carbon-rich dark grey
  }
  if (normClass.includes('silicate') || normClass.includes('rocky') || normClass === 'asteroid') {
    return new THREE.Color(0x8b5a2b); // Silicate reddish-brown
  }
  if (normClass.includes('comet') || normClass.includes('icy') || normClass.includes('ice')) {
    return new THREE.Color(0x7dd3fc); // Icy volatile pale cyan
  }
  if (normClass.includes('brown_dwarf') || normClass.includes('y_dwarf') || normClass.includes('t_dwarf')) {
    return new THREE.Color(0x6b21a8); // Sub-stellar brown dwarf deep infrared magenta
  }
  if (normClass.includes('star') || normClass.includes('red_dwarf')) {
    return new THREE.Color(0xef4444); // Stellar red dwarf warm orange-red
  }

  // Fallback to photometric colour_index (B-V approximation)
  if (colourIndex !== null && colourIndex !== undefined) {
    if (colourIndex <= 0.65) {
      return new THREE.Color(0x7dd3fc); // Icy blue
    }
    if (colourIndex <= 0.85) {
      return new THREE.Color(0x333336); // Carbon-rich dark grey
    }
    if (colourIndex <= 1.35) {
      return new THREE.Color(0x9c6644); // Silicate stony reddish-brown
    }
    if (colourIndex >= 1.6) {
      return new THREE.Color(0xef4444); // Star orange-red
    }
  }

  // Neutral default regolith
  return new THREE.Color(0xa39d95);
}

// ---------------------------------------------------------------------------
// Step 4: 'Illustrative Model' CSS2D Tag Builder (Rule 2 Compliance)
// ---------------------------------------------------------------------------
export function createIllustrativeTag(
  yOffset: number = 2.2,
  labelText: string = 'Illustrative Model'
): CSS2DObject {
  let tagEl: HTMLElement;

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    tagEl = document.createElement('div');
    tagEl.className = 'live-sky-illustrative-tag candidate-illustrative-badge';
    tagEl.textContent = labelText;
    if (!tagEl.style) tagEl.style = {} as any;
    if (typeof tagEl.setAttribute !== 'function') {
      const attrs: Record<string, string> = {};
      tagEl.setAttribute = ((k: string, v: string) => { attrs[k] = v; }) as any;
      tagEl.getAttribute = ((k: string) => attrs[k] || null) as any;
    }
    Object.assign(tagEl.style, {
      fontFamily: 'monospace',
      fontSize: '9px',
      fontWeight: '600',
      letterSpacing: '0.04em',
      color: '#38BDF8', // Cyan compliance declaration
      backgroundColor: 'rgba(17, 17, 19, 0.90)',
      border: '1px solid #26262A',
      borderRadius: '3px',
      padding: '2px 6px',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.6)',
    });
  } else {
    // Headless test fallback mock
    const attrs: Record<string, string> = {};
    tagEl = {
      textContent: labelText,
      className: 'live-sky-illustrative-tag',
      style: {},
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      getAttribute: (k: string) => attrs[k] || null,
      removeAttribute: (k: string) => { delete attrs[k]; },
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLElement;
  }

  const css2d = new CSS2DObject(tagEl);
  css2d.position.set(0, yOffset, 0);
  css2d.userData = { tag: 'Illustrative', type: 'complianceTag' };
  return css2d;
}

// ---------------------------------------------------------------------------
// Step 2: Procedural Geometry & Mesh Builders
// ---------------------------------------------------------------------------

/**
 * 2A: Asteroid / Rocky Body Generator
 * THREE.IcosahedronGeometry deformed via Simplex noise in custom ShaderMaterial.
 */
export function createProceduralAsteroid(
  radius: number = 1.3,
  colourIndex?: number | null,
  classification: string = 'asteroid'
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Procedural Asteroid';

  const geom = new THREE.IcosahedronGeometry(radius, 3);
  const color = colorIndexToProceduralColor(colourIndex, classification);

  const mat = new THREE.ShaderMaterial({
    vertexShader: ASTEROID_VERTEX_SHADER,
    fragmentShader: ASTEROID_FRAGMENT_SHADER,
    uniforms: {
      uNoiseScale: { value: 0.9 },
      uNoiseAmplitude: { value: 0.28 },
      uTime: { value: 0.0 },
      uColor: { value: color },
    },
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData = { type: 'asteroid', tag: 'Illustrative', geometryType: 'IcosahedronSimplexNoise' };
  group.add(mesh);

  // Attach CSS2D illustrative tag
  const tag = createIllustrativeTag(radius + 0.9, 'Illustrative Model');
  group.add(tag);

  return group;
}

/**
 * 2B: Comet Generator
 * Smooth rocky core + trailing instanced particle tail (THREE.Points).
 */
export function createProceduralComet(
  radius: number = 0.8,
  velocityVector: THREE.Vector3 = new THREE.Vector3(-1.0, 0.2, -0.5),
  particleCount: number = 160
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Procedural Comet';

  // 1. Smaller smooth rocky core
  const coreGeom = new THREE.IcosahedronGeometry(radius, 2);
  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x7dd3fc),
    roughness: 0.75,
    metalness: 0.1,
  });
  const coreMesh = new THREE.Mesh(coreGeom, coreMat);
  coreMesh.userData = { type: 'cometCore', tag: 'Illustrative' };
  group.add(coreMesh);

  // 2. Trailing particle tail (THREE.Points)
  const tailPositions = new Float32Array(particleCount * 3);
  const tailColors = new Float32Array(particleCount * 3);

  // Trail anti-parallel to velocity vector
  const trailDir = velocityVector.clone().normalize().negate();
  if (trailDir.lengthSq() < 0.001) {
    trailDir.set(0, 0, -1);
  }

  for (let i = 0; i < particleCount; i++) {
    const progress = i / particleCount;
    const dist = progress * 10.0;
    const spread = Math.pow(progress, 0.7) * 1.6;

    tailPositions[i * 3] = trailDir.x * dist + (Math.random() - 0.5) * spread;
    tailPositions[i * 3 + 1] = trailDir.y * dist + (Math.random() - 0.5) * spread;
    tailPositions[i * 3 + 2] = trailDir.z * dist + (Math.random() - 0.5) * spread;

    const alpha = Math.max(0.0, 1.0 - progress);
    tailColors[i * 3] = 0.45 * alpha;
    tailColors[i * 3 + 1] = 0.82 * alpha;
    tailColors[i * 3 + 2] = 1.0 * alpha;
  }

  const tailGeom = new THREE.BufferGeometry();
  tailGeom.setAttribute('position', new THREE.BufferAttribute(tailPositions, 3));
  tailGeom.setAttribute('color', new THREE.BufferAttribute(tailColors, 3));

  const tailMat = new THREE.PointsMaterial({
    size: 0.85,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const tailPoints = new THREE.Points(tailGeom, tailMat);
  tailPoints.userData = { type: 'cometTail', tag: 'Illustrative' };
  group.add(tailPoints);

  // Attach CSS2D illustrative tag
  const tag = createIllustrativeTag(radius + 0.8, 'Illustrative Model');
  group.add(tag);

  return group;
}

/**
 * 2C: Star / Brown Dwarf Generator
 * Glowing SphereGeometry with custom emissive shader + subtle sprite halo.
 */
export function createProceduralStar(
  radius: number = 1.5,
  isBrownDwarf: boolean = false,
  colourIndex?: number | null
): THREE.Group {
  const group = new THREE.Group();
  group.name = isBrownDwarf ? 'Procedural Brown Dwarf' : 'Procedural Star';

  const baseColor = colorIndexToProceduralColor(
    colourIndex,
    isBrownDwarf ? 'brown_dwarf' : 'star'
  );

  // 1. Glowing Sphere with Emissive Shader
  const sphereGeom = new THREE.SphereGeometry(radius, 32, 32);
  const sphereMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    uniforms: {
      uEmissiveColor: { value: baseColor },
      uTime: { value: 0.0 },
    },
  });

  const starMesh = new THREE.Mesh(sphereGeom, sphereMat);
  starMesh.userData = {
    type: isBrownDwarf ? 'brown_dwarf' : 'star',
    tag: 'Illustrative',
  };
  group.add(starMesh);

  // 2. Subtle Sprite-Based Halo Glow
  let haloTexture: THREE.Texture;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0.0, `rgba(${Math.floor(baseColor.r * 255)}, ${Math.floor(baseColor.g * 255)}, ${Math.floor(baseColor.b * 255)}, 0.85)`);
      gradient.addColorStop(0.4, `rgba(${Math.floor(baseColor.r * 255)}, ${Math.floor(baseColor.g * 255)}, ${Math.floor(baseColor.b * 255)}, 0.35)`);
      gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    haloTexture = new THREE.CanvasTexture(canvas);
  } else {
    haloTexture = new THREE.Texture();
  }

  const spriteMat = new THREE.SpriteMaterial({
    map: haloTexture,
    transparent: true,
    opacity: isBrownDwarf ? 0.45 : 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMat);
  const haloScale = radius * 3.8;
  sprite.scale.set(haloScale, haloScale, 1.0);
  sprite.userData = { type: 'starHalo', tag: 'Illustrative' };
  group.add(sprite);

  // Attach CSS2D illustrative tag
  const tag = createIllustrativeTag(radius + 1.1, 'Illustrative Model');
  group.add(tag);

  return group;
}

/**
 * 2D: Unknown Distance Range Uncertainty Segment Generator
 * Translucent glowing cylinder along line of sight capped by ghost spheres at [min_au, max_au].
 */
export function createProceduralUnknownSegment(
  minPoint: THREE.Vector3,
  maxPoint: THREE.Vector3,
  accentColor: number = 0xff6b3d
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Procedural Unknown Distance Bounds';

  const delta = new THREE.Vector3().subVectors(maxPoint, minPoint);
  const length = delta.length();
  const midPoint = new THREE.Vector3().addVectors(minPoint, maxPoint).multiplyScalar(0.5);

  // 1. Translucent glowing cylinder along line of sight
  const cylinderRadius = 0.08;
  const cylinderGeom = new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, length, 16);
  const cylinderMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.65,
    wireframe: false,
  });

  const cylinderMesh = new THREE.Mesh(cylinderGeom, cylinderMat);
  cylinderMesh.position.copy(midPoint);

  // Orient cylinder along delta vector (default cylinder height is along Y axis)
  const upAxis = new THREE.Vector3(0, 1, 0);
  const orientation = new THREE.Quaternion().setFromUnitVectors(upAxis, delta.clone().normalize());
  cylinderMesh.quaternion.copy(orientation);
  cylinderMesh.userData = { type: 'uncertaintyCylinder', tag: 'Illustrative' };
  group.add(cylinderMesh);

  // 2. Ghost spheres capping min and max distance bounds
  const ghostGeom = new THREE.SphereGeometry(0.65, 16, 16);
  const ghostMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.35,
    roughness: 0.9,
    metalness: 0.05,
    depthWrite: false,
  });

  const minGhost = new THREE.Mesh(ghostGeom, ghostMat);
  minGhost.position.copy(minPoint);
  minGhost.userData = { bound: 'min', tag: 'Illustrative' };
  group.add(minGhost);

  const maxGhost = new THREE.Mesh(ghostGeom, ghostMat);
  maxGhost.position.copy(maxPoint);
  maxGhost.userData = { bound: 'max', tag: 'Illustrative' };
  group.add(maxGhost);

  // Attach CSS2D illustrative tag at midpoint
  const tag = createIllustrativeTag(midPoint.y + 1.2, 'Illustrative Model');
  tag.position.copy(midPoint).add(new THREE.Vector3(0, 1.2, 0));
  group.add(tag);

  return group;
}

// ---------------------------------------------------------------------------
// Step 1: Data-Driven Instancing Dispatcher
// ---------------------------------------------------------------------------
export interface ProceduralDataInput {
  id?: string;
  name?: string;
  verdict?: string;
  classification?: string;
  colour_index?: number | null;
  distance_range?: {
    min_au: number;
    max_au: number;
    assumption?: string;
  } | null;
  velocity_arcsec_day?: number;
  position3D?: THREE.Vector3;
  procedural3D?: {
    baseColorHex?: string;
    surfaceTexture?: string;
    relativeSize?: number;
  };
}

export function generateProceduralCelestialBody(
  data: ProceduralDataInput,
  minPoint?: THREE.Vector3,
  maxPoint?: THREE.Vector3
): THREE.Group {
  const verdict = (data.verdict || '').toLowerCase();
  const classification = (data.classification || '').toLowerCase();
  const name = (data.name || data.id || '').toLowerCase();

  // 1. Unknown with wide distance range -> Glowing line segment + ghost spheres
  if (verdict === 'unknown' && data.distance_range && minPoint && maxPoint) {
    return createProceduralUnknownSegment(minPoint, maxPoint);
  }

  // 2. Comet
  if (
    classification === 'comet' ||
    name.includes('comet') ||
    name.includes('atlas')
  ) {
    const vel = new THREE.Vector3(
      -(data.velocity_arcsec_day || 350.0) / 300.0,
      0.3,
      -0.6
    );
    return createProceduralComet(0.85, vel);
  }

  // 3. Star or Brown Dwarf
  if (
    classification.includes('brown_dwarf') ||
    name.includes('wise') ||
    name.includes('0855') ||
    name.includes('indi')
  ) {
    return createProceduralStar(1.4, true, data.colour_index);
  }
  if (
    verdict.includes('star') ||
    classification === 'star' ||
    name.includes('barnard')
  ) {
    return createProceduralStar(1.6, false, data.colour_index);
  }

  // 4. Asteroid / Rocky Body (Default)
  const relSize = data.procedural3D?.relativeSize || 1.2;
  return createProceduralAsteroid(relSize, data.colour_index, classification || 'asteroid');
}

// ---------------------------------------------------------------------------
// React Three Fiber / Declarative Scene Component Wrapper
// ---------------------------------------------------------------------------
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
    }
  }
}

export interface ProceduralGeneratorProps {
  data: ProceduralDataInput;
  minPoint?: THREE.Vector3;
  maxPoint?: THREE.Vector3;
  scene?: THREE.Scene | THREE.Group;
  onPointerClick?: (data: ProceduralDataInput) => void;
}

export const ProceduralGenerator: React.FC<ProceduralGeneratorProps> = ({
  data,
  minPoint,
  maxPoint,
  scene,
  onPointerClick,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  const proceduralGroup = useMemo(() => {
    return generateProceduralCelestialBody(data, minPoint, maxPoint);
  }, [data, minPoint, maxPoint]);

  useEffect(() => {
    if (scene) {
      scene.add(proceduralGroup);
      return () => {
        scene.remove(proceduralGroup);
      };
    } else if (groupRef.current) {
      const parent = groupRef.current;
      parent.clear();
      parent.add(proceduralGroup);
      return () => {
        parent.clear();
      };
    }
  }, [scene, proceduralGroup]);

  if (scene) {
    return null;
  }

  return (
    <group
      ref={groupRef}
      onClick={() => onPointerClick?.(data)}
      userData={{ tag: 'Illustrative', candidateId: data.id }}
    />
  );
};

export default ProceduralGenerator;
