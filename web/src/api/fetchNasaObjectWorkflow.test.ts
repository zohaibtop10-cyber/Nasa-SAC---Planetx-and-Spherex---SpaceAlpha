import assert from 'node:assert';
import {
  scrapeNasaUrl,
  extractObjectDetails,
  compileProceduralRenderState,
  executeMultiAgentPipeline,
  ScrapedData,
} from './fetchNasaObjectWorkflow';
import { GET as appRouterGet, POST as appRouterPost } from '../app/api/fetch-nasa-object/route';
import pagesRouterHandler from '../pages/api/fetch-nasa-object';

async function runTests() {
  console.log('🧪 Starting Multi-Agent NASA Object Workflow Unit Tests...\n');

  // -------------------------------------------------------------------------
  // Test Suite 1: Agent 1 (Scraper) Input Validation & Error Handling
  // -------------------------------------------------------------------------
  console.log('--- Test Suite 1: Agent 1 (Scraper) Validation & Timeouts ---');

  await assert.rejects(
    async () => {
      await scrapeNasaUrl('');
    },
    /Missing or invalid 'url' parameter/,
    'Should reject empty URL'
  );

  await assert.rejects(
    async () => {
      await scrapeNasaUrl('ftp://nasa.gov/file.txt');
    },
    /Unsupported URL protocol/,
    'Should reject non-HTTP/HTTPS protocol'
  );

  await assert.rejects(
    async () => {
      await scrapeNasaUrl('not-a-valid-url');
    },
    /Invalid URL format/,
    'Should reject malformed URL'
  );

  console.log('  ✓ Agent 1 validation correctly rejects invalid and empty URLs');

  // Test timeout handling with mock or unreachable port
  await assert.rejects(
    async () => {
      // 10.255.255.1 is non-routable, will timeout quickly with 50ms limit
      await scrapeNasaUrl('http://10.255.255.1/test', 50);
    },
    /(timed out|Failed to scrape)/i,
    'Should timeout gracefully on slow/unreachable targets'
  );
  console.log('  ✓ Agent 1 gracefully handles request timeouts');

  // -------------------------------------------------------------------------
  // Test Suite 2: Agent 2 (Extractor) Heuristic & Schema Conformity
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 2: Agent 2 (Extractor) Schema Conformity ---');

  const mockCometScraped: ScrapedData = {
    url: 'https://science.nasa.gov/solar-system/comets/1p-halley/',
    title: '1P/Halley - NASA Science',
    articleText: 'Comet 1P/Halley is arguably the most famous comet. It is a periodic comet with an orbital period of about 75-76 years. Its coma and dust tail brighten dramatically near perihelion.',
    images: ['https://science.nasa.gov/wp-content/uploads/2023/halley.jpg'],
  };

  const cometExtracted = await extractObjectDetails(mockCometScraped);
  assert.strictEqual(cometExtracted.classification, 'comet', 'Classification should be comet');
  assert.ok(cometExtracted.name.includes('Halley'), 'Extracted name should include Halley');
  assert.ok(typeof cometExtracted.summary === 'string' && cometExtracted.summary.length > 10, 'Summary should be extracted');
  assert.ok(Array.isArray(cometExtracted.images) && cometExtracted.images.length === 1, 'Images should match');
  console.log('  ✓ Agent 2 extracts comet metadata successfully');

  const mockAsteroidScraped: ScrapedData = {
    url: 'https://science.nasa.gov/solar-system/asteroids/1-ceres/',
    title: '1 Ceres - Dwarf Planet & Asteroid',
    articleText: 'Ceres is the largest object in the asteroid belt between Mars and Jupiter. It was classified as a dwarf planet in 2006.',
    images: ['https://science.nasa.gov/wp-content/uploads/2023/ceres.jpg'],
  };

  const asteroidExtracted = await extractObjectDetails(mockAsteroidScraped);
  assert.strictEqual(asteroidExtracted.classification, 'asteroid', 'Classification should be asteroid');
  assert.ok(asteroidExtracted.name.includes('Ceres'), 'Extracted name should include Ceres');
  console.log('  ✓ Agent 2 extracts asteroid metadata successfully');

  // -------------------------------------------------------------------------
  // Test Suite 3: Agent 3 (Procedural Compiler) & Rule 2 Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 3: Agent 3 (Procedural Compiler) & Rule 2 Compliance ---');

  const cometRenderState = await compileProceduralRenderState(cometExtracted);
  assert.strictEqual(cometRenderState.textureType, 'icy', 'Comet textureType should be icy');
  assert.strictEqual(cometRenderState.hasRings, false, 'Comet should not have rings');
  assert.ok(cometRenderState.baseColor.startsWith('#'), 'Base color must be valid hex');
  assert.strictEqual(cometRenderState.tag, 'Illustrative', 'Rule 2: tag must be "Illustrative"');
  console.log('  ✓ Agent 3 compiled comet renderState with Rule 2 "Illustrative" tag');

  const saturnExtracted = {
    name: 'Saturn',
    classification: 'planet' as const,
    summary: 'Saturn is the sixth planet from the Sun and famous for its extensive planetary ring system.',
    images: ['https://science.nasa.gov/saturn.jpg'],
  };

  const saturnRenderState = await compileProceduralRenderState(saturnExtracted);
  assert.strictEqual(saturnRenderState.textureType, 'gaseous', 'Saturn textureType should be gaseous');
  assert.strictEqual(saturnRenderState.hasRings, true, 'Saturn should have rings');
  assert.strictEqual(saturnRenderState.tag, 'Illustrative', 'Rule 2: tag must be "Illustrative"');
  console.log('  ✓ Agent 3 compiled Saturn ringed renderState with Rule 2 "Illustrative" tag');

  // -------------------------------------------------------------------------
  // Test Suite 4: End-to-End Orchestrator Pipeline
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 4: Multi-Agent Orchestrator Pipeline ---');

  // Test full pipeline with simulated or live target
  // We mock global fetch for pipeline testing to verify end-to-end integration without network flake
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('science.nasa.gov')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => `
          <!DOCTYPE html>
          <html>
            <head><title>Bennu Asteroid | NASA Science</title></head>
            <body>
              <article>
                <h1>Asteroid Bennu</h1>
                <p>Asteroid Bennu is a carbon-rich near-Earth asteroid explored by NASA's OSIRIS-REx mission.</p>
                <img src="/assets/bennu-full.jpg" alt="Bennu in 3D" />
              </article>
            </body>
          </html>
        `,
      } as any;
    }
    return originalFetch(input, init);
  };

  try {
    const fullPayload = await executeMultiAgentPipeline('https://science.nasa.gov/solar-system/asteroids/101955-bennu/');
    assert.strictEqual(fullPayload.classification, 'asteroid');
    assert.ok(fullPayload.name.toLowerCase().includes('bennu'));
    assert.ok(fullPayload.summary.includes('carbon-rich'));
    assert.ok(fullPayload.images[0].includes('https://science.nasa.gov/assets/bennu-full.jpg'));
    assert.strictEqual(fullPayload.renderState.textureType, 'rocky');
    assert.strictEqual(fullPayload.renderState.tag, 'Illustrative');
    console.log('  ✓ executeMultiAgentPipeline returned consolidated bento-grid payload:');
    console.log('    Name:', fullPayload.name);
    console.log('    Classification:', fullPayload.classification);
    console.log('    Summary:', fullPayload.summary);
    console.log('    RenderState:', JSON.stringify(fullPayload.renderState));
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // Test Suite 5: Next.js Route Handlers (App Router & Pages Router)
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 5: Next.js Route Handlers ---');

  // Test App Router GET missing URL -> 400
  const appReqWithoutUrl = new Request('http://localhost:3000/api/fetch-nasa-object');
  const appResMissing = await appRouterGet(appReqWithoutUrl);
  assert.strictEqual(appResMissing.status, 400, 'App router GET should return 400 for missing url');
  const missingJson = await appResMissing.json();
  assert.ok(missingJson.error.includes('required'), 'Error message should explain missing url');
  console.log('  ✓ App Router GET returns 400 on missing url');

  // Test App Router POST with invalid body -> 400
  const appReqPostInvalid = new Request('http://localhost:3000/api/fetch-nasa-object', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '' }),
  });
  const appResPostInvalid = await appRouterPost(appReqPostInvalid);
  assert.strictEqual(appResPostInvalid.status, 400, 'App router POST should return 400 on empty url');
  console.log('  ✓ App Router POST returns 400 on invalid body');

  // Test Pages Router handler missing url -> 400
  let capturedStatus = 0;
  let capturedJson: any = null;
  const mockPagesRes: any = {
    status(code: number) {
      capturedStatus = code;
      return this;
    },
    json(data: any) {
      capturedJson = data;
    },
  };

  await pagesRouterHandler(
    { method: 'GET', query: {} } as any,
    mockPagesRes
  );
  assert.strictEqual(capturedStatus, 400, 'Pages router should return 400 on missing url');
  assert.ok(capturedJson.error, 'Pages router returns error JSON');
  console.log('  ✓ Pages Router handler returns 400 on missing query parameter');

  console.log('\n✅ All Multi-Agent Workflow tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Unit test failure:', err);
  process.exit(1);
});
