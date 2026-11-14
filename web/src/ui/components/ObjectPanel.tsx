/**
 * ObjectPanel.tsx
 * Dynamic side panel component rendering NASA data fetched by the sub-agent pipeline.
 *
 * Implements:
 * 1. Sleek, glassmorphic bento grid layout via Tailwind CSS & Framer Motion.
 * 2. Wide header span with Object Name and Classification badge.
 * 3. AI-generated plain-language summary block with epistemic derivation badge.
 * 4. Masonry image gallery displaying extracted NASA image URLs with modal zoom.
 * 5. Data Source link pointing back to the original NASA URL + on-demand URL input.
 * 6. Responsive: Bottom drawer on mobile, pinned right-side panel on desktop.
 * 7. Populates dynamically when activeObject updates in the 3D canvas.
 * 8. Complies with Rule 1 (epistemic number labels) and Rule 2 (3D model "Illustrative" tags).
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Candidate } from '../../data/types';
import { NasaObjectPayload, ObjectClassification } from '../../api/fetchNasaObjectWorkflow';
import { NumberChip } from './NumberChip';

export type ActiveObjectType =
  | Candidate
  | NasaObjectPayload
  | {
      id?: string;
      name?: string;
      url?: string;
      candidate?: Candidate | null;
      payload?: NasaObjectPayload | null;
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
    const designation = (candidate.match?.designation || '').toLowerCase();

    if (designation.includes('ceres')) return 'https://science.nasa.gov/solar-system/asteroids/1-ceres/';
    if (designation.includes('vesta')) return 'https://science.nasa.gov/solar-system/asteroids/4-vesta/';
    if (designation.includes('bennu')) return 'https://science.nasa.gov/solar-system/asteroids/101955-bennu/';
    if (designation.includes('psyche')) return 'https://science.nasa.gov/mission/psyche/';
    if (designation.includes('halley')) return 'https://science.nasa.gov/solar-system/comets/1p-halley/';
    if (designation.includes('jupiter')) return 'https://science.nasa.gov/jupiter/';
    if (designation.includes('saturn')) return 'https://science.nasa.gov/saturn/';

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
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Responsive breakpoint tracking
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Check if activeObject is already a complete NasaObjectPayload
  const isDirectPayload = useMemo(() => {
    if (!activeObject) return false;
    return 'classification' in activeObject && 'renderState' in activeObject && 'summary' in activeObject;
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

    if (isDirectPayload) {
      const direct = activeObject as NasaObjectPayload;
      setData(direct);
      const url = resolveNasaUrlForObject(activeObject);
      setCurrentUrl(url);
      setCustomUrlInput(url);
      setLoading(false);
      setError(null);
      return;
    }

    const resolvedUrl = resolveNasaUrlForObject(activeObject);
    fetchObjectData(resolvedUrl);
  }, [activeObject, isDirectPayload, fetchObjectData]);

  if (!activeObject) return null;

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

  return (
    <AnimatePresence>
      <motion.aside
        key="object-bento-panel"
        initial={isMobile ? { y: '100%', opacity: 0 } : { x: 380, opacity: 0 }}
        animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
        exit={isMobile ? { y: '100%', opacity: 0 } : { x: 380, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        className={`fixed z-50 overflow-hidden flex flex-col ${
          isMobile
            ? 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-x border-white/10 bg-zinc-950/90 backdrop-blur-2xl'
            : 'top-[68px] right-4 w-[430px] max-h-[calc(100vh-84px)] rounded-2xl border border-white/10 bg-zinc-950/85 backdrop-blur-xl shadow-2xl'
        } ${className}`}
        aria-label="Celestial Object Intelligence Panel"
      >
        {/* Mobile Pull-to-Dismiss Indicator */}
        {isMobile && (
          <div className="pt-2 pb-1 flex justify-center">
            <div className="w-10 h-1 rounded-full bg-zinc-600/60" />
          </div>
        )}

        {/* Panel Top Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-black/20">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-400 font-semibold">
              NASA Sub-Agent Telemetry
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchObjectData(currentUrl)}
              disabled={loading}
              title="Refresh sub-agent extraction"
              className="px-2 py-1 text-xs font-mono text-zinc-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Fetching...' : 'Refresh'}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                ✕
              </button>
            )}
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

          {/* Glassmorphic Bento Grid */}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Bento Card 1 (Wide Header Span): Object Name & Classification */}
              <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold tracking-tight text-white truncate font-sans">
                      {data.name || 'Celestial Object'}
                    </h2>
                    <p className="font-mono text-xs text-zinc-400 mt-0.5">
                      Identified from NASA Science Repository
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-medium border uppercase tracking-wider ${activeStyle.bg} ${activeStyle.text} ${activeStyle.border}`}
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

              {/* Bento Card: Candidate Astrometric Telemetry (When Candidate is Active) */}
              {candidateInfo && (
                <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-2.5">
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

              {/* Bento Card 2 (Wide Span): AI-Generated Plain-Language Summary */}
              <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    Plain-Language Summary
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                    Agent 2 [derived]
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-zinc-200 font-sans">
                  {data.summary}
                </p>
              </div>

              {/* Bento Card 3: 3D Procedural State (Agent 3 Compiler) */}
              <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
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

              {/* Bento Card 4 (Wide Span): Masonry Image Gallery */}
              <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                    NASA Image Gallery
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    <NumberChip
                      value={data.images?.length || 0}
                      label="measured"
                      unit="assets"
                      precision={0}
                    />
                  </span>
                </div>

                {data.images && data.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {data.images.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        onClick={() => setActiveImageZoom(imgUrl)}
                        className={`group relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/40 cursor-pointer transition-all hover:border-white/30 ${
                          idx === 0 ? 'col-span-2 h-36' : 'col-span-1 h-24'
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
                          <span className="font-mono text-[10px] text-white/90 truncate">
                            Click to expand
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center rounded-lg bg-black/20 border border-white/[0.04] text-xs font-mono text-zinc-500">
                    No public NASA media URLs found in parsed article scope.
                  </div>
                )}
              </div>

              {/* Bento Card 5 (Wide Span): Data Source Link & On-Demand URL Inspector */}
              <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex flex-col gap-3">
                <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                  Data Source & Live Inspector
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
              />
              <button
                onClick={() => setActiveImageZoom(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white font-bold flex items-center justify-center border border-white/30"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  );
};

export default ObjectPanel;
