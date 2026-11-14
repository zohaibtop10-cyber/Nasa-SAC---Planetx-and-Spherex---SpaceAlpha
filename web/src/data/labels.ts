import { Candidate, LabelType } from './types';

/**
 * Typed error thrown whenever a numeric value displayed in the UI lacks
 * an explicit epistemic classification ('measured', 'derived', or 'assumed').
 */
export class MissingLabelError extends Error {
  public readonly candidateId: string;
  public readonly missingKey: string;

  constructor(candidateId: string, missingKey: string, message?: string) {
    super(
      message ??
        `Non-negotiable violation: displayed number '${missingKey}' on candidate '${candidateId}' has no valid epistemic label (measured, derived, or assumed).`
    );
    this.name = 'MissingLabelError';
    this.candidateId = candidateId;
    this.missingKey = missingKey;
    Object.setPrototypeOf(this, MissingLabelError.prototype);
  }
}

const ALLOWED_LABELS: ReadonlySet<string> = new Set(['measured', 'derived', 'assumed']);

/**
 * Retrieves the non-negotiable label ('measured', 'derived', 'assumed') for a displayed number.
 *
 * @param candidate The candidate object containing the labels map.
 * @param key The key or field path representing the displayed number.
 * @returns 'measured' | 'derived' | 'assumed'
 * @throws MissingLabelError if the key or a valid alias is absent from the labels map.
 */
export function labelFor(candidate: Candidate, key: string): LabelType {
  if (!candidate || !candidate.labels || typeof candidate.labels !== 'object') {
    throw new MissingLabelError(candidate?.id ?? '<unknown>', key, `Candidate has no labels map.`);
  }

  // 1. Direct key lookup
  if (key in candidate.labels) {
    const directVal = candidate.labels[key];
    if (ALLOWED_LABELS.has(directVal)) {
      return directVal as LabelType;
    }
  }

  // 2. Normalized aliases
  const aliasMap: Record<string, string[]> = {
    'positions': ['positions.ra', 'positions.dec', 'positions.err'],
    'positions.ra': ['positions'],
    'positions.dec': ['positions'],
    'positions.err': ['positions'],
    'distance_min_au': ['distance_range.min_au', 'distance_range'],
    'distance_range.min_au': ['distance_min_au', 'distance_range'],
    'distance_max_au': ['distance_range.max_au', 'distance_range'],
    'distance_range.max_au': ['distance_max_au', 'distance_range'],
    'distance_range': ['distance_min_au', 'distance_range.min_au'],
    'separation_arcsec': ['match.separation_arcsec', 'match'],
    'match.separation_arcsec': ['separation_arcsec', 'match'],
  };

  const aliases = aliasMap[key] ?? [];
  for (const alias of aliases) {
    if (alias in candidate.labels) {
      const aliasVal = candidate.labels[alias];
      if (ALLOWED_LABELS.has(aliasVal)) {
        return aliasVal as LabelType;
      }
    }
  }

  // 3. Positional array index fallback (e.g. positions[0].ra -> positions.ra -> positions)
  if (key.startsWith('positions[')) {
    const parts = key.split('.');
    if (parts.length > 1) {
      const prop = parts[1]; // e.g. 'ra', 'dec', 'err'
      const posKey = `positions.${prop}`;
      if (posKey in candidate.labels && ALLOWED_LABELS.has(candidate.labels[posKey])) {
        return candidate.labels[posKey] as LabelType;
      }
    }
    if ('positions' in candidate.labels && ALLOWED_LABELS.has(candidate.labels['positions'])) {
      return candidate.labels['positions'] as LabelType;
    }
  }

  throw new MissingLabelError(candidate.id, key);
}
