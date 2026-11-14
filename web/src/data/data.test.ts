/**
 * Test suite for web/src/data layer:
 * - Types and loader in-memory caching
 * - labelFor helper and MissingLabelError
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelFor, MissingLabelError } from './labels';
import { clearDataCache, loadCandidates, loadFields, loadReleases } from './loader';
import { Candidate } from './types';

const currentDir = resolve(fileURLToPath(import.meta.url), '..');
const mockFsBase = resolve(currentDir, '../../public/data/mock');

const originalFetch = globalThis.fetch;
let fetchCallCount = 0;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  fetchCallCount++;
  const urlStr = input.toString();
  const filename = urlStr.split('/').pop();
  const filePath = resolve(mockFsBase, filename ?? '');

  try {
    const text = readFileSync(filePath, 'utf-8');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => JSON.parse(text),
    } as unknown as Response;
  } catch {
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => {
        throw new Error('Not found');
      },
    } as unknown as Response;
  }
}) as typeof globalThis.fetch;

async function runTests() {
  console.log('Running web/src/data test suite...');

  // 1. Test loader and in-memory caching
  clearDataCache();
  fetchCallCount = 0;

  const candidates1 = await loadCandidates({ baseUrl: '/data/mock' });
  assert.ok(candidates1.length >= 2, 'Should load at least 2 candidates');
  assert.equal(fetchCallCount, 1, 'Should have made 1 fetch call');

  // Second call must return from memory cache (fetchCallCount stays 1)
  const candidates2 = await loadCandidates({ baseUrl: '/data/mock' });
  assert.equal(candidates2.length, candidates1.length);
  assert.equal(fetchCallCount, 1, 'Second call must return from in-memory cache without new fetch');
  assert.equal(candidates1, candidates2, 'Cached reference should be identical');

  // Test loadFields
  const fields = await loadFields({ baseUrl: '/data/mock' });
  assert.ok(fields.length >= 2, 'Should load at least 2 fields');
  assert.equal(fetchCallCount, 2, 'Fetch call count should now be 2');

  // Test loadReleases
  const releases = await loadReleases({ baseUrl: '/data/mock' });
  assert.equal(releases.length, 1, 'Should load 1 release');
  assert.equal(fetchCallCount, 3, 'Fetch call count should now be 3');

  // 2. Test labelFor on valid candidate
  const unknownCand = candidates1.find((c) => c.verdict === 'unknown');
  assert.ok(unknownCand, 'Unknown candidate must be present');

  assert.equal(labelFor(unknownCand, 'confidence'), 'derived');
  assert.equal(labelFor(unknownCand, 'colour_index'), 'measured');
  assert.equal(labelFor(unknownCand, 'distance_min_au'), 'derived');
  assert.equal(labelFor(unknownCand, 'distance_range.min_au'), 'derived');
  assert.equal(labelFor(unknownCand, 'positions[0].ra'), 'measured');
  assert.equal(labelFor(unknownCand, 'positions[1].dec'), 'measured');

  const knownCand = candidates1.find((c) => c.verdict === 'known_object');
  assert.ok(knownCand, 'Known candidate must be present');
  assert.equal(labelFor(knownCand, 'match.separation_arcsec'), 'derived');

  // 3. Test MissingLabelError when a displayed number has no label
  const corruptedCand: Candidate = {
    ...unknownCand,
    id: unknownCand.id,
    labels: {
      // Intentionally omitting 'confidence' and 'distance_min_au'
      'colour_index': 'measured',
      'positions.ra': 'measured',
      'positions.dec': 'measured',
      'positions.err': 'derived',
    },
  };

  assert.throws(
    () => {
      labelFor(corruptedCand, 'confidence');
    },
    (err: unknown) => {
      assert.ok(err instanceof MissingLabelError, 'Must be instance of MissingLabelError');
      const labelErr = err as MissingLabelError;
      assert.equal(labelErr.missingKey, 'confidence');
      assert.equal(labelErr.candidateId, corruptedCand.id);
      return true;
    },
    'Missing label for confidence must throw MissingLabelError'
  );

  assert.throws(
    () => {
      labelFor(corruptedCand, 'distance_min_au');
    },
    (err: unknown) => {
      assert.ok(err instanceof MissingLabelError);
      const labelErr = err as MissingLabelError;
      assert.equal(labelErr.missingKey, 'distance_min_au');
      return true;
    },
    'Missing label for distance_min_au must throw MissingLabelError'
  );

  console.log('All web/src/data tests passed cleanly!');
}

runTests().finally(() => {
  globalThis.fetch = originalFetch;
});
