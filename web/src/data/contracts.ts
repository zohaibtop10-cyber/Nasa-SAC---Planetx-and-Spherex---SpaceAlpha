/**
 * TypeScript Data Contracts for Live Sky
 * Strictly matches JSON schemas in data/schemas/
 */

export type LabelType = 'measured' | 'derived' | 'assumed';

export type Verdict = 'artifact' | 'known_object' | 'high_motion_star' | 'unknown';

export interface Position {
  time: string;
  ra: number;
  dec: number;
  err: number;
}

export interface MatchDetails {
  catalog?: string;
  designation?: string;
  separation_arcsec?: number;
  [key: string]: unknown;
}

export interface DistanceRange {
  min_au: number;
  max_au: number;
  assumption: string;
}

export interface Candidate {
  id: string;
  field_id: string;
  release_batch: string;
  positions: Position[];
  verdict: Verdict;
  reason_chain: string[];
  confidence: number;
  match: MatchDetails | null;
  distance_range: DistanceRange | null;
  colour_index: number | null;
  simulated?: boolean;
  labels: Record<string, LabelType>;
}

export interface Scan {
  scan_id: string;
  epoch_utc: string;
  mjd?: number;
  fits_url?: string;
}

export interface TargetField {
  id: string;
  name: string;
  ra_deg: number;
  dec_deg: number;
  fov_deg: number;
  description?: string;
  target_type?: string;
  scans: Scan[];
  labels: Record<string, LabelType>;
}
