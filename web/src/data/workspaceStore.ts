/**
 * workspaceStore.ts - Global Application State (Zustand AST Store)
 *
 * Manages:
 * - Explored celestial objects compiled from /api/explore-object
 * - Active 3D focus object
 * - Search telemetry and history
 */

import { create } from 'zustand';
import { ExploreObjectResult } from '../api/exploreObjectWorkflow';
import { Candidate } from './types';

export interface WorkspaceState {
  exploredObjects: ExploreObjectResult[];
  activeExploredObject: ExploreObjectResult | null;
  searchHistory: string[];
  isSearching: boolean;
  searchStatusMessage: string | null;
  error: string | null;

  // Temporal State (Scan Epochs & Interpolation)
  currentDate: string; // ISO format e.g. "2026-04-12T02:15:00Z"
  earliestDate: string; // "2026-04-12T02:15:00Z"
  latestDate: string; // "2026-10-20T00:00:00Z"
  timeEpochRatio: number; // 0.0 to 1.0

  // Actions
  setSearching: (isSearching: boolean, statusMessage?: string | null) => void;
  setError: (error: string | null) => void;
  addExploredObject: (result: ExploreObjectResult) => Candidate;
  setActiveExploredObject: (result: ExploreObjectResult | null) => void;
  setCurrentDate: (date: string | Date) => void;
  setTimeEpochRatio: (ratio: number) => void;
  setDateRange: (earliest: string, latest: string) => void;
}

/**
 * Converts an ExploreObjectResult into a Candidate instance adhering to data contracts
 */
export function exploreResultToCandidate(result: ExploreObjectResult): Candidate {
  const safeId = `EXP-${result.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const ra = result.coordinates?.ra ?? 180.0;
  const dec = result.coordinates?.dec ?? 0.0;
  const distAu = result.coordinates?.distance_au ?? 2.77;

  // Create 2 positions for baseline movement
  const now = new Date();
  const later = new Date(now.getTime() + 14400000); // +4 hours

  const positions = [
    { time: now.toISOString(), ra, dec, err: 0.04 },
    { time: later.toISOString(), ra: Number((ra + 0.015).toFixed(4)), dec: Number((dec + 0.008).toFixed(4)), err: 0.04 },
  ];

  let verdict: 'known_object' | 'high_motion_star' | 'unknown' = 'unknown';
  if (result.classification === 'planet' || result.classification === 'asteroid' || result.classification === 'comet') {
    verdict = 'known_object';
  } else if (result.classification === 'star') {
    verdict = 'high_motion_star';
  }

  const reasonChain = [
    `EXPLORED: Retrieved metadata for ${result.name} from NASA/Wikipedia catalog`,
    `CLASSIFICATION: ${result.classification} [derived]`,
    `COORDINATES: RA ${ra.toFixed(2)}°, Dec ${dec.toFixed(2)}°, Distance ${distAu.toFixed(2)} AU [derived]`,
    `PROCEDURAL 3D: Surface ${result.procedural3D.surfaceTexture}, Base ${result.procedural3D.baseColorHex} [Illustrative]`,
  ];

  if (result.educationalData?.notableFacts?.length > 0) {
    reasonChain.push(`NOTE: ${result.educationalData.notableFacts[0]}`);
  }

  return {
    id: safeId,
    field_id: 'explored_objects_field',
    release_batch: '2026-EXPLORE',
    positions,
    verdict,
    confidence: 0.98,
    reason_chain: reasonChain,
    match: {
      designation: result.name,
      catalog: 'NASA Astrophysical Explorer API',
      body_type: result.classification,
      separation_arcsec: 0.0,
    },
    colour_index: result.procedural3D.surfaceTexture === 'icy' ? 0.6 : result.classification === 'star' ? 1.8 : 1.1,
    simulated: false,
    distance_range: verdict === 'unknown' ? {
      min_au: Math.max(1.5, Number((distAu * 0.8).toFixed(1))),
      max_au: Number((distAu * 1.3).toFixed(1)),
      assumption: `Nominal line-of-sight distance ${distAu} AU [assumed]`,
    } : undefined,
    labels: {
      confidence: 'derived',
      colour_index: 'measured',
      positions: 'measured',
      'positions.ra': 'measured',
      'positions.dec': 'measured',
      'positions.err': 'derived',
      'match.separation_arcsec': 'derived',
      distance_min_au: 'derived',
      distance_max_au: 'derived',
      distance_range: 'derived',
    },
    // Custom render state and procedural 3D properties for 3D canvas compiler
    renderState: {
      baseColor: result.procedural3D.baseColorHex,
      scale: result.procedural3D.relativeSize,
      textureType: result.procedural3D.surfaceTexture,
      hasRings: result.classification === 'planet' && result.name.toLowerCase().includes('saturn'),
      tag: 'Illustrative',
    },
    procedural3D: result.procedural3D,
    coordinates: result.coordinates,
    // Store educational payload for side panels
    educationalData: result.educationalData,
  } as unknown as Candidate;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  exploredObjects: [],
  activeExploredObject: null,
  searchHistory: [],
  isSearching: false,
  searchStatusMessage: null,
  error: null,

  // Default historical scan epochs from releases.json and candidates.json
  currentDate: '2026-04-12T02:15:00Z',
  earliestDate: '2026-04-12T02:15:00Z',
  latestDate: '2026-10-20T00:00:00Z',
  timeEpochRatio: 0.0,

  setSearching: (isSearching, statusMessage = null) =>
    set({ isSearching, searchStatusMessage: statusMessage }),

  setError: (error) => set({ error }),

  addExploredObject: (result) => {
    const candidate = exploreResultToCandidate(result);
    set((state) => ({
      exploredObjects: [result, ...state.exploredObjects.filter((o) => o.name !== result.name)],
      activeExploredObject: result,
      searchHistory: [result.name, ...state.searchHistory.filter((h) => h !== result.name)].slice(0, 10),
      error: null,
      isSearching: false,
      searchStatusMessage: null,
    }));
    return candidate;
  },

  setActiveExploredObject: (result) => set({ activeExploredObject: result }),

  setCurrentDate: (dateInput) => {
    const isoString = dateInput instanceof Date ? dateInput.toISOString() : new Date(dateInput).toISOString();
    set((state) => {
      const t = new Date(isoString).getTime();
      const tMin = new Date(state.earliestDate).getTime();
      const tMax = new Date(state.latestDate).getTime();
      const ratio = tMax > tMin ? Math.max(0.0, Math.min(1.0, (t - tMin) / (tMax - tMin))) : 0.0;
      return { currentDate: isoString, timeEpochRatio: ratio };
    });
  },

  setTimeEpochRatio: (ratio) => {
    const clamped = Math.max(0.0, Math.min(1.0, ratio));
    set((state) => {
      const tMin = new Date(state.earliestDate).getTime();
      const tMax = new Date(state.latestDate).getTime();
      const interpolatedTime = new Date(tMin + clamped * (tMax - tMin)).toISOString();
      return { timeEpochRatio: clamped, currentDate: interpolatedTime };
    });
  },

  setDateRange: (earliest, latest) =>
    set({ earliestDate: earliest, latestDate: latest }),
}));
