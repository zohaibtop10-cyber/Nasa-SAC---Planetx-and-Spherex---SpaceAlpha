/**
 * OmniSearch.tsx - Modern Floating Astrophysical Search Bar Component
 *
 * Requirements:
 * 1. Centered floating search input with blurred glassmorphic background & hairline border (#26262A).
 * 2. onSubmit handler sending user query (URL or name) to /api/explore-object.
 * 3. Loading state with pulsing spinner and "Analyzing NASA data..." message.
 * 4. Updates global Zustand workspace store & invokes callback to update 3D canvas and side panel instantly.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExploreObjectResult } from '../../api/exploreObjectWorkflow';
import { useWorkspaceStore } from '../../data/workspaceStore';
import { Candidate } from '../../data/types';

interface OmniSearchProps {
  onObjectExplored?: (candidate: Candidate, rawResult: ExploreObjectResult) => void;
  className?: string;
}

const QUICK_SUGGESTIONS = [
  { label: '1 Ceres', query: '1 Ceres' },
  { label: "Halley's Comet", query: "Halley's Comet" },
  { label: "Barnard's Star", query: "Barnard's Star" },
  { label: 'Jupiter', query: 'Jupiter' },
  { label: 'NASA SPHEREx', query: 'https://science.nasa.gov/mission/spherex/' },
];

export const OmniSearch: React.FC<OmniSearchProps> = ({ onObjectExplored, className = '' }) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isSearching, searchStatusMessage, error, setSearching, setError, addExploredObject } =
    useWorkspaceStore();

  // Keyboard shortcut: Cmd+K / Ctrl+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setShowSuggestions(true);
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setShowSuggestions(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed || isSearching) return;

    setSearching(true, 'Querying NASA & Wikipedia archives...');
    setError(null);
    setShowSuggestions(false);

    try {
      // Step-by-step telemetry status progression
      const statusTimer1 = setTimeout(() => {
        setSearching(true, 'Compiling 3D Keplerian state with Gemini AI...');
      }, 900);

      const res = await fetch('/api/explore-object', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmed }),
      });

      clearTimeout(statusTimer1);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to explore celestial object.`);
      }

      setSearching(true, 'Structuring 3D workspace payload...');
      const result: ExploreObjectResult = await res.json();

      // Update global Zustand workspace state
      const newCandidate = addExploredObject(result);

      // Trigger instant canvas & side panel update
      if (onObjectExplored) {
        onObjectExplored(newCandidate, result);
      }

      setQuery('');
    } catch (err: any) {
      setError(err.message || 'Error communicating with NASA explore API.');
      setSearching(false, null);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  return (
    <div className={`relative z-30 flex flex-col items-center w-full max-w-xl mx-auto ${className}`}>
      {/* Floating Pill Container with Clean Studio styling */}
      <form
        onSubmit={onSubmit}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-all duration-300 ${
          isFocused
            ? 'bg-zinc-950/85 border-[#38BDF8]/60 shadow-[0_0_25px_rgba(56,189,248,0.2)]'
            : 'bg-zinc-950/70 border-[#26262A] hover:border-zinc-700 shadow-xl'
        } backdrop-blur-xl border`}
      >
        {/* Leading Search Icon / Loading Spinner */}
        <div className="flex items-center justify-center w-5 h-5 flex-shrink-0 text-zinc-400">
          {isSearching ? (
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-cyan-400 opacity-60" />
              <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <svg
              className="w-4 h-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
        </div>

        {/* Text Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={isSearching}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            setShowSuggestions(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            // Delay closing to allow clicking suggestions
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          placeholder={
            isSearching
              ? (searchStatusMessage || 'Analyzing NASA data...')
              : 'Explore celestial body by name or NASA URL (e.g. Ceres, Halley, Jupiter)...'
          }
          className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-sans font-normal tracking-wide disabled:opacity-60"
        />

        {/* Clear Button */}
        {query && !isSearching && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded-full transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Action Button / Keyboard Shortcut Hint */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {query.trim() ? (
            <button
              type="submit"
              disabled={isSearching}
              className="px-2.5 py-1 text-[11px] font-mono font-medium rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span>Explore</span>
              <span>↵</span>
            </button>
          ) : (
            <div className="hidden sm:flex items-center gap-0.5 px-2 py-0.5 rounded border border-white/[0.08] bg-white/[0.03] text-[10px] font-mono text-zinc-500">
              <span>⌘</span>
              <span>K</span>
            </div>
          )}
        </div>
      </form>

      {/* Dynamic Status / Progress Banner */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-2 px-3 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/30 backdrop-blur-md flex items-center gap-2 text-xs font-mono text-cyan-300 shadow-lg"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>{searchStatusMessage || 'Analyzing NASA & SPHEREx data...'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Alert Pill */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-2 px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/30 backdrop-blur-md flex items-center justify-between gap-3 text-xs font-mono text-red-300 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <span className="text-red-400 font-bold">!</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-200 text-xs cursor-pointer"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Suggestion Pills Dropdown */}
      <AnimatePresence>
        {showSuggestions && !isSearching && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute top-full mt-2 w-full p-2.5 rounded-xl bg-zinc-950/90 border border-[#26262A] backdrop-blur-xl shadow-2xl flex flex-col gap-1.5"
          >
            <div className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase px-1.5">
              Quick Explore Targets
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SUGGESTIONS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery(item.query);
                    handleSearch(item.query);
                  }}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.06] hover:border-white/[0.15] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="text-cyan-400">✦</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OmniSearch;
