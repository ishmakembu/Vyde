'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const AVATAR_COLORS = [
  { bg: 'rgba(0,229,255,0.18)', color: '#00e5ff', label: 'Cyan' },
  { bg: 'rgba(192,132,252,0.18)', color: '#c084fc', label: 'Purple' },
  { bg: 'rgba(74,222,128,0.18)', color: '#4ade80', label: 'Green' },
  { bg: 'rgba(251,191,36,0.18)', color: '#fbbf24', label: 'Amber' },
  { bg: 'rgba(249,115,22,0.18)', color: '#f97316', label: 'Orange' },
  { bg: 'rgba(236,72,153,0.18)', color: '#ec4899', label: 'Pink' },
];

const FRAME_THEMES = [
  { id: 'default', name: 'Default', gradient: 'from-[var(--cyan)] to-[var(--cyan)]' },
  { id: 'neon', name: 'Neon', gradient: 'from-cyan-400 to-purple-500' },
  { id: 'fire', name: 'Fire', gradient: 'from-orange-500 to-red-600' },
  { id: 'nature', name: 'Nature', gradient: 'from-green-400 to-emerald-600' },
  { id: 'minimal', name: 'Minimal', gradient: 'from-zinc-400 to-zinc-600' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'w-11 h-6 rounded-full transition-all duration-200 relative',
        checked ? 'bg-[var(--cyan-dim)]' : 'bg-[var(--bg-surface-md)]'
      )}
    >
      <div
        className={cn(
          'absolute top-1 w-4 h-4 rounded-full transition-all duration-200',
          checked
            ? 'left-6 bg-[var(--cyan)] shadow-[0_0_8px_rgba(0,229,255,0.8)]'
            : 'left-1 bg-[var(--text-tertiary)]'
        )}
      />
    </button>
  );
}

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [status, setStatus] = useState('');
  const [bio, setBio] = useState('');
  const [selectedAvatarColor, setSelectedAvatarColor] = useState(AVATAR_COLORS[0].color);
  const [selectedFrameTheme, setSelectedFrameTheme] = useState('default');
  const [mounted, setMounted] = useState(false);

  // Sync state with session data
  useEffect(() => {
    if (session?.user) {
      if (!isEditingStatus) setStatus(session.user.status || '');
      if (!isEditingBio) setBio(session.user.bio || '');
      setSelectedAvatarColor(session.user.avatarColor || AVATAR_COLORS[0].color);
      setSelectedFrameTheme(session.user.frameTheme || 'default');
      setSettings({ isPrivate: session.user.isPrivate || false });
    }
  }, [session, isEditingStatus, isEditingBio]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: callsData } = useQuery({
    queryKey: ['callHistory'],
    queryFn: async () => {
      const res = await fetch('/api/calls?limit=5');
      if (!res.ok) throw new Error('Failed to fetch calls');
      return res.json();
    },
    staleTime: 30000,
  });

  const [settings, setSettings] = useState({
    isPrivate: false,
  });

  const saveField = async (data: Record<string, any>) => {
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await update();
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch {
      // error
    }
  };

  const handleAvatarColorSelect = async (color: string) => {
    setSelectedAvatarColor(color);
    await saveField({ avatarColor: color });
  };

  const handleFrameThemeSelect = async (themeId: string) => {
    setSelectedFrameTheme(themeId);
    await saveField({ frameTheme: themeId });
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const handleSaveStatus = async () => {
    if (status === session?.user?.status) {
      setIsEditingStatus(false);
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await update();
        setIsEditingStatus(false);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      }
    } catch {
      // error
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBio = async () => {
    if (bio === session?.user?.bio) {
      setIsEditingBio(false);
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio }),
      });
      if (res.ok) {
        await update();
        setIsEditingBio(false);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      }
    } catch {
      // error
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrivacyChange = async (isPrivate: boolean) => {
    setSettings(s => ({ ...s, isPrivate }));
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrivate }),
      });
      await update();
    } catch {
      // error
    }
  };

  return (
    <div className="max-w-[600px] mx-auto p-6 pb-24">
      <div className="space-y-6">
        <section className="glass rounded-xl p-6 flex flex-col items-center text-center">
          <div className="relative group mb-4">
            <div className="w-20 h-20 rounded-full">
              <Avatar username={session?.user?.username || 'User'} size="xl" />
            </div>
            <button className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[var(--bg-surface-md)] border border-[var(--border-glass)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
              <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">{session?.user?.username}</h2>
          <p className="text-[12px] text-[var(--text-tertiary)] mb-3">
            Member since {mounted ? new Date(session?.user?.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '...'}
          </p>

          {isEditingStatus ? (
            <div className="flex gap-2 w-full max-w-[240px]">
              <GlassInput
                autoFocus
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveStatus()}
                placeholder="What's on your mind?"
                className="flex-1"
              />
              <GlassButton onClick={handleSaveStatus} disabled={isSaving} size="sm">
                Save
              </GlassButton>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingStatus(true)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--cyan)] transition-colors"
            >
              {status || 'Set your status'}
            </button>
          )}

          <AnimatePresence>
            {showSaved && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[10px] text-[var(--cyan)] uppercase tracking-widest mt-2">
                Saved
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="glass rounded-xl p-5">
          <h3 className="text-[14px] font-semibold text-white mb-3">Bio</h3>
          {isEditingBio ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell others about yourself..."
                className="w-full h-20 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg p-3 text-sm text-white placeholder-[var(--text-tertiary)] resize-none focus:outline-none focus:border-[var(--cyan)]"
                maxLength={500}
              />
              <div className="flex justify-end">
                <GlassButton onClick={handleSaveBio} disabled={isSaving} size="sm">
                  Save
                </GlassButton>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingBio(true)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--cyan)] transition-colors text-left w-full"
            >
              {bio || 'Add a bio...'}
            </button>
          )}
        </section>

        <section className="glass rounded-xl p-5">
          <h3 className="text-[14px] font-semibold text-white mb-4">Avatar Color</h3>
          <div className="flex gap-3 flex-wrap">
            {AVATAR_COLORS.map((color, i) => (
              <button
                key={i}
                onClick={() => handleAvatarColorSelect(color.color)}
                className={cn(
                  'w-9 h-9 rounded-full transition-all hover:scale-110 ring-2 ring-offset-2 ring-offset-transparent',
                  selectedAvatarColor === color.color
                    ? 'ring-white scale-110'
                    : 'ring-transparent'
                )}
                style={{ backgroundColor: color.bg }}
                title={color.label}
              >
                <span style={{ color: color.color }} className="text-xs font-bold">
                  {session?.user?.username?.[0]?.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="glass rounded-xl p-5">
          <h3 className="text-[14px] font-semibold text-white mb-4">Frame Theme</h3>
          <div className="grid grid-cols-5 gap-2">
            {FRAME_THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleFrameThemeSelect(theme.id)}
                className={cn(
                  'px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
                  'bg-gradient-to-r ' + theme.gradient,
                  'text-white',
                  selectedFrameTheme === theme.id
                    ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent scale-105'
                    : 'opacity-70 hover:opacity-100'
                )}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </section>

        <section className="glass rounded-xl p-5">
          <h3 className="text-[14px] font-semibold text-white mb-4">Privacy</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white">Public</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">Anyone can call you</div>
              </div>
              <Toggle
                checked={!settings.isPrivate}
                onChange={() => handlePrivacyChange(false)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white">Private</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">Only friends can call</div>
              </div>
              <Toggle
                checked={settings.isPrivate}
                onChange={() => handlePrivacyChange(true)}
              />
            </div>
          </div>
        </section>

        <section className="glass rounded-xl p-5">
          <h3 className="text-[14px] font-semibold text-white mb-4">Call History</h3>
          {!callsData ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-[var(--bg-surface)] animate-pulse" />
              ))}
            </div>
          ) : callsData.calls?.length === 0 ? (
            <div className="text-center py-6 text-[var(--text-secondary)] text-sm">
              No recent calls
            </div>
          ) : (
            <div className="space-y-2">
              {callsData.calls?.map((call: {
                id: string;
                status: string;
                duration: number | null;
                createdAt: string;
                caller: { id: string; username: string };
                callee: { id: string; username: string };
              }) => {
                const isCaller = call.caller.id === session?.user?.id;
                const peer = isCaller ? call.callee : call.caller;
                const durSec = call.duration ?? 0;
                const durStr = durSec > 0
                  ? `${Math.floor(durSec / 60)}m ${durSec % 60}s`
                  : call.status;
                return (
                  <div key={call.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-glass)]">
                    <div className="flex items-center gap-2.5">
                      <Avatar username={peer.username} size="sm" />
                      <div>
                        <div className="text-sm text-white">{peer.username}</div>
                        <div className="text-[11px] text-[var(--text-tertiary)]">
                          {isCaller ? 'Outgoing' : 'Incoming'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-[var(--text-secondary)]">{durStr}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        {new Date(call.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass rounded-xl p-5 border-[var(--border-danger)]">
          <h3 className="text-[14px] font-semibold text-[var(--text-danger)] mb-4">Danger Zone</h3>
          <GlassButton variant="danger" className="w-full" onClick={handleSignOut}>
            Sign Out
          </GlassButton>
        </section>
      </div>
    </div>
  );
}