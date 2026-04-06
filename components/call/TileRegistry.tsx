'use client';

import React, { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Registry context ────────────────────────────────────────────────────────

interface TileRegistryContextValue {
  registerTile: (userId: string, el: HTMLDivElement | null) => void;
  getViewportRect: (userId: string) => DOMRect | null;
}

const TileRegistryContext = createContext<TileRegistryContextValue>({
  registerTile: () => {},
  getViewportRect: () => null,
});

export function useTileRegistry() {
  return useContext(TileRegistryContext);
}

export function TileRegistryProvider({ children }: { children: React.ReactNode }) {
  const refs = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerTile = useCallback((userId: string, el: HTMLDivElement | null) => {
    if (el) refs.current.set(userId, el);
    else refs.current.delete(userId);
  }, []);

  const getViewportRect = useCallback((userId: string): DOMRect | null => {
    return refs.current.get(userId)?.getBoundingClientRect() ?? null;
  }, []);

  return (
    <TileRegistryContext.Provider value={{ registerTile, getViewportRect }}>
      {children}
    </TileRegistryContext.Provider>
  );
}

// ─── Overlay component ────────────────────────────────────────────────────────

interface RemoteReaction {
  id: string;
  emoji: string;
  /** viewport-relative origin X center */
  originX: number;
  /** viewport-relative origin Y center */
  originY: number;
}

let idCounter = 0;

export function RemoteReactionsOverlay() {
  const { getViewportRect } = useTileRegistry();
  const [reactions, setReactions] = useState<RemoteReaction[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { userId, emoji } = (e as CustomEvent<{ userId?: string; emoji: string }>).detail;

      // Skip local reactions — ReactionsPanel renders its own floating emojis
      if (!userId) return;

      const rect = getViewportRect(userId);

      /** Fall back to bottom-center of screen when tile not found */
      const originX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const originY = rect ? rect.top + rect.height * 0.4 : window.innerHeight * 0.7;

      const id = `rr-${++idCounter}`;
      setReactions((prev) => [...prev.slice(-39), { id, emoji, originX, originY }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 2500);
    };

    window.addEventListener('reaction:incoming', handler as EventListener);
    return () => window.removeEventListener('reaction:incoming', handler as EventListener);
  }, [getViewportRect]);

  return (
    <AnimatePresence>
      {reactions.map((r) => (
        <motion.div
          key={r.id}
          initial={{ x: r.originX, y: r.originY, scale: 0.6, opacity: 1, rotate: 0 }}
          animate={{
            x: r.originX + (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 30),
            y: r.originY - 220 - Math.random() * 80,
            scale: [0.6, 1.3, 1.0, 0.7],
            opacity: [1, 1, 0.8, 0],
            rotate: [(Math.random() - 0.5) * 30],
          }}
          transition={{ duration: 2.2, ease: 'easeOut' }}
          className="fixed pointer-events-none z-[9000] text-3xl leading-none select-none"
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          {r.emoji}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
