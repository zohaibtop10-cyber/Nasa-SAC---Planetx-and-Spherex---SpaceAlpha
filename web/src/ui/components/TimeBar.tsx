/**
 * TimeBar.tsx
 * Bottom-docked timeline slider component for 3D orbital simulation.
 *
 * Implements:
 * 1. Fixed bottom bar with <input type="range"> slider representing 0 to 365 days.
 * 2. Floating "simulated date" indicator positioned directly above the slider handle.
 * 3. Play / Pause / Step animation controls with variable speeds (1x, 2x, 5x, 10x).
 * 4. Rule 1 Non-Negotiable: Every displayed number carries an epistemic badge ([assumed], [derived], [measured]).
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useWorkspaceStore } from '../../data/workspaceStore';

export interface TimeBarProps {
  sliderDay?: number; // 0 to 365 days
  onChangeDay?: (day: number) => void;
  // Backward compatibility with timeEpochRatio (0.0 to 1.0)
  timeEpochRatio?: number;
  onChangeTimeRatio?: (ratio: number | ((prev: number) => number)) => void;
  baseDateIso?: string; // e.g. "2026-01-01T00:00:00Z"
  activeObjectName?: string;
  onReset?: () => void;
}

export const TimeBar: React.FC<TimeBarProps> = ({
  sliderDay: propSliderDay,
  onChangeDay,
  timeEpochRatio = 0.0,
  onChangeTimeRatio,
  baseDateIso = '2026-01-01T00:00:00Z',
  activeObjectName,
  onReset,
}) => {
  // Normalize sliderDay: support either sliderDay (0-365) or timeEpochRatio (0-1)
  const currentDay = propSliderDay !== undefined ? propSliderDay : timeEpochRatio * 365;

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 5x, 10x
  const animRef = useRef<number | null>(null);

  const updateDay = (newDay: number) => {
    const clamped = Math.max(0, Math.min(365, newDay));
    if (onChangeDay) {
      onChangeDay(clamped);
    }
    if (onChangeTimeRatio) {
      onChangeTimeRatio(clamped / 365);
    }
    useWorkspaceStore.getState().setTimeEpochRatio(clamped / 365);
  };

  // Playback loop using requestAnimationFrame for 60fps smooth scrubbing
  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // At 1x: 1 real second = 15 simulated days
      const daysDelta = dt * 15 * playbackSpeed;

      const nextDay = currentDay + daysDelta;
      if (nextDay >= 365) {
        updateDay(365);
        setIsPlaying(false);
      } else {
        updateDay(nextDay);
        animRef.current = requestAnimationFrame(loop);
      }
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, currentDay, playbackSpeed]);

  // Compute simulated date string based on currentDay
  const { simulatedDateStr, dayOfYearInt } = useMemo(() => {
    const base = new Date(baseDateIso);
    const target = new Date(base.getTime() + currentDay * 24 * 60 * 60 * 1000);
    const dateFormatted = target.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return {
      simulatedDateStr: dateFormatted,
      dayOfYearInt: Math.round(currentDay),
    };
  }, [baseDateIso, currentDay]);

  // Handle position percentage for tooltip directly above slider thumb
  const sliderPercentage = Math.min(96, Math.max(4, (currentDay / 365) * 100));

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '80px',
        backgroundColor: 'rgba(10, 10, 11, 0.94)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--color-hairline)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 24px',
        zIndex: 40,
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
        userSelect: 'none',
      }}
      aria-label="Orbit Timeline Controls"
    >
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '20px' }}>
        {/* Playback Controls & Speed Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              fontWeight: 700,
              color: isPlaying ? '#000000' : '#EDEDED',
              backgroundColor: isPlaying ? '#FF6B3D' : '#111113',
              border: isPlaying ? '1px solid #FF6B3D' : '1px solid #26262A',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            title={isPlaying ? 'Pause orbital timeline' : 'Play orbital timeline'}
          >
            <span>{isPlaying ? '⏸' : '▶'}</span>
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          {/* Step Backward (-5 days) */}
          <button
            onClick={() => updateDay(currentDay - 5)}
            disabled={currentDay <= 0}
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#EDEDED',
              backgroundColor: '#111113',
              border: '1px solid #26262A',
              padding: '6px 9px',
              borderRadius: '6px',
              cursor: currentDay <= 0 ? 'not-allowed' : 'pointer',
              opacity: currentDay <= 0 ? 0.4 : 1,
            }}
            title="Step backward 5 days"
          >
            -5d
          </button>

          {/* Step Forward (+5 days) */}
          <button
            onClick={() => updateDay(currentDay + 5)}
            disabled={currentDay >= 365}
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#EDEDED',
              backgroundColor: '#111113',
              border: '1px solid #26262A',
              padding: '6px 9px',
              borderRadius: '6px',
              cursor: currentDay >= 365 ? 'not-allowed' : 'pointer',
              opacity: currentDay >= 365 ? 0.4 : 1,
            }}
            title="Step forward 5 days"
          >
            +5d
          </button>

          {/* Speed Toggle */}
          <button
            onClick={() => {
              const speeds = [1, 2, 5, 10];
              const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
              setPlaybackSpeed(speeds[nextIdx]);
            }}
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#38BDF8',
              backgroundColor: '#111113',
              border: '1px solid #26262A',
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            title="Toggle playback speed"
          >
            {playbackSpeed}x
          </button>

          {/* Reset button */}
          <button
            onClick={() => {
              updateDay(0);
              setIsPlaying(false);
              if (onReset) onReset();
            }}
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#71717A',
              backgroundColor: '#111113',
              border: '1px solid #26262A',
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            title="Reset to Day 0"
          >
            RESET
          </button>
        </div>

        {/* Center: Slider with Dynamic Floating Date Handle */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Floating Simulated Date Tooltip directly above the slider thumb */}
          <div
            style={{
              position: 'absolute',
              top: '-28px',
              left: `${sliderPercentage}%`,
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                backgroundColor: '#111113',
                border: '1px solid #FF6B3D',
                borderRadius: '4px',
                padding: '2px 8px',
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#EDEDED',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              }}
            >
              <span style={{ color: '#FF6B3D', fontWeight: 700 }}>
                {simulatedDateStr}
              </span>
              <span style={{ color: '#71717A' }}>|</span>
              <span style={{ color: '#A1A1AA' }}>
                Day {dayOfYearInt} <span style={{ color: '#FF6B3D' }}>[assumed]</span>
              </span>
            </div>
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '4px solid #FF6B3D',
                marginTop: '-1px',
              }}
            />
          </div>

          {/* Track Labels */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#71717A',
            }}
          >
            <span>
              DAY 0: 2026-01-01 <span style={{ color: '#38BDF8' }}>[measured]</span>
            </span>

            <span style={{ color: '#EDEDED' }}>
              {activeObjectName ? (
                <>
                  ORBIT INTERPOLATION: <strong style={{ color: '#FF6B3D' }}>{activeObjectName}</strong> (36 sample points{' '}
                  <span style={{ color: '#FF6B3D' }}>[assumed]</span>)
                </>
              ) : (
                <>
                  TIMELINE: 365-Day Solar Cycle <span style={{ color: '#FF6B3D' }}>[assumed]</span>
                </>
              )}
            </span>

            <span>
              DAY 365: 2026-12-31 <span style={{ color: '#38BDF8' }}>[measured]</span>
            </span>
          </div>

          {/* Native HTML range input slider */}
          <input
            type="range"
            min="0"
            max="365"
            step="0.5"
            value={currentDay}
            onChange={(e) => updateDay(parseFloat(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#FF6B3D',
              cursor: 'pointer',
              height: '6px',
              borderRadius: '3px',
              background: '#26262A',
            }}
          />
        </div>

        {/* Right: Telemetry & Monitored Points Badge */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            fontFamily: 'monospace',
            fontSize: '11px',
            flexShrink: 0,
          }}
        >
          <div style={{ color: '#71717A' }}>
            ORBIT PROGRESS <span style={{ color: '#38BDF8' }}>[derived]</span>
          </div>
          <div style={{ color: '#38BDF8', fontWeight: 600, fontSize: '13px' }}>
            {((currentDay / 365) * 100).toFixed(1)}% / 365d
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeBar;
