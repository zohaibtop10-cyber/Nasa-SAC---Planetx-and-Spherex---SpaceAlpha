import React, { useEffect, useState } from 'react';

interface TimeBarProps {
  timeEpochRatio: number; // 0.0 to 1.0
  onChangeTimeRatio: (ratio: number | ((prev: number) => number)) => void;
  minDateIso?: string;
  maxDateIso?: string;
}

export const TimeBar: React.FC<TimeBarProps> = ({
  timeEpochRatio,
  onChangeTimeRatio,
  minDateIso = '2026-03-15T08:00:00Z',
  maxDateIso = '2026-09-15T08:00:00Z',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      onChangeTimeRatio((prev: number) => {
        if (prev >= 1.0) {
          setIsPlaying(false);
          return 1.0;
        }
        return Math.min(1.0, prev + 0.015);
      });
    }, 60);

    return () => clearInterval(interval);
  }, [isPlaying, onChangeTimeRatio]);

  // Derived parallax baseline calculation (in days)
  const totalDays = 184; // ~6 months
  const currentDays = Math.round(timeEpochRatio * totalDays);
  // Distance uncertainty shrinkage demonstration:
  const baselineSpanAu = (1.0 + timeEpochRatio * 1.0).toFixed(2); // 1.0 to 2.0 AU
  const marginPercentage = Math.round((1.0 - 0.45 * timeEpochRatio) * 100);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '68px',
        backgroundColor: 'rgba(17, 17, 19, 0.94)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--color-hairline)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 40,
      }}
    >
      {/* Play/Pause & Step Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-text-1)',
            backgroundColor: isPlaying ? 'rgba(255, 107, 61, 0.2)' : 'var(--color-surface)',
            border: isPlaying ? '1px solid #FF6B3D' : '1px solid var(--color-hairline)',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>

        <button
          onClick={() => onChangeTimeRatio(Math.max(0, timeEpochRatio - 0.1))}
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--color-text-1)',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            padding: '6px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          title="Step backward"
        >
          &lt;
        </button>

        <button
          onClick={() => onChangeTimeRatio(Math.min(1.0, timeEpochRatio + 0.1))}
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--color-text-1)',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            padding: '6px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          title="Step forward"
        >
          &gt;
        </button>
      </div>

      {/* Main Slider & Dates */}
      <div style={{ flex: 1, margin: '0 28px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '11px' }}>
          <span style={{ color: '#71717A' }}>
            SCAN 1: {minDateIso.slice(0, 10)} <span style={{ color: '#38BDF8' }}>[measured]</span>
          </span>
          <span style={{ color: '#EDEDED', fontWeight: 600 }}>
            SURVEY CADENCE: +{currentDays}d ({baselineSpanAu} AU Earth Baseline){' '}
            <span style={{ color: '#38BDF8' }}>[derived]</span>
          </span>
          <span style={{ color: '#71717A' }}>
            SCAN 2: {maxDateIso.slice(0, 10)} <span style={{ color: '#38BDF8' }}>[measured]</span>
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="1"
          step="0.005"
          value={timeEpochRatio}
          onChange={(e) => onChangeTimeRatio(parseFloat(e.target.value))}
          style={{
            width: '100%',
            accentColor: '#FF6B3D',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Parallax Margin of Error Indicator */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          fontFamily: 'monospace',
          fontSize: '11px',
        }}
      >
        <span style={{ color: '#71717A' }}>
          PARALLAX ERROR MARGIN <span style={{ color: '#38BDF8' }}>[derived]</span>
        </span>
        <span style={{ color: '#FF6B3D', fontWeight: 600, fontSize: '13px' }}>
          {marginPercentage}% span (shrinking)
        </span>
      </div>
    </div>
  );
};
