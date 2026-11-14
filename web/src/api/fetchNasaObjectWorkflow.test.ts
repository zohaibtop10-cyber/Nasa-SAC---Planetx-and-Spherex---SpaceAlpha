import assert from 'node:assert';
import {
  subAgent1Scraper,
  subAgent2ExtractorAndCompiler,
  scrapeNasaUrl,
  extractAndCompileNasaObject,
  executeMultiAgentPipeline,
  extractObjectDetails,
  compileProceduralRenderState,
  ScrapedData,
  parseJsonFromLlm,
  sanitizeHexColor,
} from './fetchNasaObjectWorkflow';
import { GET as appRouterGet, POST as appRouterPost } from '../app/api/fetch-nasa-object/route';
import pagesRouterHandler from '../pages/api/fetch-nasa-object';

async function runTests() {
  console.log('🧪 Starting Multi-Agent NASA Object Workflow Unit Tests...\n');

  // -------------------------------------------------------------------------
  // Test Suite 1: Sub-Agent 1 (Scraper) Input Validation & Error Handling
  // -------------------------------------------------------------------------
  console.log('--- Test Suite 1: Sub-Agent 1 (Scraper) Validation & Timeouts ---');

  await assert.rejects(
    async () => {
      await subAgent1Scraper('');
    },
    /Missing or invalid 'url' parameter/,
    'Should reject empty URL'
  );

  await assert.rejects(
    async () => {
      await subAgent1Scraper('ftp://nasa.gov/file.txt');
    },
    /Unsupported URL protocol/,
    'Should reject non-HTTP/HTTPS protocol'
  );

  await assert.rejects(
    async () => {
      await subAgent1Scraper('not-a-valid-url');
    },
    /Invalid URL format/,
    'Should reject malformed URL'
  );

  console.log('  ✓ Sub-Agent 1 correctly rejects invalid and empty URLs');

  // Test timeout handling with unreachable address
  await assert.rejects(
    async () => {
      await subAgent1Scraper('http://10.255.255.1/test', 50);
    },
    /(timed out|Failed to scrape)/i,
    'Should timeout gracefully on slow/unreachable targets'
  );
  console.log('  ✓ Sub-Agent 1 gracefully handles request timeouts');

  // -------------------------------------------------------------------------
  // Test Suite 2: Sub-Agent 2 (Extractor & 3D Compiler) Schema & Rule 2 Tag
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 2: Sub-Agent 2 (Extractor & 3D Compiler) Schema & Fallback ---');

  const mockCometScraped: ScrapedData = {
    url: 'https://science.nasa.gov/solar-system/comets/1p-halley/',
    title: '1P/Halley - NASA Science',
    articleText: 'Comet 1P/Halley is arguably the most famous periodic comet with an orbital period of about 75-76 years. Its coma and dust tail brighten dramatically near perihelion.',
    images: ['https://science.nasa.gov/wp-content/uploads/2023/halley.jpg'],
  };

  const cometPayload = await subAgent2ExtractorAndCompiler(mockCometScraped);
  assert.strictEqual(cometPayload.classification, 'comet', 'Classification should be comet');
  assert.ok(cometPayload.name.includes('Halley'), 'Extracted name should include Halley');
  assert.ok(typeof cometPayload.summary === 'string' && cometPayload.summary.length > 10, 'Summary should be extracted');
  assert.ok(Array.isArray(cometPayload.images) && cometPayload.images.length === 1, 'Images should match');
  assert.strictEqual(cometPayload.renderState.textureType, 'icy', 'Comet textureType should be icy');
  assert.strictEqual(cometPayload.renderState.hasRings, false, 'Comet should not have rings');
  assert.strictEqual(cometPayload.renderState.tag, 'Illustrative', 'Rule 2: tag must be "Illustrative"');
  console.log('  ✓ Sub-Agent 2 compiled comet schema with Rule 2 "Illustrative" tag');

  const mockSaturnScraped: ScrapedData = {
    url: 'https://science.nasa.gov/saturn/',
    title: 'Saturn - NASA Science',
    articleText: 'Saturn is the sixth planet from the Sun, a gas giant famous for its dazzling, complex system of planetary rings.',
    images: ['https://science.nasa.gov/saturn.jpg'],
  };

  const saturnPayload = await subAgent2ExtractorAndCompiler(mockSaturnScraped);
  assert.strictEqual(saturnPayload.classification, 'planet', 'Classification should be planet');
  assert.strictEqual(saturnPayload.renderState.textureType, 'gaseous', 'Saturn textureType should be gaseous');
  assert.strictEqual(saturnPayload.renderState.hasRings, true, 'Saturn should have rings');
  assert.strictEqual(saturnPayload.renderState.tag, 'Illustrative', 'Rule 2: tag must be "Illustrative"');
  console.log('  ✓ Sub-Agent 2 compiled Saturn ringed gas giant schema with Rule 2 tag');

  // Test JSON parsing utility from LLM responses
  const rawLlmMarkdown = '```json\n{"name": "Test Planet", "classification": "planet", "summary": "A test planet", "images": [], "renderState": {"baseColor": "#123456", "scale": 1.2, "textureType": "rocky", "hasRings": false}}\n```';
  const parsedFromMarkdown = parseJsonFromLlm(rawLlmMarkdown);
  assert.strictEqual(parsedFromMarkdown.name, 'Test Planet');
  assert.strictEqual(sanitizeHexColor('#abc'), '#ABC');
  assert.strictEqual(sanitizeHexColor('invalid', '#8C827A'), '#8C827A');
  console.log('  ✓ JSON & hex color sanitizers operate reliably');

  // -------------------------------------------------------------------------
  // Test Suite 3: Backwards Compatibility Adapters
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 3: Backwards Compatibility Adapters ---');

  const legacyExtracted = await extractObjectDetails(mockCometScraped);
  assert.strictEqual(legacyExtracted.classification, 'comet');
  const legacyRenderState = await compileProceduralRenderState(legacyExtracted);
  assert.strictEqual(legacyRenderState.tag, 'Illustrative');
  console.log('  ✓ extractObjectDetails and compileProceduralRenderState adapters work seamlessly');

  // -------------------------------------------------------------------------
  // Test Suite 4: End-to-End Orchestrator Pipeline
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 4: Multi-Agent Orchestrator Pipeline ---');

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
  // Test Suite 5: Next.js Route Handlers (App Router POST/GET & Pages Router)
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

  // Test App Router POST with valid URL -> 200 (with mock fetch)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('science.nasa.gov')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => `
          <html>
            <head><title>Europa | NASA Science</title></head>
            <body>
              <article>
                <h1>Europa Moon</h1>
                <p>Europa is an icy moon of Jupiter with a global subsurface ocean.</p>
                <img src="/europa.png" />
              </article>
            </body>
          </html>
        `,
      } as any;
    }
    return originalFetch(input, init);
  };

  try {
    const appReqPostValid = new Request('http://localhost:3000/api/fetch-nasa-object', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://science.nasa.gov/jupiter/moons/europa/' }),
    });
    const appResPostValid = await appRouterPost(appReqPostValid);
    assert.strictEqual(appResPostValid.status, 200, 'App router POST should return 200 on valid url');
    const validJson = await appResPostValid.json();
    assert.ok(validJson.name.includes('Europa'));
    assert.strictEqual(validJson.renderState.tag, 'Illustrative');
    console.log('  ✓ App Router POST returns 200 with Rule 2 Illustrative tag');
  } finally {
    globalThis.fetch = originalFetch;
  }

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
