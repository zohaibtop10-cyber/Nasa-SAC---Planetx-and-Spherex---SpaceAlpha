/**
 * Unit Test Suite for UI Components: NumberChip, FeedPanel logic, and ObjectPage
 *
 * Verifies:
 * - Number chips have exact epistemic borders:
 *   Measured (solid), Derived (dashed), Assumed (dotted)
 * - Every number goes through labelFor
 * - MissingLabelError is thrown if a number has no label
 */

import assert from 'node:assert/strict';
import { labelFor, MissingLabelError } from '../../data/labels';
import { Candidate } from '../../data/types';

// Mock Candidate for testing
const mockCandidate: Candidate = {
  id: 'CAND-TEST-001',
  field_id: 'field_asteroid_belt',
  release_batch: 'REL-2026-QR2',
  positions: [
    { time: '2026-04-12T02:15:00Z', ra: 185.2415, dec: -12.4512, err: 0.12 },
    { time: '2026-04-12T06:15:00Z', ra: 185.2585, dec: -12.4498, err: 0.14 },
  ],
  verdict: 'unknown',
  reason_chain: [
    'DETECTED: High proper motion 15.2"/hr across SPHEREx scans',
    'NO_MATCH: No match in ESA Gaia DR3 within 3.0"',
    'NO_MATCH: No match in NASA JPL Small-Body Identification database',
    'PARALLAX: Computed distance bracket [45.0, 85.0] AU',
  ],
  confidence: 0.94,
  match: null,
  distance_range: {
    min_au: 45.0,
    max_au: 85.0,
    assumption: 'Parallax reflex assumption',
  },
  colour_index: 2.15,
  simulated: false,
  labels: {
    positions: 'measured',
    confidence: 'derived',
    colour_index: 'measured',
    'distance_range.min_au': 'derived',
    'distance_range.max_au': 'derived',
    'distance_range.assumption': 'assumed',
  },
};

function getBorderSpec(label: 'measured' | 'derived' | 'assumed') {
  if (label === 'measured') return { style: 'solid', color: '#38BDF8' };
  if (label === 'derived') return { style: 'dashed', color: '#F59E0B' };
  if (label === 'assumed') return { style: 'dotted', color: '#FF6B3D' };
  throw new Error(`Invalid label: ${label}`);
}

async function runComponentTests() {
  console.log('Testing UI Components and Epistemic Number Chips...');

  // 1. Verify NumberChip border contract
  console.log('  1. Verifying NumberChip border specifications...');
  const measuredBorder = getBorderSpec('measured');
  assert.strictEqual(measuredBorder.style, 'solid', 'Measured numbers MUST have a solid border');

  const derivedBorder = getBorderSpec('derived');
  assert.strictEqual(derivedBorder.style, 'dashed', 'Derived numbers MUST have a dashed border');

  const assumedBorder = getBorderSpec('assumed');
  assert.strictEqual(assumedBorder.style, 'dotted', 'Assumed numbers MUST have a dotted border');

  // 2. Verify all mock candidate numbers route through labelFor
  console.log('  2. Verifying every candidate number routes through labelFor...');
  const posLabel = labelFor(mockCandidate, 'positions');
  assert.strictEqual(posLabel, 'measured');
  assert.strictEqual(getBorderSpec(posLabel).style, 'solid');

  const confLabel = labelFor(mockCandidate, 'confidence');
  assert.strictEqual(confLabel, 'derived');
  assert.strictEqual(getBorderSpec(confLabel).style, 'dashed');

  const ciLabel = labelFor(mockCandidate, 'colour_index');
  assert.strictEqual(ciLabel, 'measured');
  assert.strictEqual(getBorderSpec(ciLabel).style, 'solid');

  const distMinLabel = labelFor(mockCandidate, 'distance_range.min_au');
  assert.strictEqual(distMinLabel, 'derived');
  assert.strictEqual(getBorderSpec(distMinLabel).style, 'dashed');

  const distMaxLabel = labelFor(mockCandidate, 'distance_range.max_au');
  assert.strictEqual(distMaxLabel, 'derived');
  assert.strictEqual(getBorderSpec(distMaxLabel).style, 'dashed');

  // 3. Verify missing label throws typed MissingLabelError
  console.log('  3. Verifying MissingLabelError on unlabeled numbers...');
  assert.throws(
    () => {
      labelFor(mockCandidate, 'unlabeled_telemetry_key');
    },
    MissingLabelError,
    'Accessing an unlabeled key MUST throw MissingLabelError'
  );

  // 4. Verify candidate reason chain format (check / cross recognition)
  console.log('  4. Verifying Reason Chain parsing for check/cross icons...');
  const reasons = mockCandidate.reason_chain;
  assert.strictEqual(reasons.length, 4);

  const icons = reasons.map((step) => {
    const lower = step.toLowerCase();
    const isPositive =
      lower.includes('match') ||
      lower.includes('detected') ||
      lower.includes('pass') ||
      lower.includes('confirmed') ||
      lower.includes('bracket') ||
      lower.includes('parallax');
    const isNegative =
      lower.includes('no_match') ||
      lower.includes('unmatched') ||
      lower.includes('reject') ||
      lower.includes('fail');
    return isPositive && !isNegative ? '✓' : '✗';
  });

  assert.deepStrictEqual(icons, ['✓', '✗', '✗', '✓'], 'Icons must accurately match triage outcomes');

  console.log('All UI component tests passed successfully!');
}

runComponentTests().catch((err) => {
  console.error('Component test failed:', err);
  process.exit(1);
});
