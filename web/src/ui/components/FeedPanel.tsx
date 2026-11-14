/**
 * FeedPanel.tsx - 360px Survey Feed Panel
 *
 * Implements:
 * - 360 px width with hairline right border; canvas fills the rest
 * - Accessible keyboard navigation (ArrowUp, ArrowDown, Enter, Space)
 * - Number chips with borders: Measured (solid), Derived (dashed), Assumed (dotted)
 * - Strict requirement: Every displayed number goes through labelFor
 * - Direct navigation to Object Page (#/object/<id>)
 */

import React, { useEffect, useRef, useState } from 'react';
import { labelFor } from '../../data/labels';
import { Candidate, Verdict } from '../../data/types';
import { NumberChip } from './NumberChip';

interface FeedPanelProps {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  onOpenObjectPage: (candidateId: string) => void;
}

export const FeedPanel: React.FC<FeedPanelProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onOpenObjectPage,
}) => {
  const [filterVerdict, setFilterVerdict] = useState<Verdict | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Filter candidates
  const filteredCandidates = candidates.filter((c) => {
    if (filterVerdict !== 'all' && c.verdict !== filterVerdict) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      // Check if query is coordinates "ra, dec" e.g. "133.8, -7.2"
      const coordMatch = q.match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
      if (coordMatch && c.positions?.[0]) {
        const qRa = parseFloat(coordMatch[1]);
        const qDec = parseFloat(coordMatch[2]);
        const dRa = Math.abs(c.positions[0].ra - qRa);
        const dDec = Math.abs(c.positions[0].dec - qDec);
        return dRa < 20.0 && dDec < 20.0;
      }
      const matchName = c.match?.designation?.toLowerCase() || '';
      return c.id.toLowerCase().includes(q) || matchName.includes(q) || c.field_id.toLowerCase().includes(q);
    }
    return true;
  });

  // Keyboard navigation across feed items
  const handleKeyDown = (e: React.KeyboardEvent, index: number, candId: string) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = Math.min(filteredCandidates.length - 1, index + 1);
      const nextId = filteredCandidates[nextIndex]?.id;
      if (nextId) {
        onSelectCandidate(nextId);
        itemRefs.current.get(nextId)?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(0, index - 1);
      const prevId = filteredCandidates[prevIndex]?.id;
      if (prevId) {
        onSelectCandidate(prevId);
        itemRefs.current.get(prevId)?.focus();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenObjectPage(candId);
    }
  };

  // Scroll focused item into view
  useEffect(() => {
    if (selectedCandidateId) {
      const el = itemRefs.current.get(selectedCandidateId);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedCandidateId]);

  return (
    <aside
      aria-label="SPHEREx Survey Feed"
      style={{
        width: '360px',
        minWidth: '360px',
        maxWidth: '360px',
        height: '100%',
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-hairline)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Header & Filter Controls */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--color-hairline)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px' }}>
              SURVEY FEED
            </span>
            <span
              style={{
                fontSize: '10px',
                color: '#888899',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '2px 6px',
                border: '1px solid var(--color-hairline)',
              }}
            >
              {filteredCandidates.length} of {candidates.length}
            </span>
          </div>

          <span style={{ fontSize: '10px', color: '#71717A' }}>Live QR2 Stream</span>
        </div>

        {/* Search input with coordinate and benchmark support */}
        <input
          type="text"
          placeholder="Search target, ID, or RA, Dec (e.g. 133.8, -7.2)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-hairline)',
            color: 'var(--color-text-1)',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Challenge Benchmarks Quick Pills */}
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { label: 'Barnard', query: "Barnard's Star" },
            { label: 'WISE 0855', query: 'WISE' },
            { label: 'Eps Indi', query: 'Epsilon Indi' },
            { label: 'RW Aur', query: 'RW Aurigae' },
            { label: 'R Dra', query: 'R Draconis' },
          ].map((bm) => (
            <button
              key={bm.label}
              onClick={() => setSearchQuery(searchQuery === bm.query ? '' : bm.query)}
              style={{
                fontFamily: 'monospace',
                fontSize: '10px',
                padding: '2px 6px',
                backgroundColor: searchQuery === bm.query ? 'rgba(56, 189, 248, 0.2)' : 'var(--color-bg)',
                border: searchQuery === bm.query ? '1px solid #38BDF8' : '1px solid var(--color-hairline)',
                color: searchQuery === bm.query ? '#38BDF8' : '#71717A',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {bm.label}
            </button>
          ))}
        </div>

        {/* Verdict category pills */}
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
          {(['all', 'unknown', 'known_object', 'high_motion_star'] as const).map((v) => {
            const count =
              v === 'all'
                ? candidates.length
                : candidates.filter((c) => c.verdict === v).length;
            const labelText =
              v === 'all'
                ? 'All'
                : v === 'unknown'
                ? 'Unknown'
                : v === 'known_object'
                ? 'Known'
                : 'Stars';

            const active = filterVerdict === v;
            return (
              <button
                key={v}
                onClick={() => setFilterVerdict(v)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: active ? 'var(--color-bg)' : 'transparent',
                  color: active ? 'var(--color-text-1)' : '#71717A',
                  border: active
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-hairline)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {labelText} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed List Items */}
      <div
        role="feed"
        aria-label="Mover candidates list"
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px',
          gap: '8px',
        }}
      >
        {filteredCandidates.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: '#71717A',
              fontSize: '11px',
            }}
          >
            No candidate movers match current filter.
          </div>
        ) : (
          filteredCandidates.map((cand, idx) => {
            const isSelected = cand.id === selectedCandidateId;
            const isUnknown = cand.verdict === 'unknown';
            const isKnown = cand.verdict === 'known_object';
            const isStar = cand.verdict === 'high_motion_star';

            const verdictTag = isUnknown
              ? 'Unknown'
              : isKnown
              ? 'Known'
              : isStar
              ? 'Star'
              : 'Artifact';
            const verdictColor = isUnknown
              ? '#FF6B3D'
              : isKnown
              ? '#10B981'
              : isStar
              ? '#38BDF8'
              : '#71717A';

            // Coordinates through labelFor
            const raVal = cand.positions[0]?.ra ?? 0;
            const decVal = cand.positions[0]?.dec ?? 0;
            const raLabel = labelFor(cand, 'positions');
            const decLabel = labelFor(cand, 'positions');

            return (
              <div
                key={cand.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(cand.id, el);
                  else itemRefs.current.delete(cand.id);
                }}
                role="article"
                tabIndex={0}
                onClick={() => onSelectCandidate(cand.id)}
                onKeyDown={(e) => handleKeyDown(e, idx, cand.id)}
                style={{
                  backgroundColor: isSelected ? 'var(--color-bg)' : '#111113',
                  border: isSelected
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-hairline)',
                  borderRadius: '0px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Card Title & Verdict */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#EDEDED',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '200px',
                      }}
                    >
                      {cand.match?.designation || cand.id}
                    </span>
                    <span style={{ fontSize: '10px', color: '#71717A' }}>
                      {cand.id} · {cand.release_batch}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: verdictColor,
                      backgroundColor: `${verdictColor}1A`,
                      border: `1px solid ${verdictColor}4D`,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {verdictTag}
                  </span>
                </div>

                {/* Metrics Chips (All through labelFor) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <NumberChip
                    prefix="RA"
                    value={raVal}
                    unit="°"
                    label={raLabel}
                    compact
                    precision={2}
                  />
                  <NumberChip
                    prefix="Dec"
                    value={decVal}
                    unit="°"
                    label={decLabel}
                    compact
                    precision={2}
                  />

                  {/* Confidence */}
                  {cand.confidence !== undefined && (
                    <NumberChip
                      prefix="Conf"
                      value={cand.confidence * 100}
                      unit="%"
                      label={labelFor(cand, 'confidence')}
                      compact
                      precision={0}
                    />
                  )}

                  {/* Distance Bounds for Unknowns */}
                  {cand.distance_range && (
                    <>
                      <NumberChip
                        prefix="d_min"
                        value={cand.distance_range.min_au}
                        unit="AU"
                        label={labelFor(cand, 'distance_range.min_au')}
                        compact
                        precision={1}
                      />
                      <NumberChip
                        prefix="d_max"
                        value={cand.distance_range.max_au}
                        unit="AU"
                        label={labelFor(cand, 'distance_range.max_au')}
                        compact
                        precision={1}
                      />
                    </>
                  )}

                  {/* Match Separation */}
                  {cand.match?.separation_arcsec !== undefined && (
                    <NumberChip
                      prefix="Sep"
                      value={cand.match.separation_arcsec}
                      unit='"'
                      label={labelFor(cand, 'match.separation_arcsec')}
                      compact
                      precision={2}
                    />
                  )}

                  {/* Photometric Colour Index */}
                  {cand.colour_index !== null && cand.colour_index !== undefined && (
                    <NumberChip
                      prefix="CI"
                      value={cand.colour_index}
                      label={labelFor(cand, 'colour_index')}
                      compact
                      precision={2}
                    />
                  )}
                </div>

                {/* Card Action Link */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '4px',
                    paddingTop: '6px',
                    borderTop: '1px solid rgba(38, 38, 42, 0.5)',
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#71717A' }}>
                    Press [Enter] to inspect
                  </span>
                  <a
                    href={`#/object/${cand.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenObjectPage(cand.id);
                    }}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      color: 'var(--color-accent)',
                      textDecoration: 'none',
                      padding: '2px 6px',
                      border: '1px solid rgba(255, 107, 61, 0.3)',
                      borderRadius: '4px',
                    }}
                  >
                    Inspect Pedestal →
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
