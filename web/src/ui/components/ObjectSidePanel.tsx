import React from 'react';
import { Candidate } from '../../data/types';
import { labelFor } from '../../data/labels';

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
      style={{
        position: 'absolute',
        top: '68px',
        right: '16px',
        width: '380px',
        maxHeight: 'calc(100vh - 160px)',
        backgroundColor: 'rgba(17, 17, 19, 0.94)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--color-hairline)',
        borderRadius: '0px', // Strict Studio requirement: 0 for panels
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

      <div style={{ height: '1px', backgroundColor: 'var(--color-hairline)' }} />

      {/* Telemetry Grid with Mandatory Labels */}
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
          <div style={{ backgroundColor: 'var(--color-bg)', padding: '8px', border: '1px solid var(--color-hairline)' }}>
            <div style={{ color: '#71717A', fontSize: '10px' }}>
              CONFIDENCE <span style={{ color: '#38BDF8' }}>[{labelFor(candidate, 'confidence')}]</span>
            </div>
            <div style={{ color: 'var(--color-text-1)', fontSize: '13px', marginTop: '2px' }}>
              {(candidate.confidence * 100).toFixed(1)}%
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--color-bg)', padding: '8px', border: '1px solid var(--color-hairline)' }}>
            <div style={{ color: '#71717A', fontSize: '10px' }}>
              COLOUR INDEX <span style={{ color: '#38BDF8' }}>[{labelFor(candidate, 'colour_index')}]</span>
            </div>
            <div style={{ color: 'var(--color-text-1)', fontSize: '13px', marginTop: '2px' }}>
              {candidate.colour_index !== null ? candidate.colour_index.toFixed(2) : 'N/A'}
            </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#FF6B3D', fontWeight: 600 }}>
              PARALLAX DISTANCE BOUNDS
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#38BDF8' }}>
              [{labelFor(candidate, 'distance_min_au')}]
            </span>
          </div>

          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '16px',
              color: 'var(--color-text-1)',
              margin: '6px 0',
            }}
          >
            {candidate.distance_range.min_au.toFixed(1)} – {candidate.distance_range.max_au.toFixed(1)} AU
          </div>

          <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#A1A1AA', margin: 0 }}>
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
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#A1A1AA' }}>
            Residual separation: {candidate.match.separation_arcsec !== undefined ? candidate.match.separation_arcsec.toFixed(2) : '0.00'}″{' '}
            <span style={{ color: '#38BDF8' }}>[{labelFor(candidate, 'match.separation_arcsec')}]</span>
          </div>
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
                padding: '6px 10px',
                fontFamily: 'monospace',
                fontSize: '11px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: '#A1A1AA' }}>Epoch {idx + 1}</span>
              <span style={{ color: 'var(--color-text-1)' }}>
                RA {pos.ra.toFixed(4)}° · Dec {pos.dec.toFixed(4)}°{' '}
                <span style={{ color: '#38BDF8' }}>[{labelFor(candidate, 'positions.ra')}]</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Reason Chain (Audit Trail) */}
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
          Classification Reason Chain
        </h3>

        <ol
          style={{
            margin: 0,
            paddingLeft: '18px',
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: '1.5',
            color: '#D4D4D8',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {candidate.reason_chain.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </div>
    </aside>
  );
};
