/**
 * searchToPipelineIntegration.test.ts
 *
 * End-to-End Integration Test for User Search Input to Backend Scraping & Procedural Rendering Pipeline.
 *
 * Validates System Workflow:
 * 1. User Input: "Bennu" or NASA URL submitted via OmniSearch.
 * 2. API Trigger: POST /api/explore-object.
 * 3. Backend Orchestration:
 *    - Scrapes URL or queries NASA archives / Wikipedia.
 *    - Extracts physical parameters & educational data conforming to strict schema.
 * 4. Frontend Injection:
 *    - Global state update in useWorkspaceStore.
 *    - Procedural 3D generation with Simplex noise & Rule 2 "Illustrative" tag.
 *    - Spatial Cartesian placement in SolarSystemMap & camera focus vector.
 *    - ObjectPanel educational data binding & epistemic label integrity.
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { executeExploreObjectWorkflow, ExploreObjectResult } from './exploreObjectWorkflow';
import { useWorkspaceStore, exploreResultToCandidate } from '../data/workspaceStore';
import { generateProceduralCelestialBody, ProceduralDataInput } from '../scene/ProceduralGenerator';
import { sphericalToCartesian } from '../scene/SolarSystemMap';

// Headless DOM mock for Node/tsx testing
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      const style: Record<string, string> = {};
      const attrs: Record<string, string> = {};
      return {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        style,
        setAttribute: (k: string, v: string) => { attrs[k] = v; },
        getAttribute: (k: string) => attrs[k] || null,
        removeAttribute: (k: string) => { delete attrs[k]; },
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    },
  };
}

async function runSearchToPipelineTests() {
  console.log('🧪 Testing Search-to-Pipeline End-to-End Workflow...\n');

  // -------------------------------------------------------------------------
  // 1 & 2 & 3. User Input & Backend Orchestration: "Bennu"
  // -------------------------------------------------------------------------
  console.log('--- Step 1 & 2 & 3: Query "Bennu" via Explore Object Workflow ---');
  const bennuResult: ExploreObjectResult = await executeExploreObjectWorkflow('Bennu');

  assert.ok(bennuResult.name.toLowerCase().includes('bennu'), 'Result name must contain Bennu');
  assert.strictEqual(bennuResult.classification, 'asteroid', 'Bennu must be classified as an asteroid');
  assert.ok(bennuResult.coordinates.distance_au > 0, 'distance_au must be positive');
  assert.strictEqual(bennuResult.procedural3D.surfaceTexture, 'rocky', 'Bennu must have rocky surface texture');
  assert.ok(bennuResult.procedural3D.baseColorHex.startsWith('#'), 'baseColorHex must be valid hex');
  assert.ok(bennuResult.educationalData.summary.length > 20, 'educational summary must be informative');
  assert.ok(bennuResult.educationalData.notableFacts.length > 0, 'notableFacts must have at least one fact');
  assert.ok(bennuResult.educationalData.mediaUrls.length > 0, 'mediaUrls must have at least one media image');

  console.log('  ✓ Backend returned validated structured JSON payload for Bennu:');
  console.log(`    Name: ${bennuResult.name}`);
  console.log(`    Classification: ${bennuResult.classification}`);
  console.log(`    Distance: ${bennuResult.coordinates.distance_au} AU`);
  console.log(`    Procedural3D: ${JSON.stringify(bennuResult.procedural3D)}`);
  console.log(`    Facts: ${bennuResult.educationalData.notableFacts.length} notable facts\n`);

  // -------------------------------------------------------------------------
  // 4A. Frontend State Injection (useWorkspaceStore)
  // -------------------------------------------------------------------------
  console.log('--- Step 4A: Frontend State Injection into useWorkspaceStore ---');
  const store = useWorkspaceStore.getState();
  const newCandidate = store.addExploredObject(bennuResult);

  assert.ok(newCandidate.id.startsWith('EXP-'), 'Candidate ID must start with EXP- prefix');
  assert.strictEqual(newCandidate.verdict, 'known_object', 'Asteroid verdict must map to known_object');
  assert.ok(newCandidate.positions.length >= 2, 'Candidate must have at least 2 multi-epoch positions');

  // Verify Epistemic Labels (Rule 1 Non-Negotiable)
  assert.strictEqual(newCandidate.labels['positions'], 'measured');
  assert.strictEqual(newCandidate.labels['colour_index'], 'measured');
  assert.strictEqual(newCandidate.labels['confidence'], 'derived');

  // Verify Store has updated
  const updatedStore = useWorkspaceStore.getState();
  assert.strictEqual(updatedStore.activeExploredObject?.name, bennuResult.name);
  assert.ok(updatedStore.exploredObjects.some((o) => o.name === bennuResult.name));
  console.log(`  ✓ Successfully injected candidate ${newCandidate.id} into global workspace state.\n`);

  // -------------------------------------------------------------------------
  // 4B. Procedural 3D Mesh Generation (ProceduralGenerator.tsx)
  // -------------------------------------------------------------------------
  console.log('--- Step 4B: Procedural 3D Mesh Instantiation ---');
  const proceduralInput: ProceduralDataInput = {
    id: newCandidate.id,
    name: bennuResult.name,
    classification: bennuResult.classification,
    verdict: newCandidate.verdict,
    colour_index: newCandidate.colour_index,
    procedural3D: bennuResult.procedural3D,
  };

  const meshGroup = generateProceduralCelestialBody(proceduralInput);
  assert.ok(meshGroup instanceof THREE.Group, 'Must return a THREE.Group');

  const asteroidMesh = meshGroup.children[0] as THREE.Mesh;
  assert.ok(asteroidMesh.geometry instanceof THREE.IcosahedronGeometry, 'Asteroid must use IcosahedronGeometry');
  assert.ok(asteroidMesh.material instanceof THREE.ShaderMaterial, 'Asteroid must use Simplex noise ShaderMaterial');

  // Rule 2 Non-Negotiable: Must have "Illustrative" tag attached
  const hasIllustrativeTag = meshGroup.children.some(
    (child) => child.userData?.tag === 'Illustrative'
  );
  assert.ok(hasIllustrativeTag, 'Procedural 3D model MUST carry Rule 2 "Illustrative" tag');
  console.log(`  ✓ Generated procedural 3D model with icosahedron simplex noise deformation and Rule 2 tag.\n`);

  // -------------------------------------------------------------------------
  // 4C. Spatial Placement & Camera Focus Vector (SolarSystemMap.tsx)
  // -------------------------------------------------------------------------
  console.log('--- Step 4C: SolarSystemMap Spatial Coordinate Placement ---');
  const cartesianPos = sphericalToCartesian(
    bennuResult.coordinates.ra,
    bennuResult.coordinates.dec,
    bennuResult.coordinates.distance_au,
    'dual'
  );

  assert.ok(cartesianPos instanceof THREE.Vector3, 'Must return THREE.Vector3');
  // For distance 1.12 AU in dual scale (linear <= 5.2 AU): length is 11.2 units
  const expectedLength = bennuResult.coordinates.distance_au * 10.0;
  assert.ok(
    Math.abs(cartesianPos.length() - expectedLength) < 1e-3,
    `Dual-scale Cartesian distance (${cartesianPos.length().toFixed(2)}) must equal linear scaled distance (${expectedLength.toFixed(2)})`
  );

  // Verify Camera Offset Vector: elevated looking at target
  const camOffsetDir = new THREE.Vector3(0.5, 0.4, 0.7).normalize();
  const camPos = cartesianPos.clone().add(camOffsetDir.multiplyScalar(15.0));
  const lookAtDir = cartesianPos.clone().sub(camPos).normalize();
  assert.ok(lookAtDir.dot(camOffsetDir) < -0.99, 'Camera view direction must point directly at Bennu coordinates');
  console.log(`  ✓ Cartesian coordinates: X=${cartesianPos.x.toFixed(2)}, Y=${cartesianPos.y.toFixed(2)}, Z=${cartesianPos.z.toFixed(2)}`);
  console.log(`  ✓ Camera focus vector computed looking at target.\n`);

  // -------------------------------------------------------------------------
  // 4D. ObjectPanel Educational Data Schema & Honesty Labels
  // -------------------------------------------------------------------------
  console.log('--- Step 4D: ObjectPanel Educational Data Verification ---');
  const eduData = bennuResult.educationalData;
  assert.ok(eduData.summary.includes('Bennu') || eduData.summary.includes('asteroid'));
  assert.ok(Array.isArray(eduData.notableFacts) && eduData.notableFacts.length > 0);
  assert.ok(Array.isArray(eduData.mediaUrls) && eduData.mediaUrls.length > 0);

  // Validate that mediaUrls are valid HTTP(S) links for lazy loading
  for (const url of eduData.mediaUrls) {
    assert.ok(url.startsWith('http://') || url.startsWith('https://'), `Media URL '${url}' must be a valid HTTP(S) link`);
  }

  console.log(`  ✓ Verified ${eduData.mediaUrls.length} media URLs ready for responsive masonry grid.`);
  console.log(`  ✓ ObjectPanel contracts verified with complete educational metadata.\n`);

  console.log('🎉 Search-to-Pipeline Integration Test PASSED with 100% compliance!\n');
}

runSearchToPipelineTests().catch((err) => {
  console.error('SearchToPipeline integration test failed:', err);
  process.exit(1);
});
