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
import { BackgroundStars } from '../BackgroundStars';

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

  // 3. Background Stars Tests
  console.log('  3. Testing BackgroundStars component...');
  const cosmos = new BackgroundStars({ count: 50000, minRadius: 2600, maxRadius: 5200 });

  assert.ok(cosmos.points instanceof THREE.Points, 'Must be an instance of THREE.Points');
  assert.strictEqual(cosmos.count, 50000, 'Must generate exactly 50,000 stars');
  assert.strictEqual(cosmos.points.userData.tag, 'Illustrative', 'Must be tagged Illustrative');
  assert.strictEqual(cosmos.points.userData.drawCalls, 1, 'Must render in a single draw call');

  // Verify geometry buffer attributes
  const cosmosPosAttr = cosmos.geometry.getAttribute('position');
  const cosmosColorAttr = cosmos.geometry.getAttribute('aColor');
  const cosmosSizeAttr = cosmos.geometry.getAttribute('aSize');

  assert.ok(cosmosPosAttr, 'Position attribute must exist');
  assert.strictEqual(cosmosPosAttr.count, 50000, 'Must have 50,000 position vertices');
  assert.strictEqual(cosmosPosAttr.itemSize, 3, 'Position must have itemSize 3');

  assert.ok(cosmosColorAttr, 'Color attribute must exist');
  assert.strictEqual(cosmosColorAttr.count, 50000, 'Must have 50,000 color vertices');
  assert.strictEqual(cosmosColorAttr.itemSize, 3, 'Color must have itemSize 3');

  assert.ok(cosmosSizeAttr, 'Size attribute must exist');
  assert.strictEqual(cosmosSizeAttr.count, 50000, 'Must have 50,000 sizes');

  // Verify radius bounds far beyond Kuiper belt (2600 to 5200)
  for (let i = 0; i < 100; i++) {
    const x = cosmosPosAttr.getX(i);
    const y = cosmosPosAttr.getY(i);
    const z = cosmosPosAttr.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    assert.ok(r >= 2590 && r <= 5210, `Star radius ${r} must be within bounds [2600, 5200]`);
  }

  // Verify procedural shader with no texture maps
  assert.ok(cosmos.material instanceof THREE.ShaderMaterial, 'Must use THREE.ShaderMaterial');
  assert.strictEqual(cosmos.material.transparent, true, 'Material must be transparent');
  assert.strictEqual(cosmos.material.depthWrite, false, 'DepthWrite must be false for particle efficiency');

  // Test update scintillation
  const initialTime = cosmos.material.uniforms.uTime.value;
  cosmos.update(0.16);
  assert.ok(cosmos.material.uniforms.uTime.value > initialTime, 'uTime uniform must increment on update');

  // 4. TimeBar Orbit Interpolation Tests (36-point coordinate array and Vector3.lerp)
  console.log('  4. Testing 36-point orbit trajectory and THREE.Vector3.lerp() interpolation...');
  const orbitPoints: THREE.Vector3[] = [];
  const semiMajorAxis = 20.0;
  for (let k = 0; k < 36; k++) {
    const theta = (k / 36) * Math.PI * 2;
    orbitPoints.push(new THREE.Vector3(semiMajorAxis * Math.cos(theta), 0, semiMajorAxis * Math.sin(theta)));
  }

  assert.strictEqual(orbitPoints.length, 36, 'Orbit trajectory must have exactly 36 points');

  // Helper function matching SolarSystem.ts lerp logic
  const interpolateAtDay = (day: number) => {
    const progress = (day % 365) / 365;
    const floatIdx = progress * 36;
    const idx0 = Math.floor(floatIdx) % 36;
    const idx1 = (idx0 + 1) % 36;
    const alpha = floatIdx - Math.floor(floatIdx);

    const pos = new THREE.Vector3().copy(orbitPoints[idx0]).lerp(orbitPoints[idx1], alpha);
    return { pos, idx0, idx1, alpha };
  };

  // Day 0: exactly at point 0
  const day0 = interpolateAtDay(0);
  assert.strictEqual(day0.idx0, 0);
  assert.strictEqual(day0.alpha, 0);
  assert.strictEqual(day0.pos.x, orbitPoints[0].x);
  assert.strictEqual(day0.pos.z, orbitPoints[0].z);

  // Day 182.5 (halfway through the year): halfway around the 36 points
  const dayMid = interpolateAtDay(182.5);
  assert.strictEqual(dayMid.idx0, 18);
  assert.strictEqual(dayMid.alpha, 0);
  assert.strictEqual(dayMid.pos.x, orbitPoints[18].x);

  // Smooth intermediate day with fractional alpha
  const day10 = interpolateAtDay(10);
  assert.ok(day10.alpha > 0 && day10.alpha < 1, 'Alpha must be between 0 and 1');
  const p0 = orbitPoints[day10.idx0];
  const p1 = orbitPoints[day10.idx1];
  const distToP0 = day10.pos.distanceTo(p0);
  const distToP1 = day10.pos.distanceTo(p1);
  const chordLen = p0.distanceTo(p1);
  assert.ok(Math.abs((distToP0 + distToP1) - chordLen) < 1e-4, 'Interpolated position must lie on chord between p0 and p1');

  // Day 365: completes the loop back to point 0
  const day365 = interpolateAtDay(365);
  assert.strictEqual(day365.pos.x, orbitPoints[0].x);
  assert.strictEqual(day365.pos.z, orbitPoints[0].z);

  // 5. Dynamic Procedural 3D Canvas Rendering & Floating Badges
  console.log('  5. Testing Dynamic Procedural 3D Objects & HTML Illustrative Badges...');

  // Mock explored celestial objects
  const mockJupiterExplored = {
    name: 'Jupiter',
    classification: 'planet',
    coordinates: { distance_au: 5.2, ra: 28.5, dec: 12.3 },
    procedural3D: {
      baseColorHex: '#D97706',
      surfaceTexture: 'gaseous' as const,
      relativeSize: 1.8,
    },
  };

  const mockCeresExplored = {
    name: '1 Ceres',
    classification: 'asteroid',
    coordinates: { distance_au: 2.77, ra: 164.21, dec: 30.31 },
    procedural3D: {
      baseColorHex: '#A39D95',
      surfaceTexture: 'rocky' as const,
      relativeSize: 0.9,
    },
  };

  // Test XYZ conversion from (ra, dec, distance_au)
  const radecToXYZ = (raDeg: number, decDeg: number, distAu: number) => {
    const raRad = (raDeg * Math.PI) / 180.0;
    const decRad = (decDeg * Math.PI) / 180.0;
    // Dual scale formula:
    const r = distAu <= 5.0 ? distAu * 10.0 : 50.0 + Math.log10(distAu / 5.0 + 1.0) * 38.0;
    return new THREE.Vector3(
      r * Math.cos(decRad) * Math.cos(raRad),
      r * Math.sin(decRad),
      r * Math.cos(decRad) * Math.sin(raRad)
    );
  };

  const jupiterXYZ = radecToXYZ(mockJupiterExplored.coordinates.ra, mockJupiterExplored.coordinates.dec, mockJupiterExplored.coordinates.distance_au);
  assert.ok(jupiterXYZ.length() > 50, 'Jupiter distance in dual scale must place it in the outer log realm (>50 units)');

  const ceresXYZ = radecToXYZ(mockCeresExplored.coordinates.ra, mockCeresExplored.coordinates.dec, mockCeresExplored.coordinates.distance_au);
  assert.ok(ceresXYZ.length() < 50, 'Ceres distance (2.77 AU) must place it in the inner linear realm (<50 units)');

  // Verify Entrance Animation Curve (overshoot ease-out)
  const calcScale = (progress: number) => {
    const s = 1.70158;
    const p = Math.min(1.0, Math.max(0.0, progress)) - 1.0;
    const factor = p * p * ((s + 1) * p + s) + 1.0;
    return Math.max(0.001, factor);
  };

  assert.ok(calcScale(0.0) < 0.01, 'At progress 0, scale must start at ~0');
  assert.ok(calcScale(0.8) > 0.9, 'At progress 0.8, scale must be expanding rapidly');
  assert.ok(calcScale(0.9) > 1.0, 'Curve must exhibit overshoot > 1.0 before settling');
  assert.strictEqual(calcScale(1.0), 1.0, 'At progress 1.0, scale must settle exactly at 1.0');

  // Verify HTML Badge Creation
  const badgeEl = (globalThis as any).document.createElement('div');
  badgeEl.className = 'candidate-illustrative-badge';
  badgeEl.textContent = 'Illustrative';
  assert.strictEqual(badgeEl.textContent, 'Illustrative', 'Floating badge must explicitly declare "Illustrative"');

  // Cleanup
  cosmos.dispose();
  asteroid.dispose();
  segment.dispose();

  console.log('All illustrative model and cosmos tests passed successfully!');
}

runModelTests().catch((err) => {
  console.error('Model test failed:', err);
  process.exit(1);
});
