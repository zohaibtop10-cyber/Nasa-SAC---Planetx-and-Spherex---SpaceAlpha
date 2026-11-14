/**
 * Procedural Asteroid Mesh Generator
 *
 * Creates noise-displaced icosahedrons to represent minor bodies and candidate movers.
 * Per the project non-negotiables, all 3D geometry is explicitly tagged "Illustrative".
 *
 * Vertices are displaced using multi-frequency harmonic deformation to produce
 * cratered, irregular, organic asteroid facets.
 */

import * as THREE from 'three';

/**
 * Generate a procedural displaced icosahedron geometry.
 */
export function createProceduralAsteroidGeometry(
  radius: number = 1.0,
  detail: number = 2,
  seed: number = 42
): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const positionAttr = geometry.attributes.position;
  const v = new THREE.Vector3();

  // Deterministic pseudo-random harmonic parameters from seed
  const p1 = 1.8 + (seed % 7) * 0.2;
  const p2 = 3.5 + (seed % 5) * 0.3;
  const p3 = 6.2 + (seed % 11) * 0.2;

  for (let i = 0; i < positionAttr.count; i++) {
    v.fromBufferAttribute(positionAttr, i);
    const len = v.length();
    const dir = v.clone().normalize();

    // Multi-octave sinusoidal deformation
    const displacement =
      0.18 * Math.sin(dir.x * p1 + dir.y * p2 + seed) +
      0.09 * Math.sin(dir.y * p2 - dir.z * p3 + seed * 2) +
      0.05 * Math.sin(dir.z * p3 + dir.x * p1 * 1.5);

    const newLen = len * (1.0 + displacement);
    v.copy(dir.multiplyScalar(newLen));
    positionAttr.setXYZ(i, v.x, v.y, v.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Maps astronomical infrared color index to physical asteroid reflectance tint.
 * - Lower color index (< 1.0): Neutral / carbonaceous C-type asteroid (slate gray / cool tone).
 * - Moderate (1.0 - 1.5): Siliceous S-type / M-type (warm beige / light ochre).
 * - High (> 1.5): Ultra-red outer solar system / Kuiper Belt object (TNO) or distant candidate.
 */
export function colorIndexToAsteroidColor(colorIndex: number): THREE.Color {
  if (colorIndex < 0.9) {
    // C-type carbonaceous
    return new THREE.Color('#98A2B3');
  } else if (colorIndex <= 1.4) {
    // S-type rocky/silicate
    return new THREE.Color('#D0C5B4');
  } else {
    // High-red TNO / distant candidate (accent-tinted)
    return new THREE.Color('#FF8C5A');
  }
}
