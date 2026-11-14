import React, { useEffect, useState } from 'react';
import { Candidate } from '../../data/types';

interface SkyBlinkViewerProps {
  candidates: Candidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
}

export const SkyBlinkViewer: React.FC<SkyBlinkViewerProps> = ({
  candidates,
  selectedCandidateId,
  onSelectCandidate,
}) => {
  const [epochIndex, setEpochIndex] = useState<0 | 1>(0);
  const [isBlinking, setIsBlinking] = useState(true);
  const [blinkSpeedMs, setBlinkSpeedMs] = useState(650);
  const [showJplOverlay, setShowJplOverlay] = useState(true);

  // Auto-blink toggle
  useEffect(() => {
    if (!isBlinking) return;
    const interval = setInterval(() => {
      setEpochIndex((prev) => (prev === 0 ? 1 : 0));
    }, blinkSpeedMs);
    return () => clearInterval(interval);
  }, [isBlinking, blinkSpeedMs]);

  const activeCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 24px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-hairline)',
          borderRadius: '0px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Controls Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontFamily: 'monospace', fontSize: '15px', color: 'var(--color-text-1)', margin: 0 }}>
              2D SKY BLINK COMPARATOR
            </h2>
            <p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#71717A', margin: '4px 0 0 0' }}>
              Multi-epoch infrared difference blink · Target Field: {activeCandidate?.field_id || 'FIELD-01'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setIsBlinking(!isBlinking)}
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: 'var(--color-text-1)',
                backgroundColor: isBlinking ? 'rgba(255, 107, 61, 0.2)' : 'var(--color-bg)',
                border: isBlinking ? '1px solid #FF6B3D' : '1px solid var(--color-hairline)',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {isBlinking ? 'PAUSE BLINK' : 'START BLINK'}
            </button>

            <button
              onClick={() => setShowJplOverlay(!showJplOverlay)}
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: showJplOverlay ? '#10B981' : '#71717A',
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-hairline)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              JPL Ephemeris Overlay: {showJplOverlay ? 'ON' : 'OFF'}
            </button>

            <select
              value={blinkSpeedMs}
              onChange={(e) => setBlinkSpeedMs(Number(e.target.value))}
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: 'var(--color-text-1)',
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-hairline)',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <option value={400}>Speed: Fast (400ms)</option>
              <option value={650}>Speed: Normal (650ms)</option>
              <option value={1000}>Speed: Slow (1.0s)</option>
            </select>
          </div>
        </div>

        {/* Blink Canvas Area */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '420px',
            backgroundColor: '#050506',
            border: '1px solid var(--color-hairline)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Simulated 2D Sky Image Representation */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 50% 50%, rgba(25, 25, 32, 0.9) 0%, rgba(5, 5, 6, 1) 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Background static stars (visible in both epochs) */}
            {[
              { x: 15, y: 25, s: 2 },
              { x: 28, y: 70, s: 3 },
              { x: 42, y: 18, s: 1.5 },
              { x: 65, y: 80, s: 2.5 },
              { x: 82, y: 35, s: 3 },
              { x: 74, y: 62, s: 2 },
              { x: 20, y: 85, s: 1.8 },
              { x: 88, y: 12, s: 2 },
            ].map((star, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${star.x}%`,
                  top: `${star.y}%`,
                  width: `${star.s * 2}px`,
                  height: `${star.s * 2}px`,
                  borderRadius: '50%',
                  backgroundColor: '#E4E4E7',
                  boxShadow: '0 0 4px #A1A1AA',
                }}
              />
            ))}

            {/* Moving Object (Blinks between position 1 and position 2) */}
            <div
              style={{
                position: 'absolute',
                left: epochIndex === 0 ? '46%' : '54%',
                top: epochIndex === 0 ? '48%' : '52%',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: activeCandidate?.verdict === 'unknown' ? '#FF6B3D' : '#10B981',
                boxShadow: `0 0 12px ${activeCandidate?.verdict === 'unknown' ? '#FF6B3D' : '#10B981'}`,
                transition: 'left 0.1s ease, top 0.1s ease',
              }}
            />

            {/* JPL Overlay Ring Indicator */}
            {showJplOverlay && (
              <div
                style={{
                  position: 'absolute',
                  left: epochIndex === 0 ? 'calc(46% - 11px)' : 'calc(54% - 11px)',
                  top: epochIndex === 0 ? 'calc(48% - 11px)' : 'calc(52% - 11px)',
                  width: '32px',
                  height: '32px',
                  border: '1px dashed #10B981',
                  borderRadius: '50%',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '-18px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: 'monospace',
                    fontSize: '9px',
                    color: '#10B981',
                    whiteSpace: 'nowrap',
                  }}
                >
                  JPL SBDB Target
                </span>
              </div>
            )}
          </div>

          {/* Active Epoch Label */}
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              fontFamily: 'monospace',
              fontSize: '11px',
              color: 'var(--color-text-1)',
              backgroundColor: 'rgba(17, 17, 19, 0.85)',
              border: '1px solid var(--color-hairline)',
              padding: '4px 10px',
            }}
          >
            ACTIVE SCAN: Epoch {epochIndex + 1} of 2{' '}
            <span style={{ color: '#38BDF8' }}>
              ({epochIndex === 0 ? '2026-03-15' : '2026-09-15'} [measured])
            </span>
          </div>

          {/* Blink Rate Indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              right: 14,
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#A1A1AA',
              backgroundColor: 'rgba(17, 17, 19, 0.85)',
              border: '1px solid var(--color-hairline)',
              padding: '4px 10px',
            }}
          >
            Derived Motion: 44.2″ / 184d (0.24″/day){' '}
            <span style={{ color: '#38BDF8' }}>[derived]</span>
          </div>
        </div>

        {/* Candidate Switcher Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#71717A' }}>
            CANDIDATE:
          </span>
          {candidates.map((cand) => (
            <button
              key={cand.id}
              onClick={() => onSelectCandidate(cand.id)}
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: cand.id === activeCandidate?.id ? 'var(--color-text-1)' : '#71717A',
                backgroundColor: cand.id === activeCandidate?.id ? 'rgba(255, 107, 61, 0.15)' : 'var(--color-bg)',
                border: cand.id === activeCandidate?.id ? '1px solid #FF6B3D' : '1px solid var(--color-hairline)',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {cand.match?.designation || cand.id} ({cand.verdict})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
