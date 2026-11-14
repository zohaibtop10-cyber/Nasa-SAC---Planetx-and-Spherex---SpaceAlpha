import {
  Candidate,
  CandidatesPayload,
  FieldsPayload,
  Release,
  ReleasesPayload,
  TargetField,
} from './types';

// In-memory Promise cache mapping resolved URL to in-flight or completed fetch promise
const memoryCache = new Map<string, Promise<unknown>>();

export interface LoaderOptions {
  baseUrl?: string;
  forceRefresh?: boolean;
}

const DEFAULT_BASE_URL = '/data';

function resolveUrl(filename: string, baseUrl: string = DEFAULT_BASE_URL): string {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const cleanFile = filename.trim().replace(/^\/+/, '');
  return `${cleanBase}/${cleanFile}`;
}

async function fetchWithCache<T>(
  filename: string,
  options?: LoaderOptions,
  extractor?: (raw: unknown) => T
): Promise<T> {
  const url = resolveUrl(filename, options?.baseUrl);

  if (options?.forceRefresh) {
    memoryCache.delete(url);
  }

  const cached = memoryCache.get(url);
  if (cached) {
    return cached as Promise<T>;
  }

  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch '${url}': HTTP ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (extractor) {
      return extractor(data);
    }
    return data as T;
  })().catch((err) => {
    // Evict failed requests so subsequent calls can retry
    memoryCache.delete(url);
    throw err;
  });

  memoryCache.set(url, promise);
  return promise;
}

/**
 * Loads target sky fields from fields.json. Fetches once and caches in memory.
 */
export async function loadFields(options?: LoaderOptions): Promise<TargetField[]> {
  return fetchWithCache<TargetField[]>('fields.json', options, (raw) => {
    if (raw && typeof raw === 'object' && 'fields' in raw && Array.isArray((raw as FieldsPayload).fields)) {
      return (raw as FieldsPayload).fields;
    }
    if (Array.isArray(raw)) {
      return raw as TargetField[];
    }
    throw new Error("Invalid format in fields.json: expected object with 'fields' array or direct array.");
  });
}

/**
 * Loads mover candidates from candidates.json. Fetches once and caches in memory.
 */
export async function loadCandidates(options?: LoaderOptions): Promise<Candidate[]> {
  return fetchWithCache<Candidate[]>('candidates.json', options, (raw) => {
    if (raw && typeof raw === 'object' && 'candidates' in raw && Array.isArray((raw as CandidatesPayload).candidates)) {
      return (raw as CandidatesPayload).candidates;
    }
    if (Array.isArray(raw)) {
      return raw as Candidate[];
    }
    throw new Error("Invalid format in candidates.json: expected object with 'candidates' array or direct array.");
  });
}

/**
 * Loads weekly pipeline release history from releases.json. Fetches once and caches in memory.
 */
export async function loadReleases(options?: LoaderOptions): Promise<Release[]> {
  return fetchWithCache<Release[]>('releases.json', options, (raw) => {
    if (raw && typeof raw === 'object' && 'releases' in raw && Array.isArray((raw as ReleasesPayload).releases)) {
      return (raw as ReleasesPayload).releases;
    }
    if (Array.isArray(raw)) {
      return raw as Release[];
    }
    throw new Error("Invalid format in releases.json: expected object with 'releases' array or direct array.");
  });
}

/**
 * Clears the in-memory cache.
 */
export function clearDataCache(): void {
  memoryCache.clear();
}
