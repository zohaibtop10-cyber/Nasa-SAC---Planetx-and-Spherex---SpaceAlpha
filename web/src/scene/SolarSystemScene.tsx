/**
 * 3D Solar System Scene (Three.js Wrapper)
 *
 * Integrates SolarSystem.ts engine:
 * - Near-black canvas (#050506), zero bloom
 * - Schematic circular planetary orbits
 * - SPHEREx marker near Earth tagged [Illustrative]
 * - Dashed spherical shell for Planet X zone tagged "Hypothetical [assumed]"
 * - Scale mode toggle: Dual Scale (inner <= 5 AU linear, outer > 5 AU log) vs Linear
 * - OrbitControls with inertia
 * - Real-time FPS measurement counter tagged [measured]
 * - Permanent interactive Legend overlay (never missing)
 * - Procedural noise-displaced asteroids for candidates
 * - Dynamic line-of-sight distance uncertainty segments
 */

import React, { useEffect, useRef } from 'react';
import { Candidate } from '../data/types';
import { SolarSystem } from './SolarSystem';

interface SolarSystemSceneProps {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  timeEpochRatio: number; // 0.0 to 1.0 (scrubbing along observation baseline)
  sliderDay?: number; // 0 to 365 days timeline slider
}

export const SolarSystemScene: React.FC<SolarSystemSceneProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  timeEpochRatio,
  sliderDay,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SolarSystem | null>(null);

  // Initialize SolarSystem engine
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new SolarSystem(container, {
      initialScaleMode: 'dual',
      onSelectCandidate: (id) => onSelectCandidate(id),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Update candidate asteroids, selection highlight, and time scrub uncertainty segments
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateCandidates(
        candidates,
        selectedCandidateId,
        timeEpochRatio,
        onSelectCandidate
      );
    }
  }, [candidates, selectedCandidateId, timeEpochRatio, onSelectCandidate]);

  // Listen to sliderDay updates and propagate to Three.js engine
  useEffect(() => {
    if (engineRef.current && sliderDay !== undefined) {
      engineRef.current.setSliderDay(sliderDay);
    }
  }, [sliderDay]);

  const handleResetCamera = () => {
    if (engineRef.current) {
      engineRef.current.resetCamera();
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Honesty & Compliance Badge */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
          zIndex: 20,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--color-text-1)',
            backgroundColor: 'rgba(17, 17, 19, 0.85)',
            padding: '4px 8px',
            border: '1px solid var(--color-hairline)',
            borderRadius: '0px',
          }}
        >
          3D Models <strong>[Illustrative]</strong>
        </span>
      </div>

      {/* Camera Reset Control */}
      <button
        onClick={handleResetCamera}
        style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          fontFamily: 'monospace',
          fontSize: '11px',
          color: 'var(--color-text-1)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-hairline)',
          padding: '6px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          zIndex: 20,
        }}
      >
        Reset Camera
      </button>
    </div>
  );
};
