/**
 * Types and Interfaces for Illustrative 3D Models
 *
 * Per Live Sky Non-Negotiables:
 * - All 3D models MUST be tagged "Illustrative".
 * - Every illustrative model implements setIllustrated(boolean).
 * - When illustrated is true, the model displays an HTML "Illustrative" tag.
 */

import * as THREE from 'three';

export interface IllustrativeModel {
  /** Root Three.js object group containing all model meshes */
  readonly group: THREE.Group;

  /** Set whether this model is actively marked as Illustrative */
  setIllustrated(illustrated: boolean): void;

  /** Check current illustrative status */
  isIllustrated(): boolean;

  /** HTML DOM badge element showing "Illustrative" */
  readonly tagElement: HTMLElement;

  /** Update animations/rotations per frame */
  update(delta: number, camera?: THREE.Camera): void;

  /** Clean up Three.js geometries, materials and DOM nodes */
  dispose(): void;
}

export interface AsteroidModelOptions {
  radius?: number;
  detail?: number;
  seed?: number;
  colourIndex?: number;
  name?: string;
  illustrated?: boolean;
}

export interface UnknownSegmentOptions {
  minDistanceAu?: number;
  maxDistanceAu?: number;
  raDeg?: number;
  decDeg?: number;
  name?: string;
  illustrated?: boolean;
}
