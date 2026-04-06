'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '@/stores/callStore';
import { useWebSocket } from '@/hooks/useWebSocket';

interface ReactionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const REACTION_PACKS = {
  default: ['❤️', '😂', '😮', '👏', '🔥', '🎉'],
  fire: ['🔥', '💥', '⚡', '🌋', '☄️'],
  love: ['❤️', '😍', '💕', '🥰', '💘'],
  hype: ['👏', '🙌', '🎉', '🚀', '💯'],
};

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
  wobbleDir: number;
}

interface ConfettiParticle {
  id: string;
  x: number;
  y: number;
  angle: number;
  color: string;
  emoji: string;
}

const CONFETTI_COLORS = ['#06B6D4', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6'];

function playReactionSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch { /* ignore */ }
}

export function ReactionsPanel({ isOpen, onClose: _onClose }: ReactionsPanelProps) {
  const { callId, status } = useCallStore();
  const { send } = useWebSocket();
  const [activePack, setActivePack] = useState<keyof typeof REACTION_PACKS>('default');
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tapCountRef = useRef<number>(0);
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spawnFloating = useCallback((emoji: string) => {
    const reactionId = `reaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setFloatingReactions((prev) => [
      ...prev.slice(-49),
      { id: reactionId, emoji, x: Math.random() * 60 + 20, wobbleDir: Math.random() > 0.5 ? 1 : -1 },
    ]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== reactionId));
    }, 2600);
  }, []);

  const burstConfetti = useCallback((emoji: string) => {
    const particles: ConfettiParticle[] = Array.from({ length: 20 }, (_, i) => ({
      id: `confetti-${Date.now()}-${i}`,
      x: 40 + Math.random() * 20,
      y: 50,
      angle: (i / 20) * 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      emoji,
    }));
    setConfetti(particles);
    setTimeout(() => setConfetti([]), 1200);
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    if (!callId || status !== 'active') return;
    send({ type: 'reaction:send', payload: { callId, emoji, pack: activePack } });
    spawnFloating(emoji);
    playReactionSound();

    // Dispatch for ChatPanel reaction count tracking
    window.dispatchEvent(new CustomEvent('reaction:incoming', { detail: { emoji } }));

    // Confetti on 10 rapid taps
    tapCountRef.current += 1;
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    tapResetRef.current = setTimeout(() => { tapCountRef.current = 0; }, 1000);
    if (tapCountRef.current >= 10) {
      burstConfetti(emoji);
      tapCountRef.current = 0;
    }
  }, [callId, status, activePack, send, spawnFloating, burstConfetti]);

  const handlePointerDown = (emoji: string) => {
    sendReaction(emoji);
    holdTimerRef.current = setTimeout(() => {
      streamIntervalRef.current = setInterval(() => sendReaction(emoji), 300);
    }, 500);
  };

  const handlePointerUp = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (streamIntervalRef.current) { clearInterval(streamIntervalRef.current); streamIntervalRef.current = null; }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] w-full max-w-sm px-3"
        >
          <div className="glass-md rounded-2xl p-4">
            <div className="flex gap-2 mb-3 overflow-x-auto">
              {(Object.keys(REACTION_PACKS) as Array<keyof typeof REACTION_PACKS>).map((pack) => (
                <button
                  key={pack}
                  onClick={() => setActivePack(pack)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                    activePack === pack
                      ? 'badge'
                      : 'glass text-[var(--text-secondary)] hover:text-white'
                  }`}
                >
                  {pack}
                </button>
              ))}
            </div>

            <div className="flex justify-around">
              {REACTION_PACKS[activePack].map((emoji) => (
                <button
                  key={emoji}
                  onPointerDown={() => handlePointerDown(emoji)}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="w-11 h-11 rounded-lg glass flex items-center justify-center text-xl hover:scale-110 hover:border-[var(--border-cyan)] transition-all select-none touch-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Floating reactions */}
          <AnimatePresence>
            {floatingReactions.map((reaction) => (
              <motion.div
                key={reaction.id}
                initial={{ y: 0, opacity: 1, scale: 1, x: 0, rotate: 0 }}
                animate={{
                  y: -300,
                  opacity: [1, 1, 0.9, 0.6, 0],
                  scale: [1, 1.3, 1.1, 0.9, 0.7],
                  x: [0, reaction.wobbleDir * 12, reaction.wobbleDir * -10, reaction.wobbleDir * 8, 0],
                  rotate: [0, reaction.wobbleDir * 15, reaction.wobbleDir * -12, reaction.wobbleDir * 8, 0],
                }}
                transition={{ duration: 2.4, ease: 'easeOut' }}
                className="absolute bottom-24 text-3xl pointer-events-none"
                style={{ left: `${reaction.x}%` }}
              >
                {reaction.emoji}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Confetti burst on 10 rapid taps */}
          <AnimatePresence>
            {confetti.map((p) => (
              <motion.div
                key={p.id}
                initial={{ x: `${p.x}%`, y: '60%', scale: 0.5, opacity: 1 }}
                animate={{
                  x: `${p.x + Math.cos((p.angle * Math.PI) / 180) * 60}%`,
                  y: `${60 - Math.sin((p.angle * Math.PI) / 180) * 80}%`,
                  scale: [0.5, 1.4, 0.3],
                  opacity: [1, 1, 0],
                  rotate: p.angle * 3,
                }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
                className="absolute text-2xl pointer-events-none"
              >
                {p.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

