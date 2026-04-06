'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';

export function Toast() {
  const { toast, hideToast } = useUIStore();

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        hideToast();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  const bgColors = {
    success: 'bg-[var(--green)]',
    error: 'bg-[var(--danger)]',
    info: 'bg-[var(--cyan)]',
  };

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          transition={{ duration: 0.2 }}
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] min-w-[240px] rounded-lg px-4 py-3 text-sm text-white ${bgColors[toast.type]}`}
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}