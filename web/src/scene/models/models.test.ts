/**
 * Test Suite for Illustrative 3D Models (web/src/scene/models)
 *
 * Verifies:
 * - Asteroid: noise-displaced icosahedron, matte material, colour_index mapping from data
 * - Unknown segment: line along line of sight with ghost spheres at min and max distance
 * - setIllustrated(boolean): controls HTML "Illustrative" tag visibility
 * - Non-negotiable compliance: all illustrative models tagged "Illustrative"
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AsteroidModel } from './Asteroid';
import { UnknownSegmentModel } from './UnknownSegment';

// Minimal mock for DOM document if running under pure Node
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      const style: Record<string, string> = {};
      return {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        style,
        parentElement: null as any,
        appendChild: () => {},
        removeChild: () => {},
      };
    },
  };
}

async function runModelTests() {
  console.log('Testing web/src/scene/models illustrative models...');

  // 1. Asteroid Model Tests
  console.log('  1. Testing AsteroidModel...');
  const asteroid = new AsteroidModel({
    radius: 2.0,
    detail: 2,
    seed: 12345,
    colourIndex: 1.15,
  });

  assert.ok(asteroid.group instanceof THREE.Group, 'Asteroid group must be a THREE.Group');
  assert.strictEqual(asteroid.isIllustrated(), true, 'Asteroid must be illustrated by default');
  assert.strictEqual(asteroid.tagElement.textContent, 'Illustrative', 'Tag text must be "Illustrative"');
  assert.strictEqual(asteroid.tagElement.style.display, 'inline-flex', 'Tag must be visible when illustrated');

  // Verify Matte Material
  const asteroidMesh = asteroid.group.children[0] as THREE.Mesh;
  assert.ok(asteroidMesh instanceof THREE.Mesh, 'First child must be a mesh');
  const mat = asteroidMesh.material as THREE.MeshStandardMaterial;
  assert.strictEqual(mat.roughness, 0.88, 'Asteroid material roughness must be 0.88 (matte)');
  assert.strictEqual(mat.metalness, 0.05, 'Asteroid material metalness must be 0.05 (non-metallic regolith)');

  // Verify Geometry is noise-displaced (not perfectly spherical)
  const geom = asteroidMesh.geometry as THREE.BufferGeometry;
  const posAttr = geom.attributes.position;
  let hasDisplacement = false;
  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    const dist = v.length();
    // In a pure icosahedron sphere of radius 2.0, len is 2.0. In displaced, it varies:
    if (Math.abs(dist - 2.0) > 0.05) {
      hasDisplacement = true;
      break;
    }
  }
  assert.ok(hasDisplacement, 'Asteroid vertices must be displaced by procedural noise');

  // Verify colour_index mapping from data
  const colC = AsteroidModel.colourIndexToColor(0.65); // C-type
  const colS = AsteroidModel.colourIndexToColor(1.15); // S-type
  const colTNO = AsteroidModel.colourIndexToColor(2.10); // High-red outer body
  assert.notStrictEqual(colC.getHexString(), colS.getHexString(), 'C-type and S-type must have distinct colors');
  assert.notStrictEqual(colS.getHexString(), colTNO.getHexString(), 'S-type and TNO must have distinct colors');

  // Test setColourIndex updates mesh material
  asteroid.setColourIndex(2.20);
  assert.strictEqual(asteroid.getColourIndex(), 2.20, 'setColourIndex must update stored index');
  assert.strictEqual(mat.color.getHexString(), AsteroidModel.colourIndexToColor(2.20).getHexString(), 'Mesh material color must reflect updated colour_index');

  // Test setIllustrated(false) hides HTML tag
  asteroid.setIllustrated(false);
  assert.strictEqual(asteroid.isIllustrated(), false, 'isIllustrated must return false');
  assert.strictEqual(asteroid.tagElement.style.display, 'none', 'Tag must be hidden when illustrated is false');

  // Test setIllustrated(true) shows HTML tag
  asteroid.setIllustrated(true);
  assert.strictEqual(asteroid.isIllustrated(), true, 'isIllustrated must return true');
  assert.strictEqual(asteroid.tagElement.style.display, 'inline-flex', 'Tag must be visible when illustrated is true');

  // 2. Unknown Segment Model Tests
  console.log('  2. Testing UnknownSegmentModel...');
  const segment = new UnknownSegmentModel({
    minDistanceAu: 40.0,
    maxDistanceAu: 80.0,
  });

  assert.ok(segment.group instanceof THREE.Group, 'Segment group must be a THREE.Group');
  assert.strictEqual(segment.isIllustrated(), true, 'Unknown segment must be illustrated by default');
  assert.strictEqual(segment.tagElement.textContent, 'Illustrative', 'Tag text must be "Illustrative"');
  assert.strictEqual(segment.tagElement.style.display, 'inline-flex', 'Tag must be visible when illustrated');

  // Check children: line, minGhostSphere, maxGhostSphere
  const line = segment.group.children.find((c) => c instanceof THREE.Line);
  assert.ok(line, 'Must contain a line along line-of-sight');

  const ghostSpheres = segment.group.children.filter((c) => c.userData?.bound === 'min' || c.userData?.bound === 'max');
  assert.strictEqual(ghostSpheres.length, 2, 'Must contain ghost spheres at min and max distance bounds');

  const minGhost = ghostSpheres.find((c) => c.userData?.bound === 'min') as THREE.Mesh;
  const maxGhost = ghostSpheres.find((c) => c.userData?.bound === 'max') as THREE.Mesh;
  assert.ok(minGhost, 'Must have min ghost sphere');
  assert.ok(maxGhost, 'Must have max ghost sphere');

  // Ghost spheres must be semi-transparent
  const ghostMat = minGhost.material as THREE.MeshStandardMaterial;
  assert.strictEqual(ghostMat.transparent, true, 'Ghost material must be transparent');
  assert.ok(ghostMat.opacity < 0.6, 'Ghost material must have translucent opacity (< 0.6)');

  // Verify position coordinates correspond to bounds
  assert.strictEqual(minGhost.position.z, -40.0 * 0.5, 'Min ghost sphere position.z must match min distance');
  assert.strictEqual(maxGhost.position.z, 80.0 * 0.5, 'Max ghost sphere position.z must match max distance');

  // Test setDistanceRange updates coordinates
  segment.setDistanceRange(30.0, 95.0);
  const bounds = segment.getDistanceRange();
  assert.strictEqual(bounds.minAu, 30.0, 'Min distance must update to 30.0');
  assert.strictEqual(bounds.maxAu, 95.0, 'Max distance must update to 95.0');
  assert.strictEqual(minGhost.position.z, -30.0 * 0.5, 'Updated min ghost sphere position must match 30.0');
  assert.strictEqual(maxGhost.position.z, 95.0 * 0.5, 'Updated max ghost sphere position must match 95.0');

  // Test setIllustrated(false) and setIllustrated(true)
  segment.setIllustrated(false);
  assert.strictEqual(segment.isIllustrated(), false);
  assert.strictEqual(segment.tagElement.style.display, 'none');

  segment.setIllustrated(true);
  assert.strictEqual(segment.isIllustrated(), true);
  assert.strictEqual(segment.tagElement.style.display, 'inline-flex');

  // Cleanup
  asteroid.dispose();
  segment.dispose();

  console.log('All illustrative model tests passed successfully!');
}

runModelTests().catch((err) => {
  console.error('Model test failed:', err);
  process.exit(1);
});
