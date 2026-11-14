/**
 * Dual-scale Astronomical Coordinate Transformation
 *
 * Implements dual-scale representation:
 * - Inner Solar System (r <= 5.0 AU): Linear scale (1 AU = 10 scene units).
 * - Outer Solar System (r > 5.0 AU): Logarithmic scale (avoids clip plane clipping while
 *   preserving visible planetary orbits and Kuiper Belt / distant candidate structure).
 */

import * as THREE from 'three';

export const INNER_BOUNDARY_AU = 5.0;
export const LINEAR_SCALE_FACTOR = 10.0; // 1 AU = 10 scene units
export const INNER_MAX_SCENE_UNITS = INNER_BOUNDARY_AU * LINEAR_SCALE_FACTOR; // 50 units
export const LOG_SCALE_MULTIPLIER = 35.0; // 50 + 35 * log10(r / 5.0)

/**
 * Convert astronomical distance in AU to scaled 3D scene units.
 */
export function auToSceneDistance(au: number): number {
  if (au <= 0) return 0;
  if (au <= INNER_BOUNDARY_AU) {
    return au * LINEAR_SCALE_FACTOR;
  }
  return INNER_MAX_SCENE_UNITS + LOG_SCALE_MULTIPLIER * Math.log10(au / INNER_BOUNDARY_AU);
}

/**
 * Reverse mapping from scene distance back to AU (for debugging / tooltip calibration).
 */
export function sceneDistanceToAu(sceneDist: number): number {
  if (sceneDist <= 0) return 0;
  if (sceneDist <= INNER_MAX_SCENE_UNITS) {
    return sceneDist / LINEAR_SCALE_FACTOR;
  }
  const logTerm = (sceneDist - INNER_MAX_SCENE_UNITS) / LOG_SCALE_MULTIPLIER;
  return INNER_BOUNDARY_AU * Math.pow(10, logTerm);
}

/**
 * Convert Equatorial Coordinates (RA, Dec in degrees) and distance in AU
 * to 3D Cartesian coordinates (Three.js Vector3).
 *
 * Coordinate system:
 * - X: Vernal Equinox (RA = 0°, Dec = 0°)
 * - Y: Celestial North Pole (Dec = +90°)
 * - Z: RA = 90°, Dec = 0° (Right-handed celestial sphere)
 */
export function radecToCartesian(
  raDeg: number,
  decDeg: number,
  distanceAu: number
): THREE.Vector3 {
  const scaledR = auToSceneDistance(distanceAu);
  const raRad = THREE.MathUtils.degToRad(raDeg);
  const decRad = THREE.MathUtils.degToRad(decDeg);

  const cosDec = Math.cos(decRad);
  const sinDec = Math.sin(decRad);

  const x = scaledR * cosDec * Math.cos(raRad);
  const y = scaledR * sinDec;
  const z = scaledR * cosDec * Math.sin(raRad);

  return new THREE.Vector3(x, y, z);
}
