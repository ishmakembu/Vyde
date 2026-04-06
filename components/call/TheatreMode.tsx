'use client';

import { motion } from 'framer-motion';

interface TheatreModeProps {
  /** The main content pane — screen share or remote video */
  mainContent: React.ReactNode;
  /** The self-view / camera tile */
  selfView: React.ReactNode;
  /** The control bar overlay */
  controls: React.ReactNode;
  /** The top status bar */
  statusBar: React.ReactNode;
  /** Optional child panels (chat, reactions, music) */
  children?: React.ReactNode;
  /** Sync drift in ms; shown if > 500 */
  syncDrift?: number;
}

/**
 * TheatreMode — 75/25 split layout for screen-share / watch-together sessions.
 *
 * ┌────────────────────────────┬────────────┐
 * │  75% – screen / content    │ 25% column │
 * │  (letterboxed aspect)      │ self-view  │
 * │                            │ controls   │
 * └────────────────────────────┴────────────┘
 */
export function TheatreMode({
  mainContent,
  selfView,
  controls,
  statusBar,
  children,
  syncDrift,
}: TheatreModeProps) {
  const isDrifting = typeof syncDrift === 'number' && syncDrift > 500;

  return (
    <div
      className="fixed inset-0 bg-black z-[100] flex overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* Left panel — 75% — main content */}
      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        <div className="w-full h-full">{mainContent}</div>

        {/* Status bar overlaid at top */}
        <div className="absolute top-0 left-0 right-0 z-10">{statusBar}</div>

        {/* Sync drift indicator */}
        {isDrifting && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 glass-dark px-3 py-1.5 rounded-full text-[11px] z-20"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 font-medium">
              {Math.round(syncDrift / 1000)}s drift — syncing
            </span>
          </motion.div>
        )}
      </div>

      {/* Right column — 25% */}
      <div className="flex flex-col w-[25%] min-w-[180px] max-w-[320px] bg-[var(--bg-void)] border-l border-[var(--border-glass)]">
        {/* Self-view */}
        <div className="flex-1 relative overflow-hidden">{selfView}</div>

        {/* Bottom controls */}
        <div className="shrink-0">{controls}</div>
      </div>

      {/* Floating panels (chat, reactions, music player) */}
      {children}
    </div>
  );
}
