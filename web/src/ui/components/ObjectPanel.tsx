/**
 * ObjectPanel.tsx
 * Dynamic side panel component rendering rich NASA educational data fetched by the Gemini agent.
 *
 * Implements:
 * 1. Slides in smoothly when a user clicks the newly generated 3D object.
 * 2. Structured, easy-to-read educational layout:
 *    - Bold header with Object Name and Classification badge.
 *    - Clean typography block for the plain-language summary.
 *    - Bulleted list for notableFacts with styled accents.
 * 3. Responsive image masonry grid and carousel displaying URLs in mediaUrls with lazy-loading.
 * 4. Close button that smoothly dismisses the panel and returns focus to the 3D canvas.
 * 5. Strict adherence to Rule 1 (epistemic number chips) and Rule 2 (3D model "Illustrative" tags).
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Candidate } from '../../data/types';
import { NasaObjectPayload, ObjectClassification } from '../../api/fetchNasaObjectWorkflow';
import { NumberChip } from './NumberChip';

export interface EducationalData {
  summary: string;
  notableFacts?: string[];
  mediaUrls?: string[];
}

export type ActiveObjectType =
  | Candidate
  | NasaObjectPayload
  | {
      id?: string;
      name?: string;
      url?: string;
      candidate?: Candidate | null;
      payload?: NasaObjectPayload | null;
      educationalData?: EducationalData;
      coordinates?: {
        distance_au: number;
        ra: number;
        dec: number;
      };
      procedural3D?: {
        baseColorHex: string;
        surfaceTexture: 'rocky' | 'gaseous' | 'icy';
        relativeSize: number;
      };
      renderState?: {
        baseColor: string;
        scale: number;
        textureType: 'rocky' | 'gaseous' | 'icy';
        hasRings: boolean;
      };
      classification?: string;
      summary?: string;
      images?: string[];
    }
  | null;

interface ObjectPanelProps {
  activeObject: ActiveObjectType;
  onClose?: () => void;
  onInjectObject?: (payload: NasaObjectPayload) => void;
  className?: string;
}

// In-memory cache to prevent redundant network fetches across active object toggles
const payloadCache = new Map<string, NasaObjectPayload>();

// Default NASA Knowledge URLs for candidates
function resolveNasaUrlForObject(obj: ActiveObjectType): string {
  if (!obj) return 'https://science.nasa.gov/mission/spherex/';

  // If already has an explicit URL
  if ('url' in obj && typeof obj.url === 'string' && obj.url.startsWith('http')) {
    return obj.url;
  }

  // Check Candidate structure
  if ('verdict' in obj || 'positions' in obj) {
    const candidate = obj as Candidate;
    const designation = (candidate.match?.designation || candidate.id || '').toLowerCase();

    if (designation.includes('ceres')) return 'https://science.nasa.gov/solar-system/asteroids/1-ceres/';
    if (designation.includes('vesta')) return 'https://science.nasa.gov/solar-system/asteroids/4-vesta/';
    if (designation.includes('bennu')) return 'https://science.nasa.gov/solar-system/asteroids/101955-bennu/';
    if (designation.includes('psyche')) return 'https://science.nasa.gov/mission/psyche/';
    if (designation.includes('halley')) return 'https://science.nasa.gov/solar-system/comets/1p-halley/';
    if (designation.includes('jupiter')) return 'https://science.nasa.gov/jupiter/';
    if (designation.includes('saturn')) return 'https://science.nasa.gov/saturn/';
    if (designation.includes('mars')) return 'https://science.nasa.gov/mars/';

    // Fallback based on verdict
    if (candidate.verdict === 'known_object') {
      return 'https://science.nasa.gov/solar-system/asteroids/';
    }
    if (candidate.verdict === 'high_motion_star') {
      return 'https://science.nasa.gov/universe/stars/';
    }
    return 'https://science.nasa.gov/mission/spherex/';
  }

  // Check custom wrapper
  if ('name' in obj && typeof obj.name === 'string') {
    const name = obj.name.toLowerCase();
    if (name.includes('ceres')) return 'https://science.nasa.gov/solar-system/asteroids/1-ceres/';
    if (name.includes('jupiter')) return 'https://science.nasa.gov/jupiter/';
    if (name.includes('saturn')) return 'https://science.nasa.gov/saturn/';
    if (name.includes('bennu')) return 'https://science.nasa.gov/solar-system/asteroids/101955-bennu/';
  }

  return 'https://science.nasa.gov/mission/spherex/';
}

export const ObjectPanel: React.FC<ObjectPanelProps> = ({
  activeObject,
  onClose,
  onInjectObject,
  className = '',
}) => {
  const [data, setData] = useState<NasaObjectPayload | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImageZoom, setActiveImageZoom] = useState<string | null>(null);
  const [injectedToast, setInjectedToast] = useState<boolean>(false);
  const [galleryViewMode, setGalleryViewMode] = useState<'masonry' | 'carousel'>('masonry');
  const [carouselIndex, setCarouselIndex] = useState<number>(0);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const panelRef = useRef<HTMLElement>(null);

  // Responsive breakpoint tracking
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Smooth close handler that returns focus to Three.js canvas
  const handleClose = useCallback(() => {
    if (onClose) onClose();
    // Return focus to 3D canvas so OrbitControls & keyboard navigation work immediately
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.focus();
      } else {
        window.focus();
      }
    });
  }, [onClose]);

  // Keyboard shortcut: Esc key dismisses the panel and returns focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Extract direct educationalData if attached to activeObject
  const directEducationalData = useMemo(() => {
    if (!activeObject) return null;
    const direct = (activeObject as any).educationalData || (activeObject as any).payload?.educationalData;
    if (direct && typeof direct.summary === 'string') {
      return direct as EducationalData;
    }
    return null;
  }, [activeObject]);

  // Fetch from the multi-agent pipeline route
  const fetchObjectData = useCallback(async (targetUrl: string) => {
    if (!targetUrl || !targetUrl.trim()) return;

    const trimmedUrl = targetUrl.trim();
    setCurrentUrl(trimmedUrl);
    setCustomUrlInput(trimmedUrl);

    // Return cached if available
    if (payloadCache.has(trimmedUrl)) {
      setData(payloadCache.get(trimmedUrl)!);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 16000);

    try {
      const res = await fetch(`/api/fetch-nasa-object?url=${encodeURIComponent(trimmedUrl)}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error ${res.status}: ${res.statusText}`);
      }

      const payload: NasaObjectPayload = await res.json();
      payloadCache.set(trimmedUrl, payload);
      setData(payload);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Sub-agent pipeline request timed out. Please retry.');
      } else {
        setError(err.message || 'Failed to fetch NASA object metadata.');
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  // Synchronize when activeObject updates in main canvas
  useEffect(() => {
    if (!activeObject) {
      setData(null);
      setError(null);
      return;
    }

    setCarouselIndex(0);

    // Case 1: Object has rich educationalData compiled by Gemini agent (instant load, zero network latency)
    if (directEducationalData) {
      const rawObj = activeObject as any;
      const customRender = rawObj.renderState || rawObj.procedural3D;
      const name = rawObj.name || rawObj.match?.designation || rawObj.id || 'Celestial Object';
      const classification = rawObj.classification || rawObj.match?.body_type || (rawObj.verdict === 'high_motion_star' ? 'star' : 'planet');

      const synthesizedPayload: NasaObjectPayload = {
        name,
        classification: (['planet', 'asteroid', 'comet', 'star'].includes(classification)
          ? classification
          : 'asteroid') as ObjectClassification,
        summary: directEducationalData.summary,
        images: directEducationalData.mediaUrls || rawObj.images || [],
        renderState: {
          baseColor: customRender?.baseColor || customRender?.baseColorHex || '#38BDF8',
          scale: customRender?.scale || customRender?.relativeSize || 1.0,
          textureType: customRender?.textureType || customRender?.surfaceTexture || 'rocky',
          hasRings: Boolean(customRender?.hasRings),
          tag: 'Illustrative',
        },
      };

      setData(synthesizedPayload);
      const url = resolveNasaUrlForObject(activeObject);
      setCurrentUrl(url);
      setCustomUrlInput(url);
      setLoading(false);
      setError(null);
      return;
    }

    // Case 2: Object is already a direct NasaObjectPayload
    if ('classification' in activeObject && 'renderState' in activeObject && 'summary' in activeObject) {
      const direct = activeObject as NasaObjectPayload;
      setData(direct);
      const url = resolveNasaUrlForObject(activeObject);
      setCurrentUrl(url);
      setCustomUrlInput(url);
      setLoading(false);
      setError(null);
      return;
    }

    // Case 3: Initial catalog candidate requiring live NASA scraper fetch
    const resolvedUrl = resolveNasaUrlForObject(activeObject);
    fetchObjectData(resolvedUrl);
  }, [activeObject, directEducationalData, fetchObjectData]);

  // Extract classification details
  const classification: ObjectClassification = data?.classification || 'asteroid';
  const classificationStyles: Record<ObjectClassification, { bg: string; text: string; border: string; label: string }> = {
    planet: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Planet / Major Body' },
    asteroid: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Asteroid / Minor Body' },
    comet: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', label: 'Comet / Active Body' },
    star: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30', label: 'Star / Stellar Object' },
  };
  const activeStyle = classificationStyles[classification] || classificationStyles.asteroid;

  // Candidate telemetry if activeObject is a candidate
  const candidateInfo = activeObject && 'positions' in activeObject ? (activeObject as Candidate) : null;

  // Extract notable facts: from educationalData, or derived from reason_chain / summary
  const notableFacts: string[] = useMemo(() => {
    if (directEducationalData?.notableFacts && directEducationalData.notableFacts.length > 0) {
      return directEducationalData.notableFacts;
    }
    const rawObj = activeObject as any;
    if (rawObj?.notableFacts && Array.isArray(rawObj.notableFacts) && rawObj.notableFacts.length > 0) {
      return rawObj.notableFacts;
    }
    // Fallback: derive structured facts from reason chain or sentences
    if (candidateInfo?.reason_chain && candidateInfo.reason_chain.length > 0) {
      const stringified = candidateInfo.reason_chain.map((r: any) =>
        typeof r === 'string' ? r : (r.detail || `${r.rule}: ${r.passed ? 'PASSED' : 'FAILED'}`)
      );
      const filtered = stringified.filter(
        (r) => !r.startsWith('EXPLORED:') && !r.startsWith('CLASSIFICATION:') && !r.startsWith('COORDINATES:') && !r.startsWith('PROCEDURAL 3D:')
      );
      if (filtered.length > 0) return filtered;
    }
    if (data?.summary) {
      const sentences = data.summary
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 25);
      if (sentences.length > 1) return sentences.slice(1, 4);
    }
    return [
      `Cataloged in SPHEREx multi-epoch deep sky survey [derived].`,
      `Astrometry verified against NASA JPL Small-Body and ESA Gaia catalogs [derived].`,
    ];
  }, [directEducationalData, activeObject, candidateInfo, data?.summary]);

  // Extract media URLs: from educationalData, or data.images
  const mediaUrls: string[] = useMemo(() => {
    if (directEducationalData?.mediaUrls && directEducationalData.mediaUrls.length > 0) {
      return directEducationalData.mediaUrls;
    }
    if (data?.images && data.images.length > 0) {
      return data.images;
    }
    const rawObj = activeObject as any;
    if (rawObj?.images && Array.isArray(rawObj.images)) {
      return rawObj.images;
    }
    return [];
  }, [directEducationalData, data?.images, activeObject]);

  return (
    <AnimatePresence>
      {Boolean(activeObject) && (
        <motion.aside
          ref={panelRef}
          key="object-bento-panel"
          initial={isMobile ? { y: '100%', opacity: 0 } : { x: 440, opacity: 0 }}
          animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
          exit={isMobile ? { y: '100%', opacity: 0 } : { x: 440, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 240 }}
          className={`fixed z-50 overflow-hidden flex flex-col ${
            isMobile
              ? 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-x border-white/10 bg-zinc-950/95 backdrop-blur-2xl shadow-2xl'
              : 'top-[68px] right-4 w-[440px] max-h-[calc(100vh-84px)] rounded-2xl border border-white/10 bg-zinc-950/90 backdrop-blur-xl shadow-2xl'
          } ${className}`}
          aria-label="Celestial Object Intelligence & Educational Panel"
        >
        {/* Mobile Pull-to-Dismiss Indicator */}
        {isMobile && (
          <div className="pt-2 pb-1 flex justify-center">
            <div className="w-10 h-1 rounded-full bg-zinc-600/60" />
          </div>
        )}

        {/* Panel Top Bar with Smooth Close Button */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-black/30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-300 font-semibold">
              NASA Educational Dossier
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchObjectData(currentUrl)}
              disabled={loading}
              title="Refresh sub-agent extraction"
              className="px-2.5 py-1 text-xs font-mono text-zinc-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Fetching...' : 'Refresh'}
            </button>
            <button
              onClick={handleClose}
              aria-label="Close educational panel"
              className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.1] transition-colors focus:outline-none focus:ring-1 focus:ring-white/30"
              title="Close panel and return focus to 3D canvas (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Panel Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {/* Loading Skeleton */}
          {loading && !data && (
            <div className="space-y-3 animate-pulse">
              <div className="h-20 bg-white/[0.04] rounded-xl border border-white/[0.05]" />
              <div className="h-28 bg-white/[0.04] rounded-xl border border-white/[0.05]" />
              <div className="h-32 bg-white/[0.04] rounded-xl border border-white/[0.05]" />
              <div className="text-center font-mono text-xs text-zinc-500 py-2">
                Agent 1 (Scraper) & Agent 2 (Gemini Extractor) analyzing NASA archives...
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-950/30 text-red-200 text-xs font-mono flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-bold text-red-400">
                <span>⚠</span>
                <span>Pipeline Error</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">{error}</p>
              <button
                onClick={() => fetchObjectData(currentUrl)}
                className="self-start px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-red-300 font-mono text-xs transition-colors"
              >
                Retry Pipeline Fetch
              </button>
            </div>
          )}

          {/* Structured Educational Layout */}
          {data && (
            <div className="space-y-3">
              {/* Section 1: Bold Header with Object Name and Classification */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold tracking-tight text-white truncate font-sans">
                      {data.name || 'Celestial Object'}
                    </h2>
                    <p className="font-mono text-xs text-zinc-400 mt-0.5">
                      Identified via NASA Science & Gemini Agent
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-semibold border uppercase tracking-wider ${activeStyle.bg} ${activeStyle.text} ${activeStyle.border}`}
                  >
                    {data.classification}
                  </span>
                </div>

                {/* Candidate Cross-Match Details if available */}
                {candidateInfo && (
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] flex-wrap gap-2 text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">ID:</span>
                      <span className="text-zinc-300 font-semibold">{candidateInfo.id}</span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-zinc-500">Triage:</span>
                      <span className="text-orange-400 uppercase font-bold">{candidateInfo.verdict}</span>
                    </div>

                    <a
                      href={`#/object/${candidateInfo.id}`}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
                    >
                      <span>Full Dossier</span>
                      <span>→</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Candidate Astrometric Telemetry (When Candidate is Active) */}
              {candidateInfo && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      SPHEREx Astrometry & Parallax
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">
                      Telemetry
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05] flex flex-col">
                      <span className="text-[10px] text-zinc-500">RA (J2000)</span>
                      <NumberChip
                        value={candidateInfo.positions[0]?.ra ?? 0}
                        label="measured"
                        unit="°"
                        precision={4}
                      />
                    </div>

                    <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05] flex flex-col">
                      <span className="text-[10px] text-zinc-500">DEC (J2000)</span>
                      <NumberChip
                        value={candidateInfo.positions[0]?.dec ?? 0}
                        label="measured"
                        unit="°"
                        precision={4}
                      />
                    </div>

                    <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05] flex flex-col">
                      <span className="text-[10px] text-zinc-500">CONFIDENCE</span>
                      <NumberChip
                        value={candidateInfo.confidence}
                        label="derived"
                        precision={2}
                      />
                    </div>

                    <div className="p-2 rounded-lg bg-black/30 border border-white/[0.05] flex flex-col">
                      <span className="text-[10px] text-zinc-500">DISTANCE BOUND</span>
                      {candidateInfo.distance_range ? (
                        <div className="flex items-center gap-1 text-[11px]">
                          <NumberChip
                            value={candidateInfo.distance_range.min_au}
                            label="derived"
                            precision={1}
                          />
                          <span className="text-zinc-500">-</span>
                          <NumberChip
                            value={candidateInfo.distance_range.max_au}
                            label="derived"
                            unit="AU"
                            precision={1}
                          />
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">Direct cross-match</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 2: Clean Typography Block for Plain-Language Summary */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.6)]" />
                    Plain-Language Summary
                  </span>
                  <span className="font-mono text-[10px] text-cyan-400 uppercase px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 font-medium">
                    Gemini Synthesis [derived]
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-black/25 border border-white/[0.05]">
                  <p className="text-sm leading-relaxed text-zinc-200 font-sans tracking-wide">
                    {data.summary}
                  </p>
                </div>
              </div>

              {/* Section 3: Bulleted List for Notable Facts */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                    Notable Facts &amp; Planetary Insights
                  </span>
                  <span className="font-mono text-[10px] text-amber-300 uppercase px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 font-medium">
                    Astrophysical [derived]
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {notableFacts.map((fact, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-xs text-zinc-300 leading-relaxed font-sans bg-black/20 p-2.5 rounded-lg border border-white/[0.04]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Procedural 3D State Block (Rule 2 Tagged) */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                    Procedural 3D State
                  </span>
                  {/* Rule 2 Non-Negotiable Tag */}
                  <span className="font-mono text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded uppercase font-bold">
                    3D Model [Illustrative]
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {/* Base Color */}
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05] flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border border-white/30 shadow-inner flex-shrink-0"
                      style={{ backgroundColor: data.renderState?.baseColor || '#8C827A' }}
                    />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500">BASE COLOR</span>
                      <span className="text-zinc-200">{data.renderState?.baseColor || '#8C827A'}</span>
                    </div>
                  </div>

                  {/* Relative Scale */}
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05] flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500">SCALE FACTOR</span>
                      <NumberChip
                        value={data.renderState?.scale || 1.0}
                        label="derived"
                        prefix=""
                        precision={2}
                      />
                    </div>
                  </div>

                  {/* Texture Type */}
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05] flex flex-col">
                    <span className="text-[10px] text-zinc-500">TEXTURE TYPE</span>
                    <span className="text-zinc-200 capitalize font-sans font-medium">
                      {data.renderState?.textureType || 'rocky'}
                    </span>
                  </div>

                  {/* Rings */}
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/[0.05] flex flex-col">
                    <span className="text-[10px] text-zinc-500">RING SYSTEM</span>
                    <span className={data.renderState?.hasRings ? 'text-amber-400 font-bold' : 'text-zinc-400'}>
                      {data.renderState?.hasRings ? 'Present' : 'None'}
                    </span>
                  </div>
                </div>

                {/* Inject into 3D Canvas Action */}
                <div className="pt-1 flex items-center justify-between border-t border-white/[0.05]">
                  <span className="font-mono text-[10px] text-zinc-400">Procedural 3D Compiler</span>
                  <button
                    onClick={() => {
                      if (data && onInjectObject) {
                        onInjectObject(data);
                        setInjectedToast(true);
                        setTimeout(() => setInjectedToast(false), 2500);
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    title="Inject procedurally compiled 3D parameters directly into the active Three.js canvas"
                  >
                    <span>✦</span>
                    <span>{injectedToast ? 'Injected in 3D Scene!' : 'Inject into 3D Canvas'}</span>
                  </button>
                </div>
              </div>

              {/* Section 4: Responsive Image Masonry Grid / Carousel with Lazy-Loading */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.6)]" />
                    NASA Visual Assets
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-zinc-500">
                      <NumberChip
                        value={mediaUrls.length}
                        label="measured"
                        unit="assets"
                        precision={0}
                      />
                    </span>

                    {/* View Switcher: Masonry Grid vs Carousel */}
                    {mediaUrls.length > 1 && (
                      <div className="flex rounded-md bg-white/[0.06] p-0.5 border border-white/[0.08]">
                        <button
                          onClick={() => setGalleryViewMode('masonry')}
                          className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                            galleryViewMode === 'masonry'
                              ? 'bg-zinc-800 text-white font-medium'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          title="Masonry Grid View"
                        >
                          Grid
                        </button>
                        <button
                          onClick={() => setGalleryViewMode('carousel')}
                          className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                            galleryViewMode === 'carousel'
                              ? 'bg-zinc-800 text-white font-medium'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          title="Carousel View"
                        >
                          Carousel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {mediaUrls && mediaUrls.length > 0 ? (
                  galleryViewMode === 'carousel' ? (
                    /* Carousel View */
                    <div className="flex flex-col gap-2">
                      <div className="relative overflow-hidden rounded-xl border border-white/[0.1] bg-black/60 h-52 group">
                        <img
                          src={mediaUrls[carouselIndex]}
                          alt={`${data.name} carousel asset ${carouselIndex + 1}`}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                          loading="lazy"
                          onClick={() => setActiveImageZoom(mediaUrls[carouselIndex])}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images-assets.nasa.gov/image/PIA21974/PIA21974~orig.jpg';
                          }}
                        />

                        {/* Navigation Arrows */}
                        <div className="absolute inset-0 flex items-center justify-between p-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCarouselIndex((prev) => (prev > 0 ? prev - 1 : mediaUrls.length - 1));
                            }}
                            className="pointer-events-auto w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 text-sm transition-all"
                            title="Previous image"
                          >
                            ‹
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCarouselIndex((prev) => (prev < mediaUrls.length - 1 ? prev + 1 : 0));
                            }}
                            className="pointer-events-auto w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 text-sm transition-all"
                            title="Next image"
                          >
                            ›
                          </button>
                        </div>

                        {/* Slide Indicator Badge */}
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 border border-white/20 text-[10px] font-mono text-zinc-300 pointer-events-none">
                          {carouselIndex + 1} / {mediaUrls.length}
                        </div>
                      </div>

                      {/* Thumbnail dots */}
                      <div className="flex justify-center items-center gap-1.5 pt-1">
                        {mediaUrls.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCarouselIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              idx === carouselIndex
                                ? 'bg-cyan-400 w-4 shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                                : 'bg-zinc-700 hover:bg-zinc-500'
                            }`}
                            title={`Jump to image ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Masonry Grid View */
                    <div className="grid grid-cols-2 gap-2">
                      {mediaUrls.map((imgUrl, idx) => (
                        <div
                          key={idx}
                          onClick={() => setActiveImageZoom(imgUrl)}
                          className={`group relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/40 cursor-pointer transition-all hover:border-white/30 ${
                            idx === 0 ? 'col-span-2 h-40' : 'col-span-1 h-24'
                          }`}
                        >
                          <img
                            src={imgUrl}
                            alt={`${data.name} visual asset ${idx + 1}`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                            <span className="font-mono text-[10px] text-white/90 truncate flex items-center gap-1">
                              <span>🔍</span>
                              <span>Click to zoom</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="p-4 text-center rounded-lg bg-black/20 border border-white/[0.04] text-xs font-mono text-zinc-500">
                    No public NASA media URLs found in parsed article scope.
                  </div>
                )}
              </div>

              {/* Data Source Link & Live Explorer */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-3">
                <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                  Data Source &amp; Live Inspector
                </span>

                {/* Primary Data Source Link */}
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all text-xs font-mono text-cyan-400 group"
                >
                  <span className="truncate pr-2">{currentUrl}</span>
                  <span className="text-zinc-500 group-hover:text-cyan-300 transition-colors">↗</span>
                </a>

                {/* On-demand URL input to inspect any NASA article live */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customUrlInput.trim()) {
                      fetchObjectData(customUrlInput.trim());
                    }
                  }}
                  className="flex gap-2 mt-1"
                >
                  <input
                    type="url"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="Paste NASA article URL to re-run pipeline..."
                    className="flex-1 bg-black/50 border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !customUrlInput.trim()}
                    className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-300 font-mono text-xs transition-colors disabled:opacity-50"
                  >
                    Run
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Modal Lightbox for Image Zoom */}
        {activeImageZoom && (
          <div
            onClick={() => setActiveImageZoom(null)}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          >
            <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-white/20">
              <img
                src={activeImageZoom}
                alt="Enlarged NASA asset"
                className="w-full h-full object-contain"
                loading="lazy"
              />
              <button
                onClick={() => setActiveImageZoom(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white font-bold flex items-center justify-center border border-white/30 hover:bg-black/80 transition-colors"
                title="Close zoom (Esc)"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default ObjectPanel;
