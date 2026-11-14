/**
 * exploreObjectWorkflow.test.ts - Unit Tests for /api/explore-object Workflow
 */

import assert from 'node:assert';
import {
  isHttpUrl,
  executeExploreObjectWorkflow,
  ExploreObjectResult,
} from './exploreObjectWorkflow';
import { POST as appRouterPost, GET as appRouterGet } from '../app/api/explore-object/route';
import pagesRouterHandler from '../pages/api/explore-object';

async function runTests() {
  console.log('🧪 Starting /api/explore-object Workflow Unit Tests...\n');

  // Test 1: URL vs Plain Name detection
  console.log('--- Test Suite 1: Query Type Determination (URL vs Name) ---');
  assert.strictEqual(isHttpUrl('https://science.nasa.gov/solar-system/asteroids/1-ceres/'), true);
  assert.strictEqual(isHttpUrl('http://en.wikipedia.org/wiki/Ceres_(dwarf_planet)'), true);
  assert.strictEqual(isHttpUrl('1 Ceres'), false);
  assert.strictEqual(isHttpUrl('Halley Comet'), false);
  assert.strictEqual(isHttpUrl('Jupiter'), false);
  assert.strictEqual(isHttpUrl(''), false);
  console.log('  ✓ Correctly differentiates URLs and plain names');

  // Test 2: Input Validation (Empty Query)
  console.log('\n--- Test Suite 2: Input Validation ---');
  await assert.rejects(
    async () => {
      await executeExploreObjectWorkflow('');
    },
    {
      name: 'Error',
      message: "Parameter 'query' is required.",
    }
  );
  console.log('  ✓ Rejects empty queries with descriptive error');

  // Test 3: Exploration by Plain Name (e.g. "Ceres")
  console.log('\n--- Test Suite 3: Exploration by Plain Name ---');
  const ceresResult: ExploreObjectResult = await executeExploreObjectWorkflow('Ceres');
  console.log('  Ceres Name:', ceresResult.name);
  console.log('  Ceres Classification:', ceresResult.classification);
  console.log('  Ceres Procedural 3D:', JSON.stringify(ceresResult.procedural3D));
  console.log('  Ceres Coordinates:', JSON.stringify(ceresResult.coordinates));

  assert.ok(ceresResult.name.toLowerCase().includes('ceres'), 'Name should include Ceres');
  assert.ok(
    ['asteroid', 'planet', 'unknown'].includes(ceresResult.classification),
    `Invalid classification: ${ceresResult.classification}`
  );
  assert.strictEqual(typeof ceresResult.coordinates.distance_au, 'number');
  assert.strictEqual(typeof ceresResult.coordinates.ra, 'number');
  assert.strictEqual(typeof ceresResult.coordinates.dec, 'number');
  assert.ok(ceresResult.procedural3D.baseColorHex.startsWith('#'), 'Base color must be hex');
  assert.ok(
    ['rocky', 'gaseous', 'icy'].includes(ceresResult.procedural3D.surfaceTexture),
    'Surface texture must be rocky, gaseous, or icy'
  );
  assert.strictEqual(typeof ceresResult.procedural3D.relativeSize, 'number');
  assert.ok(ceresResult.educationalData.summary.length > 20, 'Summary must be non-empty');
  assert.ok(Array.isArray(ceresResult.educationalData.notableFacts), 'Notable facts must be an array');
  assert.ok(ceresResult.educationalData.notableFacts.length >= 1, 'Must have at least 1 notable fact');
  assert.ok(Array.isArray(ceresResult.educationalData.mediaUrls), 'Media URLs must be an array');
  console.log('  ✓ Successfully explored object by plain name and conformed to strict schema');

  // Test 4: Exploration by URL (Wikipedia or NASA)
  console.log('\n--- Test Suite 4: Exploration by URL ---');
  const urlResult: ExploreObjectResult = await executeExploreObjectWorkflow(
    'https://en.wikipedia.org/wiki/Halley%27s_Comet'
  );
  console.log('  URL Object Name:', urlResult.name);
  console.log('  URL Object Classification:', urlResult.classification);
  assert.ok(typeof urlResult.name === 'string' && urlResult.name.length > 0);
  assert.ok(
    ['comet', 'asteroid', 'planet', 'star', 'unknown'].includes(urlResult.classification)
  );
  assert.ok(['rocky', 'gaseous', 'icy'].includes(urlResult.procedural3D.surfaceTexture));
  console.log('  ✓ Successfully scraped URL and conformed to strict schema');

  // Test 5: Next.js App Router POST Route Handler
  console.log('\n--- Test Suite 5: App Router Route Handler ---');
  // 5a. Missing body
  const badReq = new Request('http://localhost:3000/api/explore-object', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });
  const badRes = await appRouterPost(badReq);
  assert.strictEqual(badRes.status, 400);
  const badJson = await badRes.json();
  assert.ok(badJson.error.includes("Field 'query' is required"));
  console.log('  ✓ App Router POST returns 400 on missing query');

  // 5b. Valid query
  const goodReq = new Request('http://localhost:3000/api/explore-object', {
    method: 'POST',
    body: JSON.stringify({ query: 'Jupiter' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const goodRes = await appRouterPost(goodReq);
  assert.strictEqual(goodRes.status, 200);
  const goodJson = await goodRes.json();
  assert.ok(goodJson.name.toLowerCase().includes('jupiter'));
  assert.strictEqual(goodJson.classification, 'planet');
  assert.strictEqual(goodJson.procedural3D.surfaceTexture, 'gaseous');
  console.log('  ✓ App Router POST returns 200 with structured Jupiter workspace payload');

  // Test 6: Next.js Pages Router Handler
  console.log('\n--- Test Suite 6: Pages Router Handler ---');
  let pagesStatusCode = 0;
  let pagesResultBody: any = null;

  const mockReq: any = {
    method: 'POST',
    body: { query: 'Barnard\'s Star' },
    query: {},
  };
  const mockRes: any = {
    status(code: number) {
      pagesStatusCode = code;
      return this;
    },
    json(body: any) {
      pagesResultBody = body;
    },
  };

  await pagesRouterHandler(mockReq, mockRes);
  assert.strictEqual(pagesStatusCode, 200);
  assert.strictEqual(pagesResultBody.classification, 'star');
  assert.ok(pagesResultBody.coordinates.distance_au > 1000.0);
  console.log('  ✓ Pages Router handler returns 200 with structured star payload');

  console.log('\n🎉 All /api/explore-object tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
