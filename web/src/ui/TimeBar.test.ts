/**
 * TimeBar.test.ts - Unit Tests for TimeBar Temporal State & Object Interpolation
 *
 * NASA Space Apps Challenge 2026 · Planet X and SPHEREx · Live Sky
 *
 * Validates:
 * 1. State Management:
 *    - Global temporal state in useWorkspaceStore (currentDate, earliestDate, latestDate, timeEpochRatio).
 *    - Bidirectional synchronization between timeEpochRatio and currentDate ISO string.
 * 2. Slider UI Date Bounds:
 *    - Earliest scan date (2026-04-12T02:15:00Z) and latest release date (2026-10-20T00:00:00Z).
 * 3. Object Interpolation (The Math):
 *    - Multi-epoch positions before and after currentDate.
 *    - Exact intermediate Cartesian position calculated using THREE.Vector3.lerp().
 * 4. Visualizing Uncertainty Reduction:
 *    - Unknown candidates with distance_range scan brackets.
 *    - Monotonic shrinkage of 3D line segment endpoints (minPoint, maxPoint) as time advances.
 * 5. Rule 1 & Rule 3 Non-Negotiable Compliance.
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { useWorkspaceStore } from '../data/workspaceStore';
import { Candidate } from '../data/types';
import { interpolateCandidateState, sphericalToCartesian } from '../scene/SolarSystemMap';

async function runTimeBarTests() {
  console.log('🧪 Testing TimeBar & Temporal State Orchestration (TimeBar.tsx)...');

  // -------------------------------------------------------------------------
  // 1. State Management (Zustand Global State)
  // -------------------------------------------------------------------------
  console.log('  1. Testing Zustand global temporal state synchronization...');

  const store = useWorkspaceStore.getState();
  assert.ok(store.currentDate, 'Initial currentDate must be defined in workspaceStore');
  assert.ok(store.earliestDate, 'earliestDate must be defined in workspaceStore');
  assert.ok(store.latestDate, 'latestDate must be defined in workspaceStore');
  assert.strictEqual(typeof store.timeEpochRatio, 'number', 'timeEpochRatio must be a number');

  // Verify Date Range from SPHEREx releases / scan epochs
  assert.strictEqual(store.earliestDate, '2026-04-12T02:15:00Z', 'earliestDate must match earliest scan epoch');
  assert.strictEqual(store.latestDate, '2026-10-20T00:00:00Z', 'latestDate must match latest release published_at');

  // Test setTimeEpochRatio updates both ratio and currentDate
  store.setTimeEpochRatio(0.0);
  assert.strictEqual(useWorkspaceStore.getState().timeEpochRatio, 0.0);
  assert.strictEqual(useWorkspaceStore.getState().currentDate, '2026-04-12T02:15:00.000Z');

  store.setTimeEpochRatio(1.0);
  assert.strictEqual(useWorkspaceStore.getState().timeEpochRatio, 1.0);
  assert.strictEqual(useWorkspaceStore.getState().currentDate, '2026-10-20T00:00:00.000Z');

  // Test 50% midpoint
  store.setTimeEpochRatio(0.5);
  const midState = useWorkspaceStore.getState();
  assert.strictEqual(midState.timeEpochRatio, 0.5);
  const tMin = new Date(midState.earliestDate).getTime();
  const tMax = new Date(midState.latestDate).getTime();
  const expectedMid = new Date(tMin + 0.5 * (tMax - tMin)).toISOString();
  assert.strictEqual(midState.currentDate, expectedMid, 'currentDate at ratio 0.5 must be exact midpoint');

  // Test setCurrentDate updates ratio
  store.setCurrentDate('2026-04-12T02:15:00Z');
  assert.strictEqual(useWorkspaceStore.getState().timeEpochRatio, 0.0);

  // -------------------------------------------------------------------------
  // 2. Object Interpolation (The Math: THREE.Vector3.lerp)
  // -------------------------------------------------------------------------
  console.log('  2. Testing multi-epoch object interpolation via THREE.Vector3.lerp()...');

  const mockCandidate: Candidate = {
    id: 'CAND-TEST-001',
    field_id: 'field_asteroid_belt',
    release_batch: '2026-W42',
    positions: [
      {
        time: '2026-04-12T02:15:00Z', // t0
        ra: 180.0,
        dec: 10.0,
        err: 0.04,
      },
      {
        time: '2026-04-12T06:15:00Z', // t1 (+4 hours)
        ra: 180.12,
        dec: 10.08,
        err: 0.04,
      },
    ],
    verdict: 'unknown',
    confidence: 0.95,
    distance_range: {
      min_au: 17.2,
      max_au: 22.2,
      assumption: 'Parallax reflex motion [assumed]',
      scan_ranges: [
        { scan_index: 1, min_au: 12.0, max_au: 33.3 }, // Scan 1: ±10.65 AU error
        { scan_index: 2, min_au: 17.2, max_au: 22.2 }, // Scan 2: ±2.5 AU error
      ],
    },
    colour_index: 1.1,
    simulated: false,
    labels: {
      confidence: 'derived',
      colour_index: 'measured',
      positions: 'measured',
      'positions.ra': 'measured',
      'positions.dec': 'measured',
      'positions.err': 'derived',
      distance_range: 'derived',
      distance_min_au: 'derived',
      distance_max_au: 'derived',
    },
  };

  const t0 = new Date('2026-04-12T02:15:00Z').getTime();
  const t1 = new Date('2026-04-12T06:15:00Z').getTime();

  // Test At t0 (Epoch 1)
  const stateAtT0 = interpolateCandidateState(mockCandidate, t0, 'dual');
  assert.strictEqual(stateAtT0.alpha, 0.0);
  assert.strictEqual(stateAtT0.ra, 180.0);
  assert.strictEqual(stateAtT0.dec, 10.0);

  const expectedV0 = sphericalToCartesian(180.0, 10.0, (17.2 + 22.2) / 2.0, 'dual');
  assert.ok(stateAtT0.position.distanceTo(expectedV0) < 1e-4, 'At t0, position must equal exact V0');

  // Test At t1 (Epoch 2)
  const stateAtT1 = interpolateCandidateState(mockCandidate, t1, 'dual');
  assert.strictEqual(stateAtT1.alpha, 1.0);
  assert.strictEqual(stateAtT1.ra, 180.12);
  assert.strictEqual(stateAtT1.dec, 10.08);

  const expectedV1 = sphericalToCartesian(180.12, 10.08, (17.2 + 22.2) / 2.0, 'dual');
  assert.ok(stateAtT1.position.distanceTo(expectedV1) < 1e-4, 'At t1, position must equal exact V1');

  // Test At Intermediate Timestamp (50% midpoint: 04:15 UTC)
  const tMid = t0 + 0.5 * (t1 - t0);
  const stateAtMid = interpolateCandidateState(mockCandidate, tMid, 'dual');
  assert.strictEqual(stateAtMid.alpha, 0.5);
  assert.ok(Math.abs(stateAtMid.ra - 180.06) < 1e-4, 'At midpoint, RA must be 180.06');
  assert.ok(Math.abs(stateAtMid.dec - 10.04) < 1e-4, 'At midpoint, Dec must be 10.04');

  // Mathematical Verification of THREE.Vector3.lerp:
  // The distance from V0 to interpolated + distance from interpolated to V1 must equal chord length |V1 - V0|
  const chordLen = expectedV0.distanceTo(expectedV1);
  const distToV0 = stateAtMid.position.distanceTo(expectedV0);
  const distToV1 = stateAtMid.position.distanceTo(expectedV1);
  assert.ok(Math.abs(distToV0 + distToV1 - chordLen) < 1e-4, 'Interpolated position must lie exactly on the line segment between V0 and V1');
  assert.ok(Math.abs(distToV0 - distToV1) < 1e-4, 'At alpha 0.5, interpolated position must be equidistant from endpoints');

  // -------------------------------------------------------------------------
  // 3. Visualizing Uncertainty Reduction (Line Segment Parallax Shrinkage)
  // -------------------------------------------------------------------------
  console.log('  3. Testing parallax uncertainty reduction and segment shrinkage...');

  // At Epoch 1 (Scan 1): broad uncertainty bracket
  const spanT0 = stateAtT0.currentMaxAu - stateAtT0.currentMinAu;
  assert.ok(Math.abs(spanT0 - (33.3 - 12.0)) < 1e-4, 'At Epoch 1, uncertainty span must be 21.3 AU [derived]');

  // At Midpoint: narrowed uncertainty bracket
  const spanMid = stateAtMid.currentMaxAu - stateAtMid.currentMinAu;
  assert.ok(spanMid < spanT0, 'At midpoint, uncertainty span must be strictly smaller than at Epoch 1');

  // At Epoch 2 (Scan 2): narrowed down to final bracket
  const spanT1 = stateAtT1.currentMaxAu - stateAtT1.currentMinAu;
  assert.ok(Math.abs(spanT1 - (22.2 - 17.2)) < 1e-4, 'At Epoch 2, uncertainty span must narrow to 5.0 AU [derived]');

  // Verify physical 3D line segment distance bounds shrink
  assert.ok(stateAtT0.minPoint && stateAtT0.maxPoint);
  assert.ok(stateAtT1.minPoint && stateAtT1.maxPoint);

  const segmentLengthT0 = stateAtT0.minPoint.distanceTo(stateAtT0.maxPoint);
  const segmentLengthT1 = stateAtT1.minPoint.distanceTo(stateAtT1.maxPoint);

  assert.ok(
    segmentLengthT1 < segmentLengthT0 * 0.45,
    `3D line segment length must physically shrink by >55% (T0 len=${segmentLengthT0.toFixed(2)}, T1 len=${segmentLengthT1.toFixed(2)})`
  );

  console.log('✅ All TimeBar and Object Interpolation tests passed successfully!\n');
}

runTimeBarTests().catch((err) => {
  console.error('TimeBar test failed:', err);
  process.exit(1);
});
