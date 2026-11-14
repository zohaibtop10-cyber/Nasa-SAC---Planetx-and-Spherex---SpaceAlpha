import React from 'react';
import { Field } from '../../data/types';

interface HeaderProps {
  fields: Field[];
  selectedFieldId: string;
  onSelectField: (fieldId: string) => void;
  activeTab: '3d' | 'blink' | 'validation' | 'gallery';
  onChangeTab: (tab: '3d' | 'blink' | 'validation' | 'gallery') => void;
  latestRelease?: string;
}

export const Header: React.FC<HeaderProps> = ({
  fields,
  selectedFieldId,
  onSelectField,
  activeTab,
  onChangeTab,
  latestRelease,
}) => {
  return (
    <header
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '56px',
        backgroundColor: 'rgba(17, 17, 19, 0.92)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--color-hairline)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 50,
      }}
    >
      {/* Brand & Mission Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: '15px',
              letterSpacing: '1px',
              color: 'var(--color-text-1)',
            }}
          >
            LIVE SKY
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#888899',
            }}
          >
            NASA SPHEREx 3D Survey
          </span>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '2px 8px',
            borderRadius: '6px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
            }}
          />
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#10B981' }}>
            {latestRelease ? `${latestRelease} LIVE` : 'QR2 LIVE'}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => onChangeTab('3d')}
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: activeTab === '3d' ? 'var(--color-text-1)' : '#71717A',
            backgroundColor: activeTab === '3d' ? 'var(--color-surface)' : 'transparent',
            border: activeTab === '3d' ? '1px solid var(--color-hairline)' : '1px solid transparent',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          3D Solar System
        </button>

        <button
          onClick={() => onChangeTab('blink')}
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: activeTab === 'blink' ? 'var(--color-text-1)' : '#71717A',
            backgroundColor: activeTab === 'blink' ? 'var(--color-surface)' : 'transparent',
            border: activeTab === 'blink' ? '1px solid var(--color-hairline)' : '1px solid transparent',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          2D Sky Blink
        </button>

        <button
          onClick={() => onChangeTab('validation')}
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: activeTab === 'validation' ? 'var(--color-text-1)' : '#71717A',
            backgroundColor: activeTab === 'validation' ? 'var(--color-surface)' : 'transparent',
            border: activeTab === 'validation' ? '1px solid var(--color-hairline)' : '1px solid transparent',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Compliance &amp; Audit
        </button>

        <button
          onClick={() => onChangeTab('gallery')}
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: activeTab === 'gallery' ? 'var(--color-text-1)' : '#71717A',
            backgroundColor: activeTab === 'gallery' ? 'var(--color-surface)' : 'transparent',
            border: activeTab === 'gallery' ? '1px solid var(--color-accent)' : '1px solid transparent',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Model Gallery
        </button>
      </nav>

      {/* Field Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#71717A' }}>
          FIELD:
        </span>
        <select
          value={selectedFieldId}
          onChange={(e) => onSelectField(e.target.value)}
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--color-text-1)',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            padding: '4px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} {f.candidate_count !== undefined ? `(${f.candidate_count} candidates)` : ''}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
};
