/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { MusicControls, MusicTrack } from '@/hooks/useMusic';

interface MusicPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  music: MusicControls;
}

type Tab = 'file' | 'url';

function formatTime(secs: number): string {
  if (!isFinite(secs) || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicPlayer({ isOpen, onClose, music }: MusicPlayerProps) {
  const [tab, setTab] = useState<Tab>('url');
  const [urlInput, setUrlInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    track,
    playing,
    position,
    isDJ,
    djUserId,
    localVolume,
    isLoading,
    loadTrack,
    play,
    pause,
    seek,
    stopTrack,
    setLocalVolume,
  } = music;

  // ----------------------------------------------------------------
  // File upload handler
  // ----------------------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    // Estimate duration via a temporary audio element
    const probe = new Audio();
    probe.src = url;
    probe.onloadedmetadata = () => {
      const newTrack: MusicTrack = {
        url,
        title: name,
        duration: isFinite(probe.duration) ? probe.duration : 0,
      };
      loadTrack(newTrack);
    };
    probe.onerror = () => {
      loadTrack({ url, title: name, duration: 0 });
    };
  };

  // ----------------------------------------------------------------
  // URL extraction handler
  // ----------------------------------------------------------------
  const handleExtract = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setIsExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch('/api/music/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Extraction failed');
      }
      const data = await res.json() as {
        streamUrl: string;
        title?: string;
        duration?: number;
        thumbnailUrl?: string;
      };
      loadTrack({
        url: data.streamUrl,
        title: data.title ?? 'Unknown',
        albumArt: data.thumbnailUrl,
        duration: data.duration ?? 0,
      });
      setUrlInput('');
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract audio');
    } finally {
      setIsExtracting(false);
    }
  };

  // ----------------------------------------------------------------
  // Progress bar interaction
  // ----------------------------------------------------------------
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDJ || !track) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(track.duration, ratio * track.duration)));
  };

  const progressPercent = track && track.duration > 0 ? (position / track.duration) * 100 : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-y-0 right-0 w-[280px] md:w-[320px] z-[60] flex flex-col p-3 pointer-events-none"
        >
          <div className="h-full w-full glass-dark rounded-2xl overflow-hidden flex flex-col pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-glass)]">
              <div className="flex items-center gap-2">
                <span className="text-base">🎵</span>
                <h2 className="text-[14px] font-semibold text-white">Listen Together</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-secondary)] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col">

              {/* ---- Mini player (shown when a track is loaded) ---- */}
              {track && (
                <div className="m-3 rounded-xl glass p-3 flex flex-col gap-3">
                  {/* Album art + info */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--bg-surface-md)] flex-shrink-0 flex items-center justify-center">
                      {track.albumArt ? (
                        <img src={track.albumArt} alt="Album art" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🎵</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate">{track.title}</p>
                      {track.artist && (
                        <p className="text-[11px] text-[var(--text-secondary)] truncate">{track.artist}</p>
                      )}
                      {!isDJ && djUserId && (
                        <span className="text-[10px] text-[var(--cyan)] font-medium">🎵 DJ playing</span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div
                      className={cn(
                        "h-1.5 rounded-full bg-[var(--bg-surface-md)] relative overflow-hidden",
                        isDJ ? "cursor-pointer" : "cursor-default",
                      )}
                      onClick={handleSeek}
                    >
                      <motion.div
                        className="absolute left-0 top-0 h-full rounded-full bg-[var(--cyan)]"
                        style={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-[var(--text-tertiary)]">{formatTime(position)}</span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">{formatTime(track.duration)}</span>
                    </div>
                  </div>

                  {/* Controls */}
                  {isDJ ? (
                    <div className="flex items-center justify-center gap-3">
                      {/* Seek -10s */}
                      <button
                        className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-secondary)] text-[11px] font-bold transition-colors"
                        onClick={() => seek(Math.max(0, position - 10))}
                      >
                        −10
                      </button>

                      {/* Play / Pause */}
                      <button
                        disabled={isLoading}
                        onClick={playing ? pause : play}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                          "bg-[var(--cyan)] text-[var(--bg-void)] hover:brightness-110",
                          isLoading && "opacity-50 cursor-wait",
                        )}
                      >
                        {isLoading ? (
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : playing ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5.14v14l11-7-11-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Seek +10s */}
                      <button
                        className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-secondary)] text-[11px] font-bold transition-colors"
                        onClick={() => seek(Math.min(track.duration, position + 10))}
                      >
                        +10
                      </button>

                      {/* Stop */}
                      <button
                        className="w-8 h-8 rounded-full hover:bg-[var(--danger-dim)] flex items-center justify-center text-[var(--text-danger)] transition-colors"
                        onClick={stopTrack}
                        title="Stop and remove track"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="4" y="4" width="16" height="16" rx="2" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    /* Listener: play/pause own local audio only (does not broadcast) */
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={playing ? pause : play}
                        className="w-10 h-10 rounded-full bg-[var(--bg-surface-md)] flex items-center justify-center text-white hover:bg-[var(--bg-hover)] transition-colors"
                        title="Toggle local audio"
                      >
                        {playing ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5.14v14l11-7-11-7z" />
                          </svg>
                        )}
                      </button>
                      <span className="text-[11px] text-[var(--text-secondary)]">Listening</span>
                    </div>
                  )}

                  {/* Volume */}
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={localVolume}
                      onChange={(e) => setLocalVolume(parseFloat(e.target.value))}
                      className="flex-1 h-1 accent-[var(--cyan)]"
                    />
                  </div>
                </div>
              )}

              {/* ---- Load section (DJ only when no track playing, or always if DJ to change track) ---- */}
              {(!track || isDJ) && (
                <div className="mx-3 mb-3 flex flex-col gap-3">
                  {/* Only show tabs when we're the DJ (or no track yet) */}
                  <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface)]">
                    {(['url', 'file'] as Tab[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[12px] font-medium transition-all",
                          tab === t
                            ? "bg-[var(--bg-surface-md)] text-white"
                            : "text-[var(--text-secondary)] hover:text-white",
                        )}
                      >
                        {t === 'url' ? '🔗 URL' : '📁 File'}
                      </button>
                    ))}
                  </div>

                  {tab === 'url' ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Paste a YouTube or SoundCloud URL
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={urlInput}
                          onChange={(e) => { setUrlInput(e.target.value); setExtractError(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleExtract(); }}
                          placeholder="https://youtube.com/watch?v=..."
                          className="flex-1 min-w-0 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg px-3 py-2 text-[12px] text-white placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
                        />
                        <button
                          onClick={handleExtract}
                          disabled={isExtracting || !urlInput.trim()}
                          className={cn(
                            "px-3 py-2 rounded-lg text-[12px] font-semibold transition-all flex-shrink-0",
                            "bg-[var(--cyan)] text-[var(--bg-void)] hover:brightness-110",
                            (isExtracting || !urlInput.trim()) && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          {isExtracting ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                          ) : (
                            'Load'
                          )}
                        </button>
                      </div>
                      {extractError && (
                        <p className="text-[11px] text-[var(--text-danger)] bg-[var(--danger-dim)] border border-[var(--border-danger)] rounded-lg px-2.5 py-1.5 leading-snug">
                          {extractError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Upload an audio file (MP3, AAC, FLAC, WAV)
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-8 rounded-xl border-2 border-dashed border-[var(--border-glass-md)] text-[var(--text-secondary)] text-[12px] hover:border-[var(--cyan)] hover:text-[var(--cyan)] transition-all flex flex-col items-center gap-1"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Click to choose a file
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {!track && !isDJ && (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8 text-[var(--text-secondary)]">
                  <span className="text-4xl mb-3">🎵</span>
                  <p className="text-[13px]">Waiting for someone to start music…</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
