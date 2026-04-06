'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { GlassButton } from '@/components/ui/GlassButton';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { sendWsMessage } from '@/hooks/useWebSocket';
import { useCallStore } from '@/stores/callStore';
import { useUIStore } from '@/stores/uiStore';

type TabType = 'requests' | 'friends' | 'blocked';

interface Friend {
  id: string;
  username: string;
  avatarColor: string | null;
  status: string | null;
  statusEmoji: string | null;
  lastSeen: string;
}

export default function FriendsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const queryClient = useQueryClient();
  const router = useRouter();
  const { status: callStatus } = useCallStore();

  const handleCall = (user: Friend) => {
    const roomId = `room-${Date.now()}`;
    const callId = `call-${Date.now()}`;
    useCallStore.getState().setCallId(callId);
    useCallStore.getState().setRoomId(roomId);
    useCallStore.getState().setPeerInfo(user.id, user.username, null);
    useCallStore.getState().setStatus('ringing');
    sendWsMessage({ type: 'call:initiate', payload: { calleeId: user.id, roomId, callId } });
    router.push('/call');
  };

  const { data: friendsData } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const res = await fetch('/api/friends');
      if (!res.ok) throw new Error('Failed to fetch friends');
      return res.json();
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'accept' }),
      });
      if (!res.ok) throw new Error('Failed to accept');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'decline' }),
      });
      if (!res.ok) throw new Error('Failed to decline');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'unblock' }),
      });
      if (!res.ok) throw new Error('Failed to unblock');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const friends: Friend[] = friendsData?.friends || [];
  const requests: Friend[] = friendsData?.requests || [];
  const blocked: Friend[] = friendsData?.blocked || [];

  const { userPresenceMap } = useUIStore();
  const [now, setNow] = useState(0);
  
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);
  
  // Use real-time WS presence map first, fall back to DB lastSeen
  const isOnline = (userId: string, lastSeen: string) => {
    const presence = userPresenceMap[userId];
    if (presence !== undefined) return presence.online;
    return new Date(lastSeen).getTime() > now - 30000;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex gap-2 mb-6">
        {(['requests', 'friends', 'blocked'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide transition-all',
              activeTab === tab
                ? 'badge'
                : 'glass text-[var(--text-secondary)] hover:text-white'
            )}
          >
            {tab === 'requests' && requests.length > 0 && (
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--cyan)] mr-2" />
            )}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">
              No pending requests
            </div>
          ) : (
            requests.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-lg p-4 flex items-center gap-4"
              >
                <Avatar username={user.username} size="md" showPresence={isOnline(user.id, user.lastSeen)} isOnline={isOnline(user.id, user.lastSeen)} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">{user.username}</div>
                </div>
                <div className="flex gap-2">
                  <GlassButton 
                    variant="active" 
                    size="sm"
                    onClick={() => acceptMutation.mutate(user.id)}
                    disabled={acceptMutation.isPending}
                  >
                    Accept
                  </GlassButton>
                  <GlassButton 
                    variant="default" 
                    size="sm"
                    onClick={() => declineMutation.mutate(user.id)}
                    disabled={declineMutation.isPending}
                  >
                    Decline
                  </GlassButton>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {activeTab === 'friends' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {friends.length === 0 ? (
            <div className="col-span-full text-center py-12 text-[var(--text-secondary)]">
              No friends yet
            </div>
          ) : (
            friends.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-[var(--bg-surface-md)] transition-all"
              >
                <Avatar username={user.username} size="lg" showPresence={isOnline(user.id, user.lastSeen)} isOnline={isOnline(user.id, user.lastSeen)} />
                <div className="text-center">
                  <div className="text-sm font-semibold text-white">{user.username}</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {isOnline(user.id, user.lastSeen) ? 'Online' : 'Offline'}
                  </div>
                </div>
                <GlassButton
                  variant="active"
                  size="sm"
                  className="w-full"
                  onClick={() => handleCall(user)}
                  disabled={callStatus !== 'idle' || !isOnline(user.id, user.lastSeen)}
                  title={!isOnline(user.id, user.lastSeen) ? 'User is offline' : callStatus !== 'idle' ? 'Already in a call' : 'Start video call'}
                >
                  📞 Call
                </GlassButton>
              </motion.div>
            ))
          )}
        </div>
      )}

      {activeTab === 'blocked' && (
        <div className="space-y-3">
          {blocked.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-secondary)]">
              No blocked users
            </div>
          ) : (
            blocked.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-lg p-4 flex items-center gap-4"
              >
                <Avatar username={user.username} size="md" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">{user.username}</div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">Blocked</div>
                </div>
                <GlassButton
                  variant="default"
                  size="sm"
                  onClick={() => unblockMutation.mutate(user.id)}
                  disabled={unblockMutation.isPending}
                >
                  Unblock
                </GlassButton>
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  );
}