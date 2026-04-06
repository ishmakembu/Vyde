'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Avatar } from '@/components/ui/Avatar';

interface CallHistoryItem {
  id: string;
  peerId: string;
  peerUsername: string;
  peerAvatarColor: string | null;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  status: 'completed' | 'missed' | 'declined';
  isIncoming: boolean;
}

export default function HistoryPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['call-history'],
    queryFn: async () => {
      const res = await fetch('/api/calls/history');
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
  });

  const history: CallHistoryItem[] = historyData?.calls || [];

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="badge badge-success">Answered</span>;
      case 'missed':
        return <span className="badge badge-danger">Missed</span>;
      case 'declined':
        return <span className="badge">Declined</span>;
      default:
        return null;
    }
  };

  if (!mounted) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-6">Call History</h1>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass rounded-lg h-16 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">Call History</h1>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass rounded-lg h-16 animate-pulse" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          No call history yet
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-lg p-4 flex items-center gap-4"
            >
              <Avatar 
                username={item.peerUsername} 
                size="md" 
                showPresence={false}
              />
              
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">{item.peerUsername}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {item.isIncoming ? 'Incoming' : 'Outgoing'} • {formatDate(item.startedAt)}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[12px] font-mono text-[var(--text-secondary)]">
                  {formatDuration(item.duration)}
                </div>
                <div className="mt-1">
                  {getStatusBadge(item.status)}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}