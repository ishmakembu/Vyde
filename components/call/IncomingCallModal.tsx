'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Avatar } from '@/components/ui/Avatar';

interface IncomingCallModalProps {
  callerId: string;
  callerUsername: string;
  callerAvatar: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallModal({
  callerUsername,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  useEffect(() => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(520, audioContext.currentTime + 0.15);
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.3);
      oscillator.frequency.setValueAtTime(520, audioContext.currentTime + 0.45);
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.6);

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.25);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.4);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.45);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.55);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.6);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.7);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.7);

      const interval = setInterval(() => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(440, audioContext.currentTime);
        osc.frequency.setValueAtTime(520, audioContext.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.setValueAtTime(0, audioContext.currentTime + 0.1);
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.7);
      }, 700);

      return () => {
        clearInterval(interval);
        audioContext.close();
      };
    } catch {
      // Audio not available in this context
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: 'radial-gradient(circle at center, rgba(0,80,120,0.3) 0%, var(--bg-void) 70%)',
      }}
    >
      <div className="absolute inset-0 backdrop-blur-[40px]" />

      <div className="relative z-10 text-center">
        <div className="relative inline-block mb-5">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="w-24 h-24 rounded-full"
          >
            <Avatar username={callerUsername} size="xl" />
          </motion.div>

          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
              className="absolute inset-0 rounded-full border-2 border-[var(--cyan)]"
            />
          ))}
        </div>

        <h2 className="text-[28px] font-bold text-white mb-1">{callerUsername}</h2>
        <p className="text-[14px] text-[var(--text-secondary)] mb-12">Incoming video call</p>

        <div className="flex items-center justify-center gap-8">
          <button
            onClick={onDecline}
            className="flex flex-col items-center gap-2"
          >
            <div className="w-[72px] h-[72px] rounded-full bg-[rgba(255,80,80,0.8)] border border-[rgba(255,80,80,0.5)] flex items-center justify-center shadow-[0_4px_24px_rgba(255,80,80,0.4)] transition-transform hover:scale-105 active:scale-95">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            </div>
            <span className="text-[12px] text-[var(--text-secondary)]">Decline</span>
          </button>

          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-2"
          >
            <div className="w-[72px] h-[72px] rounded-full bg-[#22c55e] border border-[rgba(34,197,94,0.5)] flex items-center justify-center shadow-[0_4px_24px_rgba(34,197,94,0.4)] transition-transform hover:scale-105 active:scale-95">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <span className="text-[12px] text-[var(--text-secondary)]">Accept</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}