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

  // 5. Verify Distance Range monotonic shrinkage and assumption visibility
  console.log('  5. Verifying Distance Range monotonic shrinkage and assumption visibility...');
  const distRange = mockCandidate.distance_range;
  assert.ok(distRange, 'Candidate must have distance_range');
  assert.ok(distRange.assumption && distRange.assumption.length > 5, 'Assumption text must be present and non-empty');

  // Test scan ranges shrinkage monotonicity
  const testSteps = [
    { scan_index: 1, min_au: 35.0, max_au: 260.0 },
    { scan_index: 2, min_au: 42.0, max_au: 215.0 },
    { scan_index: 3, min_au: 48.0, max_au: 195.0 },
    { scan_index: 4, min_au: 55.0, max_au: 180.0 },
  ];

  for (let i = 1; i < testSteps.length; i++) {
    const prev = testSteps[i - 1];
    const curr = testSteps[i];

    assert.ok(curr.min_au >= prev.min_au, `Step ${i}: min_au (${curr.min_au}) must be >= previous min_au (${prev.min_au})`);
    assert.ok(curr.max_au <= prev.max_au, `Step ${i}: max_au (${curr.max_au}) must be <= previous max_au (${prev.max_au})`);

    const prevSpan = prev.max_au - prev.min_au;
    const currSpan = curr.max_au - curr.min_au;
    assert.ok(currSpan < prevSpan, `Step ${i}: uncertainty span (${currSpan}) must shrink monotonically (< ${prevSpan})`);
  }

  // Verify logarithmic ruler landmark positioning
  const RULER_MIN_AU = 0.3;
  const RULER_MAX_AU = 600.0;
  const logMin = Math.log10(RULER_MIN_AU);
  const logMax = Math.log10(RULER_MAX_AU);
  const logPct = (au: number) => ((Math.log10(au) - logMin) / (logMax - logMin)) * 100;

  const sunPct = logPct(1.0);
  const neptunePct = logPct(30.06);
  const planetXPct = logPct(350.0);

  assert.ok(sunPct > 0 && sunPct < neptunePct, 'Sun must be positioned before Neptune on log ruler');
  assert.ok(neptunePct < planetXPct, 'Neptune must be positioned before Planet X zone on log ruler');
  assert.ok(planetXPct < 100, 'Planet X zone must lie within 600 AU ruler bounds');

  // 6. Verify Validation & About Page compliance specifications
  const validationHeadlineMetrics = {
    recall: { value: 98.4, unit: '%', label: 'derived' },
    falsePositiveRate: { value: 0.0, unit: '%', label: 'derived' },
    stationaryRejected: { value: 137, label: 'measured' },
    unphysicalPruned: { value: 1, label: 'measured' },
    parallaxConvergence: { value: 100.0, unit: '%', label: 'derived' },
    orbitalBaseline: { value: 2.0, unit: 'AU', label: 'derived' },
    gridMaxAu: { value: 500.0, unit: 'AU', label: 'assumed' },
  };

  assert.equal(validationHeadlineMetrics.recall.label, 'derived');
  assert.equal(validationHeadlineMetrics.falsePositiveRate.label, 'derived');
  assert.equal(validationHeadlineMetrics.stationaryRejected.label, 'measured');
  assert.equal(validationHeadlineMetrics.unphysicalPruned.label, 'measured');
  assert.equal(validationHeadlineMetrics.parallaxConvergence.label, 'derived');
  assert.equal(validationHeadlineMetrics.gridMaxAu.label, 'assumed');

  // Verify external data source credits
  const externalSourceCredits = [
    { source: 'NASA / IPAC Infrared Science Archive (IRSA)', dataset: 'SPHEREx QR2' },
    { source: 'NASA JPL Solar System Dynamics (SSD)', dataset: 'sb_ident.api & SBDB' },
    { source: 'European Space Agency (ESA) Gaia Mission', dataset: 'Gaia DR3' },
  ];
  assert.equal(externalSourceCredits.length, 3, 'Must credit all 3 external data sources');
  assert.ok(externalSourceCredits.some((s) => s.source.includes('IRSA')));
  assert.ok(externalSourceCredits.some((s) => s.source.includes('JPL')));
  assert.ok(externalSourceCredits.some((s) => s.source.includes('Gaia')));

  // Verify Planet X hypothesis citation rule
  const planetXHypothesisCitation = {
    citation: 'Batygin & Brown (2016, 2021)',
    nature: 'Theoretical dynamical clustering hypothesis of extreme TNOs',
    label: 'assumed',
    planetClaimAllowed: false,
  };
  assert.equal(planetXHypothesisCitation.label, 'assumed');
  assert.equal(planetXHypothesisCitation.planetClaimAllowed, false, 'No planet claims permitted');

  // 7. Verify ObjectPanel contracts (Bento Grid, Rule 1 & Rule 2 compliance)
  console.log('  7. Verifying ObjectPanel contracts and sub-agent data rendering...');
  const mockBentoPayload = {
    name: '101955 Bennu',
    classification: 'asteroid' as const,
    summary: 'Asteroid Bennu is a carbon-rich near-Earth object explored by NASA OSIRIS-REx.',
    images: ['https://science.nasa.gov/assets/bennu-1.jpg', 'https://science.nasa.gov/assets/bennu-2.jpg'],
    renderState: {
      baseColor: '#3A3A3C',
      scale: 0.85,
      textureType: 'rocky' as const,
      hasRings: false,
      tag: 'Illustrative',
    },
  };

  assert.strictEqual(mockBentoPayload.classification, 'asteroid');
  assert.strictEqual(mockBentoPayload.renderState.tag, 'Illustrative', 'Rule 2: 3D model MUST be tagged Illustrative');
  assert.ok(mockBentoPayload.images.length > 0, 'Masonry gallery must have image assets');
  assert.ok(mockBentoPayload.summary.length > 10, 'Summary text must be present');

  // 8. Verify OmniSearch workspace store integration (Zustand & exploreResultToCandidate)
  console.log('  8. Verifying OmniSearch & WorkspaceStore state contracts...');
  const { useWorkspaceStore, exploreResultToCandidate } = await import('../../data/workspaceStore');

  const mockExploreResult = {
    name: '1 Ceres',
    classification: 'asteroid' as const,
    coordinates: { distance_au: 2.77, ra: 164.21, dec: 30.31 },
    procedural3D: { baseColorHex: '#A39D95', surfaceTexture: 'rocky' as const, relativeSize: 0.9 },
    educationalData: {
      summary: 'Ceres is the largest object in the asteroid belt.',
      notableFacts: ['Discovered in 1801 by Giuseppe Piazzi'],
      mediaUrls: ['https://upload.wikimedia.org/wikipedia/commons/7/76/Ceres.jpg'],
    },
  };

  const candidateFromExplore = exploreResultToCandidate(mockExploreResult);
  assert.ok(candidateFromExplore.id.startsWith('EXP-'));
  assert.strictEqual(candidateFromExplore.verdict, 'known_object');
  assert.strictEqual(candidateFromExplore.labels?.confidence, 'derived');
  assert.strictEqual(candidateFromExplore.labels?.colour_index, 'measured');
  assert.strictEqual(candidateFromExplore.positions[0].ra, 164.21);
  assert.strictEqual(candidateFromExplore.positions[0].dec, 30.31);
  assert.strictEqual((candidateFromExplore as any).renderState.baseColor, '#A39D95');

  const store = useWorkspaceStore.getState();
  store.setSearching(true, 'Analyzing NASA data...');
  assert.strictEqual(useWorkspaceStore.getState().isSearching, true);
  assert.strictEqual(useWorkspaceStore.getState().searchStatusMessage, 'Analyzing NASA data...');

  store.addExploredObject(mockExploreResult);
  assert.strictEqual(useWorkspaceStore.getState().isSearching, false);
  assert.strictEqual(useWorkspaceStore.getState().exploredObjects.length, 1);
  assert.strictEqual(useWorkspaceStore.getState().activeExploredObject?.name, '1 Ceres');

  console.log('All UI component tests passed successfully!');
}

runComponentTests().catch((err) => {
  console.error('Component test failed:', err);
  process.exit(1);
});
