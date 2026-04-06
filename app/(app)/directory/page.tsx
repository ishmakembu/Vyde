'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { useCallStore } from '@/stores/callStore';
import { useUIStore } from '@/stores/uiStore';
import { sendWsMessage } from '@/hooks/useWebSocket';
import { Phone, UserPlus, UserCheck, Clock, PhoneOff, Copy, Link2 } from 'lucide-react';

interface User {
  id: string;
  username: string;
  avatar: string | null;
  avatarColor: string | null;
  status: string | null;
  statusEmoji: string | null;
  isPrivate: boolean;
  lastSeen: string;
}

interface UserCardProps {
  user: User;
  onCall: (user: User) => void;
  onAddFriend: (userId: string) => void;
  isFriend: boolean;
  hasPendingRequest: boolean;
  isOnline: boolean;
  isInCall: boolean;
  isSelf: boolean;
  isLoadingFriend: boolean;
}

function UserCard({ user, onCall, onAddFriend, isFriend, hasPendingRequest, isOnline, isInCall, isSelf, isLoadingFriend }: UserCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="glass rounded-lg p-4 flex flex-col items-center gap-2.5 cursor-pointer hover:bg-[var(--bg-surface-md)] hover:border-[var(--border-glass-md)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
    >
      <Link href={`/users/${user.id}`} className="flex flex-col items-center w-full">
        <div className="relative">
          {user.avatar ? (
            <Image
              src={user.avatar}
              alt={user.username}
              width={48}
              height={48}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <Avatar username={user.username} size="lg" />
          )}
          {isOnline && (
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${
                isInCall
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : 'bg-[var(--cyan)] shadow-[0_0_8px_rgba(0,229,255,0.8)]'
              }`}
              title={isInCall ? 'In a call' : 'Online'}
            />
          )}
        </div>
      </Link>

      <div className="text-center">
        <Link href={`/users/${user.id}`}>
          <div className="text-sm font-semibold text-white">{user.username}</div>
        </Link>
        <div className="text-[11px] text-[var(--text-secondary)] italic truncate max-w-[120px]">
          {user.statusEmoji && `${user.statusEmoji} `}{user.status || (isOnline ? 'Online' : 'Offline')}
        </div>
      </div>

      {!isSelf && (
        <div className="flex gap-2 w-full mt-1">
          {isFriend ? (
            <>
              <GlassButton
                onClick={(e) => { e.preventDefault(); onCall(user); }}
                variant={isOnline && !isInCall ? 'active' : 'default'}
                size="sm"
                className="flex-1"
                disabled={!isOnline || isInCall}
                title={isInCall ? 'In a call' : 'Call'}
              >
                <Phone className="w-3.5 h-3.5" />
              </GlassButton>
              <GlassButton variant="default" size="sm" disabled className="flex-1" title="Friends">
                <UserCheck className="w-3.5 h-3.5" />
              </GlassButton>
            </>
          ) : hasPendingRequest ? (
            <GlassButton variant="default" size="sm" className="flex-1" disabled title="Pending request">
              <Clock className="w-3.5 h-3.5" />
            </GlassButton>
          ) : (
            <>
              <GlassButton
                onClick={(e) => { e.preventDefault(); onCall(user); }}
                variant={isOnline && !isInCall ? 'active' : 'default'}
                size="sm"
                disabled={!isOnline || isInCall}
                className="flex-1"
                title={isInCall ? 'In a call' : 'Call'}
              >
                <Phone className="w-3.5 h-3.5" />
              </GlassButton>
              <GlassButton
                onClick={(e) => { e.preventDefault(); onAddFriend(user.id); }}
                variant="default"
                size="sm"
                className="flex-1"
                disabled={isLoadingFriend}
                title="Add friend"
              >
                <UserPlus className="w-3.5 h-3.5" />
              </GlassButton>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default function DirectoryPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { incomingCall } = useCallStore();
  const { userPresenceMap, searchQuery, setSearchQuery } = useUIStore();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);
  const [createCallLoading, setCreateCallLoading] = useState(false);
  const [createdCallInfo, setCreatedCallInfo] = useState<{ callId: string; code: string } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Stop join-spinner once WS responds
  useEffect(() => {
    const onGranted = () => setJoiningCode(false);
    const onError = () => setJoiningCode(false);
    window.addEventListener('vide:nav', onGranted);
    return () => { window.removeEventListener('vide:nav', onGranted); };
  }, []);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: friendsData } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const res = await fetch('/api/friends');
      if (!res.ok) throw new Error('Failed to fetch friends');
      return res.json();
    },
  });

  const addFriendMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'add' }),
      });
      if (!res.ok) throw new Error('Failed to add friend');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const handleAddFriend = (userId: string) => {
    addFriendMutation.mutate(userId);
  };

  const users: User[] = usersData?.users || [];
  const friendIds = new Set((friendsData?.friends || []).map((f: { id: string }) => f.id));
  const pendingSentIds = new Set((friendsData?.requestsSent || []).map((f: { id: string }) => f.id));
  
  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const [now, setNow] = useState(0);
  
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  // Presence map from real-time WS events takes priority; fall back to DB lastSeen
  const isUserOnline = (user: User) => {
    const presence = userPresenceMap[user.id];
    if (presence !== undefined) return presence.online;
    return new Date(user.lastSeen).getTime() > now - 30000;
  };

  const onlineUsers = filteredUsers.filter(isUserOnline);
  const offlineUsers = filteredUsers.filter((user) => !isUserOnline(user));

  function makeJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  const handleCreateCall = async () => {
    if (!session?.user?.id) return;
    setCreateCallLoading(true);
    const callId = `call-${Date.now()}`;
    const roomId = `room-${Date.now()}`;
    const code = makeJoinCode();
    useCallStore.getState().setCallId(callId);
    useCallStore.getState().setRoomId(roomId);
    useCallStore.getState().setJoinCode(code);
    useCallStore.getState().setStatus('connecting');
    // Register the room + code on the server
    sendWsMessage({ type: 'call:create', payload: { callId, roomId, code } });
    router.push('/call');
    setCreateCallLoading(false);
  };

  const handleJoinByCode = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code || code.length < 4) return;
    setJoiningCode(true);
    sendWsMessage({ type: 'call:join_by_code', payload: { code, userId: session?.user?.id } });
    // Result comes back as call:join_granted or call:join_error via WS handler
    // Set a timeout to stop loading if no response
    setTimeout(() => setJoiningCode(false), 8000);
  };

  const handleCall = (user: User) => {
    if (!session?.user?.id) return;
    const roomId = `room-${Date.now()}`;
    const callId = `call-${Date.now()}`;
    useCallStore.getState().setCallId(callId);
    useCallStore.getState().setRoomId(roomId);
    useCallStore.getState().setPeerInfo(user.id, user.username, user.avatar ?? null);
    useCallStore.getState().setStatus('ringing');
    sendWsMessage({ type: 'call:initiate', payload: { calleeId: user.id, roomId, callId } });
    router.push('/call');
  };

  if (!mounted) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="h-11 rounded-full bg-[var(--bg-surface)] border border-[var(--border-glass)] mb-6 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="glass rounded-lg h-[180px] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">

        {/* ── Join / Create call panel ──────────────────────────────────── */}
        <div className="glass rounded-xl p-4 mb-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Create new call */}
          <GlassButton
            variant="active"
            onClick={handleCreateCall}
            disabled={createCallLoading}
            className="shrink-0 gap-2"
          >
            <Phone className="w-4 h-4" />
            New Call
          </GlassButton>

          <div className="h-px sm:h-6 sm:w-px bg-[var(--border-glass)] self-stretch sm:self-auto" />

          {/* Join by code */}
          <div className="flex flex-1 gap-2">
            <GlassInput
              placeholder="Enter join code (e.g. AB12CD)"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput((e.target.value).toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              className="flex-1 !mb-0 uppercase tracking-widest"
              maxLength={8}
            />
            <GlassButton
              variant="default"
              onClick={handleJoinByCode}
              disabled={joiningCode || joinCodeInput.trim().length < 4}
              className="gap-2 shrink-0"
            >
              <Link2 className="w-4 h-4" />
              {joiningCode ? 'Joining…' : 'Join'}
            </GlassButton>
          </div>
        </div>

        <GlassInput
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-6"
        />

        {usersLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="glass rounded-lg h-[180px] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {onlineUsers.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Online</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">({onlineUsers.length})</span>
                  <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {onlineUsers.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      onCall={handleCall}
                      onAddFriend={handleAddFriend}
                      isFriend={friendIds.has(user.id)}
                      hasPendingRequest={pendingSentIds.has(user.id)}
                      isOnline={true}
                      isInCall={!!userPresenceMap[user.id]?.inCall}
                      isSelf={user.id === session?.user?.id}
                      isLoadingFriend={addFriendMutation.isPending}
                    />
                  ))}
                </div>
              </section>
            )}

            {offlineUsers.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Offline</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">({offlineUsers.length})</span>
                  <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {offlineUsers.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      onCall={handleCall}
                      onAddFriend={handleAddFriend}
                      isFriend={friendIds.has(user.id)}
                      hasPendingRequest={pendingSentIds.has(user.id)}
                      isOnline={false}
                      isInCall={!!userPresenceMap[user.id]?.inCall}
                      isSelf={user.id === session?.user?.id}
                      isLoadingFriend={addFriendMutation.isPending}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-[var(--text-secondary)]">
                No users found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}