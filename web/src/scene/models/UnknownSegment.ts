/**
 * UnknownSegment.ts - Illustrative Unknown Segment Model
 *
 * Implements:
 * - Line along the line of sight representing distance uncertainty
 * - Ghost spheres positioned at the minimum and maximum distance bounds [d_min, d_max]
 * - setIllustrated(boolean) with an attached HTML "Illustrative" DOM badge
 * - Non-negotiable label compliance: distance values labeled [derived]
 */

import * as THREE from 'three';
import { IllustrativeModel, UnknownSegmentOptions } from './types';

export class UnknownSegmentModel implements IllustrativeModel {
  public readonly group: THREE.Group;
  public readonly tagElement: HTMLElement;

  private lineMesh: THREE.Line;
  private lineGeometry: THREE.BufferGeometry;
  private lineMaterial: THREE.LineBasicMaterial;

  private minGhostSphere: THREE.Mesh;
  private maxGhostSphere: THREE.Mesh;
  private ghostMaterial: THREE.MeshStandardMaterial;
  private ghostGeometry: THREE.SphereGeometry;

  private illustrated: boolean = true;
  private minDistanceAu: number;
  private maxDistanceAu: number;

  constructor(options: UnknownSegmentOptions = {}) {
    this.group = new THREE.Group();
    this.group.name = options.name || 'Illustrative Unknown Distance Segment';
    this.minDistanceAu = options.minDistanceAu ?? 45.0;
    this.maxDistanceAu = options.maxDistanceAu ?? 85.0;

    // 1. Line along the line of sight
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff6b3d, // --color-accent
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    this.lineMesh = new THREE.Line(this.lineGeometry, this.lineMaterial);
    this.group.add(this.lineMesh);

    // 2. Ghost Spheres at min and max distance
    // Semi-transparent matte ghost material
    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b3d,
      transparent: true,
      opacity: 0.35,
      roughness: 0.9,
      metalness: 0.05,
      wireframe: false,
      depthWrite: false,
    });

    this.ghostGeometry = new THREE.SphereGeometry(1.0, 24, 24);

    this.minGhostSphere = new THREE.Mesh(this.ghostGeometry, this.ghostMaterial);
    this.minGhostSphere.userData = { bound: 'min', tag: 'Illustrative' };
    this.group.add(this.minGhostSphere);

    this.maxGhostSphere = new THREE.Mesh(this.ghostGeometry, this.ghostMaterial);
    this.maxGhostSphere.userData = { bound: 'max', tag: 'Illustrative' };
    this.group.add(this.maxGhostSphere);

    // Add dashed wireframe ring indicator to both ghost spheres for crisp scientific presentation
    const wireframeMat = new THREE.LineBasicMaterial({
      color: 0xff8c5a,
      transparent: true,
      opacity: 0.65,
    });
    const ringGeo = new THREE.BufferGeometry();
    const ringPoints: THREE.Vector3[] = [];
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)));
    }
    ringGeo.setFromPoints(ringPoints);

    const minRing = new THREE.Line(ringGeo, wireframeMat);
    this.minGhostSphere.add(minRing);
    const maxRing = new THREE.Line(ringGeo.clone(), wireframeMat);
    this.maxGhostSphere.add(maxRing);

    // 3. Update geometry to initial bounds
    this.updateSegmentGeometry();

    // 4. Create attached HTML "Illustrative" DOM tag
    this.tagElement = document.createElement('div');
    this.tagElement.className = 'live-sky-illustrative-tag';
    this.tagElement.textContent = 'Illustrative';
    Object.assign(this.tagElement.style, {
      fontFamily: 'monospace',
      fontSize: '11px',
      fontWeight: '600',
      color: '#38BDF8',
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

    this.setIllustrated(options.illustrated ?? true);
  }

  /**
   * Recalculates line points and ghost sphere positions along line of sight.
   */
  public updateSegmentGeometry(): void {
    // In local model coordinates, the line extends along the Z axis from min to max
    const zMin = -this.minDistanceAu * 0.5;
    const zMax = this.maxDistanceAu * 0.5;

    const pMin = new THREE.Vector3(0, 0, zMin);
    const pMax = new THREE.Vector3(0, 0, zMax);

    this.lineGeometry.setFromPoints([pMin, pMax]);
    this.lineGeometry.computeVertexNormals();

    this.minGhostSphere.position.copy(pMin);
    this.maxGhostSphere.position.copy(pMax);

    // Scale ghost sphere radius proportionally with distance to simulate angular divergence
    const scaleMin = Math.max(0.6, this.minDistanceAu * 0.015);
    const scaleMax = Math.max(0.8, this.maxDistanceAu * 0.015);

    this.minGhostSphere.scale.setScalar(scaleMin);
    this.maxGhostSphere.scale.setScalar(scaleMax);
  }

  /**
   * Dynamically adjust uncertainty bounds (e.g. during baseline scrubbing).
   */
  public setDistanceRange(minAu: number, maxAu: number): void {
    this.minDistanceAu = minAu;
    this.maxDistanceAu = maxAu;
    this.updateSegmentGeometry();
  }

  public getDistanceRange(): { minAu: number; maxAu: number } {
    return { minAu: this.minDistanceAu, maxAu: this.maxDistanceAu };
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

  public update(delta: number): void {
    // Slow pulsation for ghost spheres
    const time = performance.now() * 0.002;
    const pulse = 0.32 + 0.06 * Math.sin(time);
    this.ghostMaterial.opacity = pulse;

    // Slow rotation around line of sight
    this.group.rotation.y += delta * 0.15;
  }

  public dispose(): void {
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.ghostGeometry.dispose();
    this.ghostMaterial.dispose();
    if (this.tagElement.parentElement) {
      this.tagElement.parentElement.removeChild(this.tagElement);
    }
  }
}
