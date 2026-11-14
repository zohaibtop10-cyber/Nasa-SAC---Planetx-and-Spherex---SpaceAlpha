/**
 * ObjectSidePanel.tsx - Quick Telemetry Flyout
 *
 * Implements:
 * - Direct NumberChip integration with solid/dashed/dotted epistemic borders
 * - Strict adherence to labelFor
 * - Link to dedicated Object Page (#/object/<id>)
 */

import React from 'react';
import { labelFor } from '../../data/labels';
import { Candidate } from '../../data/types';
import { NumberChip } from './NumberChip';

interface ObjectSidePanelProps {
  candidate: Candidate | null;
  onClose: () => void;
}

export const ObjectSidePanel: React.FC<ObjectSidePanelProps> = ({ candidate, onClose }) => {
  if (!candidate) return null;

  const isUnknown = candidate.verdict === 'unknown';
  const isKnown = candidate.verdict === 'known_object';
  const isStar = candidate.verdict === 'high_motion_star';

  const verdictColor = isUnknown ? '#FF6B3D' : isKnown ? '#10B981' : isStar ? '#38BDF8' : '#71717A';
  const verdictLabel = isUnknown
    ? 'Unknown Candidate'
    : isKnown
    ? 'Known Asteroid'
    : isStar
    ? 'High Motion Star'
    : 'Artifact';

  return (
    <aside
      aria-label="Candidate Details"
      style={{
        position: 'absolute',
        top: '68px',
        right: '16px',
        width: '380px',
        maxHeight: 'calc(100vh - 160px)',
        backgroundColor: 'rgba(17, 17, 19, 0.94)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--color-hairline)',
        borderRadius: '0px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto',
        zIndex: 40,
        boxShadow: 'none',
      }}
    >
      {/* Header & Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 700,
                color: verdictColor,
                backgroundColor: `${verdictColor}1A`,
                border: `1px solid ${verdictColor}4D`,
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              {verdictLabel}
            </span>

            {candidate.simulated && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  color: '#F59E0B',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                [Simulated]
              </span>
            )}

            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#888899',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--color-hairline)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              3D Model [Illustrative]
            </span>
          </div>

          <h2
            style={{
              fontFamily: 'monospace',
              fontSize: '18px',
              color: 'var(--color-text-1)',
              margin: '8px 0 2px 0',
            }}
          >
            {candidate.match?.designation || candidate.id}
          </h2>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#71717A' }}>
            Field: {candidate.field_id} · Release: {candidate.release_batch}
          </span>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#71717A',
            fontSize: '18px',
            fontFamily: 'monospace',
            cursor: 'pointer',
            padding: '2px 6px',
          }}
          title="Close panel"
        >
          ×
        </button>
      </div>

      {/* Button to navigate to Object Page */}
      <a
        href={`#/object/${candidate.id}`}
        style={{
          fontFamily: 'monospace',
          fontSize: '11px',
          color: 'var(--color-text-1)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-hairline)',
          padding: '8px 12px',
          borderRadius: '6px',
          textAlign: 'center',
          textDecoration: 'none',
          display: 'block',
          fontWeight: 600,
        }}
      >
        View on Pedestal (Object Page) →
      </a>

      <div style={{ height: '1px', backgroundColor: 'var(--color-hairline)' }} />

      {/* Telemetry Grid with NumberChips */}
      <div>
        <h3
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '0.5px',
            color: '#71717A',
            margin: '0 0 8px 0',
            textTransform: 'uppercase',
          }}
        >
          Astrometric Telemetry
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          <div style={{ backgroundColor: 'var(--color-bg)', padding: '10px', border: '1px solid var(--color-hairline)' }}>
            <div style={{ color: '#71717A', fontSize: '10px', marginBottom: '6px' }}>CONFIDENCE</div>
            <NumberChip
              value={candidate.confidence * 100}
              unit="%"
              label={labelFor(candidate, 'confidence')}
              precision={1}
            />
          </div>

          <div style={{ backgroundColor: 'var(--color-bg)', padding: '10px', border: '1px solid var(--color-hairline)' }}>
            <div style={{ color: '#71717A', fontSize: '10px', marginBottom: '6px' }}>COLOUR INDEX</div>
            {candidate.colour_index !== null ? (
              <NumberChip
                value={candidate.colour_index}
                label={labelFor(candidate, 'colour_index')}
                precision={2}
              />
            ) : (
              <span style={{ color: '#71717A', fontSize: '11px' }}>N/A</span>
            )}
          </div>
        </div>
      </div>

      {/* Distance Range (for Unknowns) */}
      {candidate.distance_range && (
        <div
          style={{
            backgroundColor: 'rgba(255, 107, 61, 0.08)',
            border: '1px solid rgba(255, 107, 61, 0.3)',
            padding: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#FF6B3D', fontWeight: 600 }}>
              PARALLAX DISTANCE BOUNDS
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <NumberChip
              prefix="Min"
              value={candidate.distance_range.min_au}
              unit="AU"
              label={labelFor(candidate, 'distance_range.min_au')}
              precision={1}
            />
            <NumberChip
              prefix="Max"
              value={candidate.distance_range.max_au}
              unit="AU"
              label={labelFor(candidate, 'distance_range.max_au')}
              precision={1}
            />
          </div>

          <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#A1A1AA', margin: '8px 0 0 0' }}>
            Assumption: {candidate.distance_range.assumption}{' '}
            <span style={{ color: '#F59E0B' }}>[assumed]</span>
          </p>
        </div>
      )}

      {/* Match Details (for Known Objects) */}
      {candidate.match && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '12px',
          }}
        >
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#10B981', fontWeight: 600 }}>
            CATALOG IDENTIFICATION
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--color-text-1)', margin: '4px 0' }}>
            {candidate.match.designation} ({candidate.match.catalog})
          </div>
          {candidate.match.separation_arcsec !== undefined && (
            <div style={{ marginTop: '6px' }}>
              <NumberChip
                prefix="Separation"
                value={candidate.match.separation_arcsec}
                unit='"'
                label={labelFor(candidate, 'match.separation_arcsec')}
                precision={2}
              />
            </div>
          )}
        </div>
      )}

      {/* Observation Epoch Positions */}
      <div>
        <h3
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '0.5px',
            color: '#71717A',
            margin: '0 0 8px 0',
            textTransform: 'uppercase',
          }}
        >
          Observation Epochs ({candidate.positions.length} scans)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {candidate.positions.map((pos, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-hairline)',
                padding: '8px 10px',
                fontFamily: 'monospace',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ color: '#71717A', fontSize: '10px' }}>
                Scan {idx + 1} · {pos.time}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <NumberChip
                  prefix="RA"
                  value={pos.ra}
                  unit="°"
                  label={labelFor(candidate, 'positions')}
                  compact
                  precision={4}
                />
                <NumberChip
                  prefix="Dec"
                  value={pos.dec}
                  unit="°"
                  label={labelFor(candidate, 'positions')}
                  compact
                  precision={4}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
