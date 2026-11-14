/**
 * Asteroid.ts - Illustrative Asteroid Model
 *
 * Implements:
 * - Noise-displaced icosahedron geometry with multi-octave harmonic deformation
 * - Matte diffuse material (high roughness 0.88, low metalness 0.05)
 * - Reflectance color smoothly tinted from photometric colour_index from data
 * - setIllustrated(boolean) with an attached HTML "Illustrative" DOM badge
 */

import * as THREE from 'three';
import { AsteroidModelOptions, IllustrativeModel } from './types';

export class AsteroidModel implements IllustrativeModel {
  public readonly group: THREE.Group;
  public readonly tagElement: HTMLElement;
  private mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private geometry: THREE.BufferGeometry;
  private illustrated: boolean = true;
  private colourIndex: number = 1.0;
  private seed: number = 42;

  constructor(options: AsteroidModelOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = options.name || 'Illustrative Asteroid';
    this.seed = options.seed ?? 42;
    this.colourIndex = options.colourIndex ?? 1.1;

    // 1. Build noise-displaced icosahedron geometry
    const radius = options.radius ?? 1.5;
    const detail = options.detail ?? 2;
    this.geometry = this.generateDisplacedIcosahedron(radius, detail, this.seed);

    // 2. Build matte material tinted from colour_index
    const tintColor = AsteroidModel.colourIndexToColor(this.colourIndex);
    this.material = new THREE.MeshStandardMaterial({
      color: tintColor,
      roughness: 0.88, // Matte, diffuse surface reflection
      metalness: 0.05, // Non-metallic stony regolith
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData = { type: 'asteroid', tag: 'Illustrative' };
    this.group.add(this.mesh);

    // 3. Create attached HTML "Illustrative" DOM tag
    this.tagElement = document.createElement('div');
    this.tagElement.className = 'live-sky-illustrative-tag';
    this.tagElement.textContent = 'Illustrative';
    Object.assign(this.tagElement.style, {
      fontFamily: 'monospace',
      fontSize: '11px',
      fontWeight: '600',
      color: '#38BDF8', // Cyan compliance label
      backgroundColor: 'rgba(17, 17, 19, 0.90)',
      border: '1px solid #26262A',
      padding: '2px 8px',
      borderRadius: '4px',
      letterSpacing: '0.5px',
      pointerEvents: 'none',
      userSelect: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      boxShadow: 'none',
      transition: 'opacity 0.2s ease',
    });

    // 4. Initial illustrative state
    this.setIllustrated(options.illustrated ?? true);
  }

  /**
   * Smooth continuous tint mapping from astronomical photometric colour_index from data.
   * - colour_index < 0.8: Carbonaceous C-type (slate/neutral gray)
   * - 0.8 <= colour_index <= 1.4: Stony S-type / M-type (warm beige/ochre)
   * - 1.4 < colour_index <= 1.8: Organic D/T-type (reddish clay)
   * - colour_index > 1.8: Distant TNO / Centaur / outer candidate (deep reddish hue)
   */
  public static colourIndexToColor(ci: number): THREE.Color {
    if (ci < 0.8) {
      // Carbonaceous C-type
      return new THREE.Color('#8894A0');
    } else if (ci <= 1.4) {
      // S-type rocky silicate
      const t = (ci - 0.8) / 0.6;
      return new THREE.Color('#8894A0').lerp(new THREE.Color('#C9B89B'), t);
    } else if (ci <= 1.8) {
      // D/T-type organic rich
      const t = (ci - 1.4) / 0.4;
      return new THREE.Color('#C9B89B').lerp(new THREE.Color('#E07A5F'), t);
    } else {
      // High-red outer minor body (e.g. Centaur / Kuiper Belt Object)
      const t = Math.min(1.0, (ci - 1.8) / 0.7);
      return new THREE.Color('#E07A5F').lerp(new THREE.Color('#FF6B3D'), t);
    }
  }

  /**
   * Update color dynamically from candidate data.
   */
  public setColourIndex(ci: number): void {
    this.colourIndex = ci;
    const color = AsteroidModel.colourIndexToColor(ci);
    this.material.color.copy(color);
  }

  public getColourIndex(): number {
    return this.colourIndex;
  }

  /**
   * setIllustrated(boolean)
   * Controls visibility of the HTML "Illustrative" tag.
   */
  public setIllustrated(illustrated: boolean): void {
    this.illustrated = illustrated;
    if (this.tagElement) {
      this.tagElement.style.display = illustrated ? 'inline-flex' : 'none';
      this.tagElement.style.opacity = illustrated ? '1' : '0';
    }
  }

  public isIllustrated(): boolean {
    return this.illustrated;
  }

  /**
   * Generates a noise-displaced icosahedron with cratering and organic facets.
   */
  private generateDisplacedIcosahedron(
    radius: number,
    detail: number,
    seed: number
  ): THREE.BufferGeometry {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    const p1 = 2.1 + (seed % 7) * 0.3;
    const p2 = 3.8 + (seed % 5) * 0.4;
    const p3 = 6.4 + (seed % 11) * 0.25;

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      const dir = v.clone().normalize();

      // Multi-frequency sinusoidal surface displacement
      const displacement =
        0.18 * Math.sin(dir.x * p1 + dir.y * p2 + seed) +
        0.10 * Math.sin(dir.y * p2 - dir.z * p3 + seed * 2) +
        0.05 * Math.sin(dir.z * p3 + dir.x * p1 * 1.5);

      const newLen = len * (1.0 + displacement);
      v.copy(dir.multiplyScalar(newLen));
      pos.setXYZ(i, v.x, v.y, v.z);
    }

    geo.computeVertexNormals();
    return geo;
  }

  public update(delta: number): void {
    // Subtle physical tumble rotation
    this.mesh.rotation.y += delta * 0.35;
    this.mesh.rotation.x += delta * 0.15;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    if (this.tagElement.parentElement) {
      this.tagElement.parentElement.removeChild(this.tagElement);
    }
  }
}
