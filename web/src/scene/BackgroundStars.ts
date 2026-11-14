/**
 * BackgroundStars.ts - Rich, GPU-Optimized Background Cosmos for Live Sky
 *
 * Requirements:
 * 1. Generates 50,000 background stars using THREE.Points.
 * 2. Randomized spherical coordinates placed far beyond the Kuiper belt (r = 2500 to 5000 units).
 * 3. Realistic stellar spectral color variations from hot blue-white (O/B/A) to cool red-orange (K/M).
 * 4. Procedural circular point shader (Airy disc soft falloff) with zero texture maps.
 * 5. Single draw call to ensure zero FPS drop (maintaining smooth 60+ FPS).
 * 6. Non-negotiable Rule 2 compliance: tagged "Illustrative".
 */

import * as THREE from 'three';

export interface BackgroundStarsOptions {
  /** Total count of stars generated (default: 50,000) */
  count?: number;
  /** Minimum radial distance from Sun (default: 2600 scene units) */
  minRadius?: number;
  /** Maximum radial distance from Sun (default: 5200 scene units) */
  maxRadius?: number;
  /** Seed or custom base point size (default: 1.6) */
  baseSize?: number;
  /** Whether the starfield is tagged illustrative (default: true) */
  illustrated?: boolean;
}

// Procedural Point Shaders (Zero image textures, single draw call)
const STAR_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aTwinkleSpeed;
  attribute float aPhase;

  uniform float uTime;
  uniform float uPixelRatio;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;

    // Subtle micro-scintillation / twinkle
    float twinkle = 0.85 + 0.15 * sin(uTime * aTwinkleSpeed + aPhase);
    vAlpha = twinkle;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Attenuated point size with pixel ratio scaling
    gl_PointSize = aSize * uPixelRatio * (1200.0 / -mvPosition.z);
    // Clamp to ensure distant stars remain sharp, crisp points
    gl_PointSize = clamp(gl_PointSize, 1.0, 5.0);
  }
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Distance from point center (0.0 at center, 0.5 at edge)
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distSq = dot(coord, coord);
    if (distSq > 0.25) {
      discard;
    }

    // Smooth circular radial intensity falloff (Airy disc soft falloff)
    float intensity = 1.0 - smoothstep(0.0, 0.25, distSq);
    intensity = pow(intensity, 1.8);

    gl_FragColor = vec4(vColor, intensity * vAlpha * 0.9);
  }
`;

export class BackgroundStars {
  public readonly points: THREE.Points;
  public readonly geometry: THREE.BufferGeometry;
  public readonly material: THREE.ShaderMaterial;
  public readonly count: number;

  private illustrated: boolean;

  constructor(options: BackgroundStarsOptions = {}) {
    this.count = options.count ?? 50000;
    const minR = options.minRadius ?? 2600.0;
    const maxR = options.maxRadius ?? 5200.0;
    const baseSize = options.baseSize ?? 1.6;
    this.illustrated = options.illustrated ?? true;

    // Allocate buffer attributes for 50,000 points (Single Draw Call)
    const positions = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const twinkleSpeeds = new Float32Array(this.count);
    const phases = new Float32Array(this.count);

    // Realistic stellar spectral color palette (O, B, A, F, G, K, M classification)
    const spectralColors: THREE.Color[] = [
      new THREE.Color(0xa0c2ff), // O/B: Hot Deep Blue
      new THREE.Color(0xbdd3ff), // B: Blue-White
      new THREE.Color(0xe2e9ff), // A: Bright Pure White
      new THREE.Color(0xfbfaff), // F: Warm White
      new THREE.Color(0xfff3de), // G: Solar Yellow-White
      new THREE.Color(0xffd59e), // K: Orange
      new THREE.Color(0xffa873), // M: Cool Red-Orange
      new THREE.Color(0xff7755), // Deep Red Giant
    ];

    // Distribute stars on spherical shell far beyond Kuiper belt
    for (let i = 0; i < this.count; i++) {
      const idx3 = i * 3;

      // Uniform spherical coordinates (Archimedes projection)
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI; // Azimuth
      const phi = Math.acos(2.0 * v - 1.0); // Polar angle

      // Radial distribution with slight outer concentration
      const radialFraction = Math.pow(Math.random(), 0.7);
      const r = minR + (maxR - minR) * radialFraction;

      const sinPhi = Math.sin(phi);
      positions[idx3] = r * sinPhi * Math.cos(theta);
      positions[idx3 + 1] = r * Math.cos(phi);
      positions[idx3 + 2] = r * sinPhi * Math.sin(theta);

      // Realistic spectral class weighting (majority M/K red dwarfs, fewer bright O/B)
      const roll = Math.random();
      let colorIndex: number;
      if (roll < 0.08) {
        colorIndex = 0; // Rare O/B hot blue
      } else if (roll < 0.20) {
        colorIndex = 1; // Blue-white
      } else if (roll < 0.42) {
        colorIndex = 2; // White
      } else if (roll < 0.60) {
        colorIndex = 3; // Warm white
      } else if (roll < 0.78) {
        colorIndex = 4; // Yellow-white
      } else if (roll < 0.90) {
        colorIndex = 5; // Orange
      } else if (roll < 0.97) {
        colorIndex = 6; // Red-orange
      } else {
        colorIndex = 7; // Deep red
      }

      const baseColor = spectralColors[colorIndex];
      // Subtle randomized hue jitter (+/- 5%)
      const jitter = (Math.random() - 0.5) * 0.08;
      colors[idx3] = Math.max(0.0, Math.min(1.0, baseColor.r + jitter));
      colors[idx3 + 1] = Math.max(0.0, Math.min(1.0, baseColor.g + jitter));
      colors[idx3 + 2] = Math.max(0.0, Math.min(1.0, baseColor.b + jitter));

      // Size distribution: power law (mostly faint, few prominent beacons)
      const brightnessFactor = Math.pow(Math.random(), 4.0);
      sizes[i] = baseSize * (0.8 + brightnessFactor * 2.2);

      // Scintillation / twinkle parameters
      twinkleSpeeds[i] = 0.5 + Math.random() * 2.5;
      phases[i] = Math.random() * Math.PI * 2.0;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aTwinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    this.material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0.0 },
        uPixelRatio: { value: pixelRatio },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'BackgroundCosmos';

    // Rule 2 Compliance: Tagged Illustrative
    this.points.userData = {
      name: 'Background Cosmos',
      tag: 'Illustrative',
      count: this.count,
      drawCalls: 1,
    };
  }

  /**
   * Updates time uniform for subtle procedural micro-twinkling.
   */
  public update(delta: number): void {
    if (this.material && this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value += delta;
    }
  }

  /**
   * Rule 2 non-negotiable compliance.
   */
  public isIllustrated(): boolean {
    return this.illustrated;
  }

  public setIllustrated(illustrated: boolean): void {
    this.illustrated = illustrated;
    this.points.visible = illustrated;
  }

  /**
   * Free GPU buffers.
   */
  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export default BackgroundStars;
