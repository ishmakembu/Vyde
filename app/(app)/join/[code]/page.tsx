'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { sendWsMessage } from '@/hooks/useWebSocket';
import { useCallStore } from '@/stores/callStore';
import { useUIStore } from '@/stores/uiStore';
import { GlassButton } from '@/components/ui/GlassButton';
import { motion } from 'framer-motion';

export default function JoinCallPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const code = ((params?.code as string) ?? '').toUpperCase();
  const [joining, setJoining] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Auto-join once the session is loaded
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session?.user?.id) {
      // Not logged in — redirect to login, preserving the return URL
      router.replace(`/login?callbackUrl=/join/${code}`);
      return;
    }
    if (!code || code.length < 4) {
      useUIStore.getState().showToast('Invalid join link', 'error');
      router.replace('/directory');
      return;
    }
    if (!attempted) {
      setAttempted(true);
      setJoining(true);
      sendWsMessage({ type: 'call:join_by_code', payload: { code, userId: session.user.id } });
      // Timeout fallback
      setTimeout(() => setJoining(false), 10000);
    }
  }, [sessionStatus, session, code, router, attempted]);

  return (
    <div className="fixed inset-0 bg-[var(--bg-void)] flex items-center justify-center z-[200]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-2xl p-8 flex flex-col items-center gap-5 max-w-sm w-full mx-4"
      >
        <div className="text-4xl">🔗</div>
        <h1 className="text-xl font-bold text-white">Joining Call</h1>
        {code && (
          <div className="px-4 py-2 rounded-full bg-[var(--cyan)]/15 border border-[var(--cyan)]/30 text-[var(--cyan)] text-lg font-bold tracking-widest">
            {code}
          </div>
        )}
        {joining ? (
          <p className="text-[var(--text-secondary)] text-sm animate-pulse">Connecting…</p>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full">
            <p className="text-[var(--text-secondary)] text-sm text-center">
              Could not join. The code may be invalid or the call has ended.
            </p>
            <GlassButton variant="active" onClick={() => router.push('/directory')} className="w-full justify-center">
              Back to Directory
            </GlassButton>
          </div>
        )}
      </motion.div>
    </div>
  );
}
