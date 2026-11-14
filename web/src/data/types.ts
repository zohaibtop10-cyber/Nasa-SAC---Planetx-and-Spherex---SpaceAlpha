/**
 * TypeScript Data Contracts for Live Sky
 * Strictly matches JSON schemas in data/schemas/ (fields.json, candidates.json, releases.json)
 */

export type LabelType = 'measured' | 'derived' | 'assumed';

export type Verdict =
  | 'artifact'
  | 'known_object'
  | 'known_asteroid'
  | 'high_motion_star'
  | 'fast_moving_star'
  | 'unknown';

export interface ReasonStep {
  rule: string;
  passed: boolean;
  detail: string;
}

export type ReasonItem = string | ReasonStep;

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

export interface ScanRangeStep {
  scan_index: number;
  min_au: number;
  max_au: number;
}

export interface DistanceRange {
  min_au: number;
  max_au: number;
  assumption: string;
  scan_ranges?: ScanRangeStep[];
}

export interface Candidate {
  id: string;
  field_id: string;
  release_batch: string;
  positions: Position[];
  verdict: Verdict;
  reason_chain: ReasonItem[];
  confidence: number;
  match: MatchDetails | null;
  distance_range: DistanceRange | null;
  colour_index: number | null;
  simulated?: boolean;
  labels: Record<string, LabelType>;
}

export interface CandidatesPayload {
  candidates: Candidate[];
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
  candidate_count?: number;
  description?: string;
  target_type?: string;
  scans: Scan[];
  labels: Record<string, LabelType>;
}

export type Field = TargetField;

export interface FieldsPayload {
  fields: TargetField[];
}

export interface ReleaseCounts {
  total: number;
  known_object: number;
  high_motion_star: number;
  artifact: number;
  unknown: number;
}

export interface Release {
  release_batch: string;
  published_at: string;
  pipeline_version: string;
  fields_processed: string[];
  candidate_counts: ReleaseCounts;
  notes?: string;
  labels: Record<string, LabelType>;
}

export interface ReleasesPayload {
  releases: Release[];
}
