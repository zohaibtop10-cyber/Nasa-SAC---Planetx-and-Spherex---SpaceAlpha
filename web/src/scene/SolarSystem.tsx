/**
 * SolarSystem.tsx - React Component Wrapper for SolarSystem Three.js Engine
 *
 * Implements:
 * - Listens for new objects added to global state from OmniSearch / workspaceStore
 * - Merges static catalog candidates with dynamic explored celestial objects
 * - Dual-scale system (inner linear <= 5 AU, outer log > 5 AU)
 * - Procedurally generated objects (noise-displaced icosahedrons for rocky, banded shaders for gaseous)
 * - Photometric tinting based on colour_index data
 * - Attached HTML <Badge> labeled "Illustrative" for 3D models
 * - Line-of-sight distance range segments with ghost spheres for unknowns
 * - Real-time smooth interpolation along 36-point Keplerian orbits
 */

import React, { useMemo, useEffect } from 'react';
import { SolarSystemScene } from './SolarSystemScene';
import { Candidate } from '../data/types';
import { useWorkspaceStore, exploreResultToCandidate } from '../data/workspaceStore';

export interface SolarSystemProps {
  candidates?: Candidate[];
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidateId: string) => void;
  timeEpochRatio?: number;
  sliderDay?: number;
}

export const SolarSystem: React.FC<SolarSystemProps> = ({
  candidates: propCandidates = [],
  selectedCandidateId = null,
  onSelectCandidate,
  timeEpochRatio = 0.0,
  sliderDay = 0,
}) => {
  // 1. Listen for new objects added to global state from OmniSearch component
  const exploredObjects = useWorkspaceStore((state) => state.exploredObjects);
  const activeExploredObject = useWorkspaceStore((state) => state.activeExploredObject);

  // 2. Merge explored objects with catalog candidates
  const mergedCandidates = useMemo(() => {
    const exploredCandidates = exploredObjects.map((obj) => exploreResultToCandidate(obj));
    const combined = [...exploredCandidates];
    const seen = new Set(combined.map((c) => c.id));

    for (const c of propCandidates) {
      if (!seen.has(c.id)) {
        combined.push(c);
        seen.add(c.id);
      }
    }
    return combined;
  }, [exploredObjects, propCandidates]);

  // When activeExploredObject updates from OmniSearch, notify parent handler if needed
  useEffect(() => {
    if (activeExploredObject && onSelectCandidate) {
      const exploredId = `EXP-${activeExploredObject.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      if (selectedCandidateId !== exploredId) {
        onSelectCandidate(exploredId);
      }
    }
  }, [activeExploredObject]);

  const effectiveSelectedCandidateId = useMemo(() => {
    if (selectedCandidateId) return selectedCandidateId;
    if (activeExploredObject) {
      return `EXP-${activeExploredObject.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    }
    return null;
  }, [selectedCandidateId, activeExploredObject]);

  return (
    <SolarSystemScene
      candidates={mergedCandidates}
      selectedCandidateId={effectiveSelectedCandidateId}
      onSelectCandidate={onSelectCandidate ?? (() => {})}
      timeEpochRatio={timeEpochRatio}
      sliderDay={sliderDay}
    />
  );
};

export default SolarSystem;
