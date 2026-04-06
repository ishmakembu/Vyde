'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode) or dismissed before
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      sessionStorage.getItem('pwa-prompt-dismissed')
    ) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-prompt-dismissed', '1');
    setDismissed(true);
    setDeferredPrompt(null);
  };

  const show = !!deferredPrompt && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:w-80"
        >
          <div className="glass-md rounded-2xl p-4 flex items-start gap-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-[var(--cyan)]/20 flex items-center justify-center flex-shrink-0 text-lg">
              📱
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-white">Add Vide to Home Screen</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Install for a faster, full-screen experience.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleInstall}
                  className="btn-primary text-xs px-3 py-1.5 rounded-lg font-semibold"
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-xs text-[var(--text-secondary)] hover:text-white transition-colors px-2"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-[var(--text-secondary)] hover:text-white transition-colors flex-shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
