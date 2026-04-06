'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { GlassButton } from '@/components/ui/GlassButton';
import { sendWsMessage } from '@/hooks/useWebSocket';
import { useCallStore } from '@/stores/callStore';
import { useUIStore } from '@/stores/uiStore';

interface UserProfile {
  id: string;
  username: string;
  avatar: string | null;
  avatarColor: string | null;
  status: string | null;
  statusEmoji: string | null;
  bio: string | null;
  isPrivate: boolean;
  frameTheme: string;
  showLastSeen: boolean;
  showReadReceipts: boolean;
  createdAt: string;
  lastSeen: string;
  isFriend: boolean;
  friendStatus: 'none' | 'pending' | 'friends';
  canViewProfile: boolean;
}

const FRAME_LABELS: Record<string, string> = {
  default: 'Default',
  neon: '⚡ Neon',
  fire: '🔥 Fire',
  nature: '🌿 Nature',
  minimal: '◻ Minimal',
};

function formatLastSeen(lastSeen: string, now: number): string {
  const diff = now - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(lastSeen).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { data: session } = useSession();
  const { status: callStatus } = useCallStore();
  const { userPresenceMap } = useUIStore();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json() as Promise<UserProfile>;
    },
  });

  const addFriendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'add' }),
      });
      if (!res.ok) throw new Error('Failed to add friend');
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calleeId: userId }),
      });
      if (!res.ok) throw new Error('Failed to send notification');
      return res.json();
    },
    onSuccess: () => {
      useUIStore.getState().showToast(
        `Notification sent — ${profile?.username ?? 'They'} will see it when they come online`,
        'info'
      );
    },
    onError: () => {
      useUIStore.getState().showToast('Failed to send notification', 'error');
    },
  });

  const handleCall = () => {
    const roomId = `room-${Date.now()}`;
    const callId = `call-${Date.now()}`;
    useCallStore.getState().setCallId(callId);
    useCallStore.getState().setRoomId(roomId);
    useCallStore.getState().setPeerInfo(userId, profile?.username ?? 'User', profile?.avatar ?? null);
    useCallStore.getState().setStatus('ringing');
    sendWsMessage({ type: 'call:initiate', payload: { calleeId: userId, roomId, callId } });
    router.push('/call');
  };

  const handleChat = () => {
    const roomId = `room-${Date.now()}`;
    const callId = `call-${Date.now()}`;
    useCallStore.getState().setCallId(callId);
    useCallStore.getState().setRoomId(roomId);
    useCallStore.getState().setPeerInfo(userId, profile?.username ?? 'User', profile?.avatar ?? null);
    useCallStore.getState().setStatus('ringing');
    // Pre-open chat panel so it's visible as soon as the call connects
    if (!useCallStore.getState().isChatOpen) {
      useCallStore.getState().toggleChat();
    }
    sendWsMessage({ type: 'call:initiate', payload: { calleeId: userId, roomId, callId } });
    router.push('/call');
  };

  if (!mounted || isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="glass rounded-xl p-6 animate-pulse">
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-[var(--bg-surface)] mb-4" />
            <div className="h-6 w-32 bg-[var(--bg-surface)] rounded mb-2" />
            <div className="h-4 w-24 bg-[var(--bg-surface)] rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="glass rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-white">User not found</h2>
          <Link href="/directory" className="text-[var(--cyan)] mt-2 inline-block">
            ← Back to directory
          </Link>
        </div>
      </div>
    );
  }

  const isSelf = profile?.id === session?.user?.id;
  // Use real-time WS presence map first, fall back to DB lastSeen
  const presenceEntry = userPresenceMap[userId];
  const isOnline = presenceEntry !== undefined
    ? presenceEntry.online
    : profile ? new Date(profile.lastSeen).getTime() > now - 30000 : false;

  // Redirect self-viewing to the proper profile page
  if (isSelf) {
    router.replace('/profile');
    return null;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        href="/directory"
        className="text-[var(--text-secondary)] hover:text-white mb-4 inline-flex items-center gap-2 text-sm"
      >
        ← Back to directory
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-xl p-6 mt-4"
      >
        {!profile.canViewProfile ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-[var(--bg-surface)] mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">🔒</span>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Private Profile</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-4">
              This user&apos;s profile is private. Send a friend request to see more.
            </p>
            {profile.friendStatus !== 'friends' && (
              <GlassButton
                variant="active"
                onClick={() => addFriendMutation.mutate()}
                disabled={addFriendMutation.isPending || profile.friendStatus === 'pending'}
              >
                {profile.friendStatus === 'pending' ? 'Request Sent' : 'Add Friend'}
              </GlassButton>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {/* Avatar */}
            <div className="relative mb-4">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar}
                  alt={profile.username}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <Avatar username={profile.username} size="xl" />
              )}
              <div
                className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-[var(--bg-base)] ${
                  isOnline
                    ? 'bg-[var(--cyan)] shadow-[0_0_8px_rgba(0,229,255,0.8)]'
                    : 'bg-[var(--text-tertiary)]'
                }`}
              />
            </div>

            {/* Name + online badge */}
            <h1 className="text-2xl font-bold text-white">{profile.username}</h1>
            <span
              className={`mt-1 mb-1 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${
                isOnline
                  ? 'bg-[var(--cyan)]/15 text-[var(--cyan)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[var(--cyan)]' : 'bg-[var(--text-tertiary)]'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>

            {/* Status */}
            {(profile.statusEmoji || profile.status) && (
              <p className="text-[var(--text-secondary)] text-sm mt-2">
                {profile.statusEmoji && `${profile.statusEmoji} `}{profile.status}
              </p>
            )}

            {/* Bio */}
            {profile.bio && (
              <p className="text-[var(--text-secondary)] text-sm text-center mt-3 max-w-sm leading-relaxed">
                {profile.bio}
              </p>
            )}

            {/* Meta info row */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 mb-4">
              <span className="text-[var(--text-tertiary)] text-xs">
                Joined {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              {!isOnline && profile.showLastSeen && (
                <span className="text-[var(--text-tertiary)] text-xs">
                  Last seen {formatLastSeen(profile.lastSeen, now)}
                </span>
              )}
              {profile.frameTheme && profile.frameTheme !== 'default' && (
                <span className="text-[var(--text-tertiary)] text-xs">
                  Frame: {FRAME_LABELS[profile.frameTheme] ?? profile.frameTheme}
                </span>
              )}
            </div>

            <div className="flex gap-2 flex-wrap justify-center">
              {/* Friends: full Call + Chat + Notify */}
              {profile.friendStatus === 'friends' ? (
                <>
                  <GlassButton
                    variant="active"
                    onClick={handleCall}
                    disabled={callStatus !== 'idle' || !isOnline}
                    title={!isOnline ? 'User is offline' : callStatus !== 'idle' ? 'Already in a call' : 'Start video call'}
                  >
                    📞 Call
                  </GlassButton>
                  <GlassButton
                    variant="active"
                    onClick={handleChat}
                    disabled={callStatus !== 'idle' || !isOnline}
                    title={!isOnline ? 'User is offline' : callStatus !== 'idle' ? 'Already in a call' : 'Start chat'}
                  >
                    💬 Chat
                  </GlassButton>
                  {!isOnline && (
                    <GlassButton
                      variant="default"
                      onClick={() => notifyMutation.mutate()}
                      disabled={notifyMutation.isPending || notifyMutation.isSuccess}
                      title="Send a missed call notification — they'll see it when they come online"
                    >
                      {notifyMutation.isSuccess ? '✓ Notified' : notifyMutation.isPending ? 'Sending…' : '📳 Notify'}
                    </GlassButton>
                  )}
                </>
              ) : profile.friendStatus === 'pending' ? (
                /* Pending friend request */
                <GlassButton variant="default" disabled>
                  Request Sent
                </GlassButton>
              ) : !profile.isPrivate ? (
                /* Public profile (anyone can call) — show Call or Notify + Add Friend */
                <>
                  {isOnline ? (
                    <GlassButton
                      variant="active"
                      onClick={handleCall}
                      disabled={callStatus !== 'idle'}
                      title={callStatus !== 'idle' ? 'Already in a call' : 'Start video call'}
                    >
                      📞 Call
                    </GlassButton>
                  ) : (
                    <GlassButton
                      variant="default"
                      onClick={() => notifyMutation.mutate()}
                      disabled={notifyMutation.isPending || notifyMutation.isSuccess}
                      title="They're offline — notify them you tried to call"
                    >
                      {notifyMutation.isSuccess ? '✓ Notified' : notifyMutation.isPending ? 'Sending…' : '📳 Notify'}
                    </GlassButton>
                  )}
                  <GlassButton
                    variant="active"
                    onClick={() => addFriendMutation.mutate()}
                    disabled={addFriendMutation.isPending}
                  >
                    Add Friend
                  </GlassButton>
                </>
              ) : (
                /* Private profile — Add Friend only */
                <GlassButton
                  variant="active"
                  onClick={() => addFriendMutation.mutate()}
                  disabled={addFriendMutation.isPending}
                >
                  Add Friend
                </GlassButton>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
