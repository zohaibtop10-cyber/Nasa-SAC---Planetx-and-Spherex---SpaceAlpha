/**
 * NumberChip.tsx - Epistemic Numeric Badge Component
 *
 * Implements strict Non-Negotiable Rule 1:
 * "Every displayed number MUST have a label: measured, derived, or assumed."
 *
 * Border styles:
 * - Measured: Solid border
 * - Derived: Dashed border
 * - Assumed: Dotted border
 */

import React from 'react';
import { LabelType } from '../../data/types';

interface NumberChipProps {
  value: number | string;
  label: LabelType;
  unit?: string;
  prefix?: string;
  precision?: number;
  compact?: boolean;
}

export const NumberChip: React.FC<NumberChipProps> = ({
  value,
  label,
  unit,
  prefix,
  precision = 2,
  compact = false,
}) => {
  // Format numeric values cleanly
  let formattedValue: string;
  if (typeof value === 'number') {
    formattedValue = Number.isInteger(value) ? value.toString() : value.toFixed(precision);
  } else {
    formattedValue = value;
  }

  // Border and color specifications per epistemic status
  let borderStyle = 'solid';
  let borderColor = '#38BDF8'; // Cyan for Measured
  let labelColor = '#38BDF8';
  let bgTint = 'rgba(56, 189, 248, 0.08)';

  if (label === 'measured') {
    borderStyle = 'solid';
    borderColor = '#38BDF8';
    labelColor = '#38BDF8';
    bgTint = 'rgba(56, 189, 248, 0.08)';
  } else if (label === 'derived') {
    borderStyle = 'dashed';
    borderColor = '#F59E0B'; // Amber for Derived
    labelColor = '#F59E0B';
    bgTint = 'rgba(245, 158, 11, 0.08)';
  } else if (label === 'assumed') {
    borderStyle = 'dotted';
    borderColor = '#FF6B3D'; // Accent orange for Assumed
    labelColor = '#FF6B3D';
    bgTint = 'rgba(255, 107, 61, 0.08)';
  }

  return (
    <span
      className={`number-chip number-chip-${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '4px' : '6px',
        padding: compact ? '1px 6px' : '2px 8px',
        backgroundColor: bgTint,
        borderWidth: '1px',
        borderStyle: borderStyle,
        borderColor: borderColor,
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: compact ? '10px' : '11px',
        color: 'var(--color-text-1)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      title={`Epistemic Classification: ${label.toUpperCase()} (${borderStyle} border)`}
    >
      {prefix && <span style={{ color: '#71717A' }}>{prefix}</span>}
      <strong style={{ fontWeight: 600, color: '#EDEDED' }}>{formattedValue}</strong>
      {unit && <span style={{ color: '#A1A1AA', fontSize: compact ? '9px' : '10px' }}>{unit}</span>}
      <span
        style={{
          color: labelColor,
          fontSize: compact ? '9px' : '10px',
          fontWeight: 700,
          textTransform: 'lowercase',
        }}
      >
        [{label}]
      </span>
    </span>
  );
};
