import React, { useState } from 'react';
import { TestCanvas } from '../scene/TestCanvas';

interface TokenItem {
  varName: string;
  hex: string;
  role: string;
}

const TOKENS: TokenItem[] = [
  { varName: '--color-bg', hex: '#0A0A0B', role: 'Main Background' },
  { varName: '--color-surface', hex: '#111113', role: 'Panel Surface' },
  { varName: '--color-hairline', hex: '#26262A', role: '1px Hairline Border' },
  { varName: '--color-text-1', hex: '#EDEDED', role: 'Primary Typography' },
  { varName: '--color-text-2', hex: '#8E8E93', role: 'Secondary Typography' },
  { varName: '--color-accent', hex: '#FF6B3D', role: 'Unknown Mover Accent' },
  { varName: '--color-canvas', hex: '#050506', role: '3D WebGL Canvas' },
];

export const TokenDemo: React.FC = () => {
  const [sliderVal, setSliderVal] = useState(42);
  const [inputValue, setInputValue] = useState('08h 55m 10.83s');

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <header style={{ marginBottom: '32px', borderBottom: '1px solid var(--color-hairline)', paddingBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-1)' }}>
            Live Sky · Clean Studio Tokens & Architecture Specimen
          </h1>
          <span className="tag-badge accent">NASA Space Apps 2026</span>
        </div>
        <p style={{ color: 'var(--color-text-2)', fontSize: '13px' }}>
          Design contract verification: 1px hairline borders only, 0 shadows, 0 gradients, 0px radius for panels, 6px radius for controls.
        </p>
      </header>

      {/* Grid Layout: Tokens + 3D Specimen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        {/* Color Tokens Panel (0px radius) */}
        <section className="panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-2)' }}>
              Palette Tokens
            </h2>
            <span className="tag-badge">Panel [0px radius]</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {TOKENS.map((token) => (
              <div
                key={token.varName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-hairline)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: token.hex,
                      border: '1px solid var(--color-hairline)',
                    }}
                  />
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 500 }}>
                      {token.varName}
                    </span>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-2)' }}>{token.role}</div>
                  </div>
                </div>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: token.hex === '#050506' || token.hex === '#0A0A0B' ? 'var(--color-text-2)' : token.hex }}>
                  {token.hex}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* 3D WebGL Canvas Panel */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-2)' }}>
              Three.js Viewport
            </h2>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-2)' }}>
              ClearColor: #050506
            </span>
          </div>
          <div style={{ flex: 1, minHeight: '300px' }}>
            <TestCanvas />
          </div>
        </section>
      </div>

      {/* Controls & Epistemic Badges Panel */}
      <section className="panel" style={{ padding: '24px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-2)' }}>
            Controls & Epistemic Label System
          </h2>
          <span className="tag-badge">Controls [6px radius]</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          {/* Text Input Control */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-2)', marginBottom: '6px' }}>
              Coordinate Lookup (RA) <span className="tag-badge">measured</span>
            </label>
            <input
              type="text"
              className="control"
              style={{ width: '100%' }}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </div>

          {/* Time Bar Slider Control */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-2)', marginBottom: '6px' }}>
              Time Bar Epoch (Day {sliderVal}) <span className="tag-badge">derived</span>
            </label>
            <input
              type="range"
              min="1"
              max="180"
              value={sliderVal}
              onChange={(e) => setSliderVal(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-accent)' }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button className="control accent" style={{ flex: 1 }}>
              Triage Mover
            </button>
            <button className="control" style={{ flex: 1 }}>
              Inspect FITS
            </button>
          </div>
        </div>

        {/* Epistemic Label Specimen Row */}
        <div style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-2)' }}>Non-Negotiable Tags:</span>
          <span className="tag-badge">measured: 133.795°</span>
          <span className="tag-badge">derived: 45 - 180 AU</span>
          <span className="tag-badge">assumed: 2.0 AU Baseline</span>
          <span className="tag-badge accent">3D Model [Illustrative]</span>
          <span className="tag-badge">Dataset [Simulated]</span>
        </div>
      </section>
    </div>
  );
};
