/**
 * SolarSystem.tsx - React Component Wrapper for SolarSystem Three.js Engine
 *
 * Implements:
 * - Dual-scale system (inner linear <= 5 AU, outer log > 5 AU)
 * - Procedurally generated objects (noise-displaced icosahedrons for asteroids, particle tails for comets)
 * - Photometric tinting based on colour_index data from JSON
 * - Attached "Illustrative" tags for 3D models
 * - Line-of-sight distance range segments with ghost spheres for unknowns
 * - Real-time smooth interpolation along 36-point Keplerian orbits
 */

import React from 'react';
import { SolarSystemScene } from './SolarSystemScene';
import { Candidate } from '../data/types';

export interface SolarSystemProps {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  timeEpochRatio?: number;
  sliderDay?: number;
}

export const SolarSystem: React.FC<SolarSystemProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  timeEpochRatio = 0.0,
  sliderDay = 0,
}) => {
  return (
    <SolarSystemScene
      candidates={candidates}
      selectedCandidateId={selectedCandidateId}
      onSelectCandidate={onSelectCandidate}
      timeEpochRatio={timeEpochRatio}
      sliderDay={sliderDay}
    />
  );
};

export default SolarSystem;
