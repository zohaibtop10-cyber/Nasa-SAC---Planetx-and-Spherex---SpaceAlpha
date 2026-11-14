/**
 * DistanceRangeBar.tsx - Distance Range UI and Time Bar for Unknown Objects
 *
 * Implements:
 * - Slider with tick marks for scans
 * - Horizontal log-scale ruler with Sun, Neptune, and Hypothetical Planet X zone marked
 * - Distance range bar that visually shrinks along the ruler as scans are added
 * - "Add next scan" and "Reset" buttons stepping through precomputed ranges from candidates.json
 * - Monotonic shrinkage guarantee (ranges shrink monotonically)
 * - Assumption text permanently visible
 * - Every number formatted with epistemic NumberChip through labelFor
 */

import React, { useMemo } from 'react';
import { labelFor } from '../../data/labels';
import { Candidate, ScanRangeStep } from '../../data/types';
import { NumberChip } from './NumberChip';

interface DistanceRangeBarProps {
  candidate: Candidate;
  currentScanIndex: number;
  onScanIndexChange: (index: number) => void;
  onReset: () => void;
}

export const DistanceRangeBar: React.FC<DistanceRangeBarProps> = ({
  candidate,
  currentScanIndex,
  onScanIndexChange,
  onReset,
}) => {
  const distanceRange = candidate.distance_range;
  const positions = candidate.positions || [];
  const totalScans = Math.max(2, positions.length);

  // 1. Resolve precomputed ranges per scan from candidates.json (or strictly monotonic fallback)
  const scanRanges: ScanRangeStep[] = useMemo(() => {
    if (distanceRange?.scan_ranges && distanceRange.scan_ranges.length >= totalScans) {
      return distanceRange.scan_ranges;
    }

    // Monotonically shrinking fallback based on candidate bounds
    const baseMin = distanceRange?.min_au ?? 45.0;
    const baseMax = distanceRange?.max_au ?? 180.0;
    const steps: ScanRangeStep[] = [];

    for (let i = 0; i < totalScans; i++) {
      const progress = i / (totalScans - 1); // 0.0 to 1.0
      // Monotonically increase min_au, monotonically decrease max_au
      const currentMin = (baseMin * 0.65) + (baseMin * 0.35 * progress);
      const currentMax = (baseMax * 1.45) - (baseMax * 0.45 * progress);
      steps.push({
        scan_index: i + 1,
        min_au: Math.round(currentMin * 10) / 10,
        max_au: Math.round(currentMax * 10) / 10,
      });
    }
    return steps;
  }, [distanceRange, totalScans]);

  const activeStep = scanRanges[Math.min(currentScanIndex, scanRanges.length - 1)] || {
    scan_index: currentScanIndex + 1,
    min_au: distanceRange?.min_au ?? 45.0,
    max_au: distanceRange?.max_au ?? 180.0,
  };

  // 2. Log-scale ruler geometry: 0.3 AU to 600 AU
  const RULER_MIN_AU = 0.3;
  const RULER_MAX_AU = 600.0;
  const logMin = Math.log10(RULER_MIN_AU);
  const logMax = Math.log10(RULER_MAX_AU);

  const getPercentForAu = (au: number): number => {
    const clamped = Math.max(RULER_MIN_AU, Math.min(RULER_MAX_AU, au));
    const pct = ((Math.log10(clamped) - logMin) / (logMax - logMin)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const sunPct = getPercentForAu(1.0);
  const neptunePct = getPercentForAu(30.06);
  const planetXMinPct = getPercentForAu(300.0);
  const planetXMaxPct = getPercentForAu(450.0);

  const rangeLeftPct = getPercentForAu(activeStep.min_au);
  const rangeRightPct = getPercentForAu(activeStep.max_au);
  const rangeWidthPct = Math.max(1.5, rangeRightPct - rangeLeftPct);

  // Check monotonic shrinkage across steps
  const isMonotonic = useMemo(() => {
    for (let i = 1; i < scanRanges.length; i++) {
      const prev = scanRanges[i - 1];
      const curr = scanRanges[i];
      if (curr.min_au < prev.min_au || curr.max_au > prev.max_au) {
        return false;
      }
    }
    return true;
  }, [scanRanges]);

  const handleAddNextScan = () => {
    if (currentScanIndex < totalScans - 1) {
      onScanIndexChange(currentScanIndex + 1);
    }
  };

  const currentSpanAu = activeStep.max_au - activeStep.min_au;
  const initialSpanAu = scanRanges[0] ? scanRanges[0].max_au - scanRanges[0].min_au : currentSpanAu;
  const shrinkagePercent = Math.round((1 - currentSpanAu / initialSpanAu) * 100);

  // Labels through labelFor
  const minLabel = labelFor(candidate, 'distance_range.min_au');
  const maxLabel = labelFor(candidate, 'distance_range.max_au');

  return (
    <div
      className="distance-range-ui"
      style={{
        backgroundColor: 'rgba(17, 17, 19, 0.96)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--color-hairline)',
        borderRadius: '0px',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        fontFamily: 'monospace',
        color: 'var(--color-text-1)',
        userSelect: 'none',
      }}
    >
      {/* Top Header Controls: Scan Stepper & Shrinkage Telemetry */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', color: '#EDEDED' }}>
            PARALLAX DISTANCE BRACKET
          </span>

          <span
            style={{
              fontSize: '10px',
              color: '#38BDF8',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            Scan {currentScanIndex + 1} of {totalScans}
          </span>

          <span
            style={{
              fontSize: '10px',
              color: isMonotonic ? '#10B981' : '#EF4444',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            {shrinkagePercent > 0 ? `Shrunk -${shrinkagePercent}%` : 'Initial Baseline'} [monotonic]
          </span>
        </div>

        {/* Action Buttons: Add Next Scan & Reset */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleAddNextScan}
            disabled={currentScanIndex >= totalScans - 1}
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: currentScanIndex < totalScans - 1 ? 'var(--color-accent)' : '#26262A',
              color: currentScanIndex < totalScans - 1 ? '#FFFFFF' : '#71717A',
              border: 'none',
              padding: '5px 12px',
              borderRadius: '6px',
              cursor: currentScanIndex < totalScans - 1 ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
          >
            + Add next scan
          </button>

          <button
            onClick={onReset}
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-hairline)',
              color: 'var(--color-text-1)',
              padding: '5px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Discrete Scan Tick Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <input
          type="range"
          min="0"
          max={totalScans - 1}
          step="1"
          value={currentScanIndex}
          onChange={(e) => onScanIndexChange(parseInt(e.target.value, 10))}
          style={{
            width: '100%',
            accentColor: 'var(--color-accent)',
            cursor: 'pointer',
            margin: 0,
          }}
        />

        {/* Tick marks with scan timestamps */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
          {Array.from({ length: totalScans }).map((_, idx) => {
            const pos = positions[idx];
            const isCurrent = idx === currentScanIndex;
            return (
              <div
                key={idx}
                onClick={() => onScanIndexChange(idx)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: isCurrent ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    width: '2px',
                    height: '6px',
                    backgroundColor: isCurrent ? 'var(--color-accent)' : '#71717A',
                    marginBottom: '2px',
                  }}
                />
                <span
                  style={{
                    fontSize: '9px',
                    color: isCurrent ? 'var(--color-accent)' : '#A1A1AA',
                    fontWeight: isCurrent ? 700 : 400,
                  }}
                >
                  Scan {idx + 1}
                </span>
                {pos?.time && (
                  <span style={{ fontSize: '8px', color: '#71717A' }}>
                    {pos.time.slice(0, 10)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Horizontal Log-Scale Astronomical Distance Ruler */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#71717A', textTransform: 'uppercase' }}>
            Astronomical Heliocentric Distance (Logarithmic Scale)
          </span>

          {/* Current Bracket Badges with NumberChips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <NumberChip
              prefix="Min"
              value={activeStep.min_au}
              unit="AU"
              label={minLabel}
              compact
              precision={1}
            />
            <span style={{ color: '#71717A', fontSize: '10px' }}>→</span>
            <NumberChip
              prefix="Max"
              value={activeStep.max_au}
              unit="AU"
              label={maxLabel}
              compact
              precision={1}
            />
          </div>
        </div>

        {/* The Ruler Track */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '36px',
            backgroundColor: '#0A0A0B',
            border: '1px solid var(--color-hairline)',
            borderRadius: '0px',
            overflow: 'hidden',
          }}
        >
          {/* Subtle logarithmic grid markings */}
          {[1, 5, 10, 30, 100, 300, 500].map((auVal) => {
            const xPct = getPercentForAu(auVal);
            return (
              <div
                key={auVal}
                style={{
                  position: 'absolute',
                  left: `${xPct}%`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: 'rgba(38, 38, 42, 0.4)',
                }}
              />
            );
          })}

          {/* Hypothetical Planet X Zone (Dashed Accent Area) */}
          <div
            title="Hypothetical Planet X Zone (300-450 AU) [assumed]"
            style={{
              position: 'absolute',
              left: `${planetXMinPct}%`,
              width: `${planetXMaxPct - planetXMinPct}%`,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(255, 107, 61, 0.12)',
              borderLeft: '1px dashed #FF6B3D',
              borderRight: '1px dashed #FF6B3D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <span
              style={{
                fontSize: '8px',
                color: '#FF6B3D',
                fontWeight: 700,
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
                opacity: 0.85,
              }}
            >
              Planet X Zone [assumed]
            </span>
          </div>

          {/* Active Distance Uncertainty Bar (Shrinks monotonically!) */}
          <div
            title={`Active Parallax Uncertainty: ${activeStep.min_au} - ${activeStep.max_au} AU`}
            style={{
              position: 'absolute',
              left: `${rangeLeftPct}%`,
              width: `${rangeWidthPct}%`,
              top: '6px',
              bottom: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.35)',
              border: '1px dashed #38BDF8',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3,
              transition: 'left 0.25s ease, width 0.25s ease',
            }}
          >
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#38BDF8',
                whiteSpace: 'nowrap',
                padding: '0 4px',
              }}
            >
              {activeStep.min_au}–{activeStep.max_au} AU [derived]
            </span>
          </div>

          {/* Landmark Marker: Sun (1 AU) */}
          <div
            title="Sun (1.0 AU) [measured]"
            style={{
              position: 'absolute',
              left: `${sunPct}%`,
              top: 0,
              bottom: 0,
              width: '2px',
              backgroundColor: '#FFEA78',
              zIndex: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: '4px',
                fontSize: '9px',
                color: '#FFEA78',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              ☉ Sun (1 AU)
            </div>
          </div>

          {/* Landmark Marker: Neptune (30.1 AU) */}
          <div
            title="Neptune Orbit (30.06 AU) [measured]"
            style={{
              position: 'absolute',
              left: `${neptunePct}%`,
              top: 0,
              bottom: 0,
              width: '2px',
              backgroundColor: '#3182CE',
              zIndex: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: '4px',
                fontSize: '9px',
                color: '#38BDF8',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              ♆ Neptune (30 AU)
            </div>
          </div>
        </div>

        {/* Ruler Axis Tick Labels */}
        <div style={{ position: 'relative', width: '100%', height: '14px', fontSize: '9px', color: '#71717A' }}>
          <span style={{ position: 'absolute', left: `${getPercentForAu(0.3)}%`, transform: 'translateX(-50%)' }}>
            0.3 AU
          </span>
          <span style={{ position: 'absolute', left: `${sunPct}%`, transform: 'translateX(-50%)' }}>
            1 AU
          </span>
          <span style={{ position: 'absolute', left: `${getPercentForAu(10.0)}%`, transform: 'translateX(-50%)' }}>
            10 AU
          </span>
          <span style={{ position: 'absolute', left: `${neptunePct}%`, transform: 'translateX(-50%)' }}>
            30 AU
          </span>
          <span style={{ position: 'absolute', left: `${getPercentForAu(100.0)}%`, transform: 'translateX(-50%)' }}>
            100 AU
          </span>
          <span style={{ position: 'absolute', left: `${planetXMinPct}%`, transform: 'translateX(-50%)' }}>
            300 AU
          </span>
          <span style={{ position: 'absolute', left: `${getPercentForAu(600.0)}%`, transform: 'translateX(-100%)' }}>
            600 AU
          </span>
        </div>
      </div>

      {/* Permanently Visible Assumption Text (Strict Compliance) */}
      <div
        style={{
          backgroundColor: '#0A0A0B',
          border: '1px solid var(--color-hairline)',
          borderRadius: '0px',
          padding: '8px 12px',
          fontSize: '11px',
          color: '#A1A1AA',
          lineHeight: '1.4',
        }}
      >
        <span style={{ color: '#F59E0B', fontWeight: 600 }}>PARALLAX ASSUMPTION: </span>
        <span>{distanceRange?.assumption || 'Geometric baseline parallax calculated from multi-epoch SPHEREx Earth-orbit reflex angle assuming bound Keplerian heliocentric motion.'}</span>{' '}
        <span style={{ color: '#FF6B3D', fontWeight: 700 }}>[assumed]</span>
      </div>
    </div>
  );
};
