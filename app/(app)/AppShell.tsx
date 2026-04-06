'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { MobileNav } from '@/components/ui/MobileNav';
import { Toast } from '@/components/ui/Toast';
import { useUIStore } from '@/stores/uiStore';
import { useWebSocket, sendWsMessage } from '@/hooks/useWebSocket';
import { IncomingCallModal } from '@/components/call/IncomingCallModal';
import { useCallStore } from '@/stores/callStore';
import { useRouter } from 'next/navigation';

function NotificationBell() {
  const { notifications, unreadNotifCount, markAllNotificationsRead } = useUIStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (unreadNotifCount > 0) {
      // Mark all as read in the store immediately; fire-and-forget to API
      markAllNotificationsRead();
      fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {});
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--bg-hover)] transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadNotifCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 glass-dark border border-[var(--border-glass)] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-glass)] flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-[var(--text-tertiary)] hover:text-white"
              >
                Close
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'px-4 py-3 border-b border-[var(--border-glass)] last:border-0',
                    !n.read && 'bg-[var(--cyan-dim)]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">
                      {n.type === 'missed_call' ? '📞' : n.type === 'friend_request' ? '👤' : n.type === 'friend_accepted' ? '✅' : '🔔'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{n.title}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{n.body}</p>
                      {n.type === 'friend_request' && (
                        <Link
                          href="/friends"
                          onClick={() => setOpen(false)}
                          className="text-xs text-[var(--cyan)] mt-1 inline-block hover:underline"
                        >
                          View requests →
                        </Link>
                      )}
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                        {new Date(n.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children, username }: { children: React.ReactNode; username: string }) {
  useWebSocket(); // single persistent WS connection for the entire authenticated session
  const pathname = usePathname();
  const { searchQuery, setSearchQuery } = useUIStore();
  const router = useRouter();
  const { incomingCall, setIncomingCall, setStatus: setCallStatus, setPeerInfo, setCallId, setRoomId } = useCallStore();

  // Handle programmatic navigation dispatched by WS handlers (e.g. join-by-code)
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (path) router.push(path);
    };
    window.addEventListener('vide:nav', handler);
    return () => window.removeEventListener('vide:nav', handler);
  }, [router]);

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    
    // Send signaling message
    sendWsMessage({ 
      type: 'call:accept', 
      payload: { callId: incomingCall.callId, roomId: '' } 
    });

    // Update store state
    setCallId(incomingCall.callId);
    setPeerInfo(incomingCall.callerId, incomingCall.callerUsername, incomingCall.callerAvatar);
    setCallStatus('connecting');
    setIncomingCall(null);
    
    // Navigate to call page
    router.push('/call');
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    
    // Send signaling message
    sendWsMessage({ 
      type: 'call:decline', 
      payload: { callId: incomingCall.callId } 
    });

    // Update store state
    setCallStatus('idle');
    setIncomingCall(null);
  };

  return (
    <>
      <Toast />
      {incomingCall && (
        <IncomingCallModal
          callerId={incomingCall.callerId}
          callerUsername={incomingCall.callerUsername}
          callerAvatar={incomingCall.callerAvatar}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}
      <div className="min-h-screen w-full bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[rgba(0,80,120,0.15)] blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[20%] right-[20%] w-[500px] h-[500px] bg-[rgba(80,0,120,0.12)] blur-[100px] rounded-full"></div>
        </div>

        <header className="fixed top-0 left-0 right-0 h-14 z-50 glass-dark border-b border-[var(--border-glass)] flex items-center justify-between px-5">
          <Link href="/directory" className="logo logo-sm">Vide</Link>

          <div className="flex-1 max-w-[320px] mx-4 hidden md:block">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 rounded-full bg-[var(--bg-surface)] border border-[var(--border-glass)] pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-cyan)]"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="hidden md:block text-right mr-2">
              <div className="text-sm font-medium">{username}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">Online</div>
            </div>
            <Avatar username={username} size="md" showPresence isOnline />
          </div>
        </header>

        <aside className="fixed left-0 top-14 bottom-0 w-[72px] md:w-[220px] glass-dark border-r border-[var(--border-glass)] z-40 hidden md:flex flex-col py-4">
          <nav className="flex-1 px-2.5 space-y-1">
            <NavItem icon="🏠" label="Home" href="/directory" active={pathname === '/directory'} />
            <NavItem icon="👥" label="Friends" href="/friends" active={pathname === '/friends'} />
            <NavItem icon="📞" label="History" href="/history" active={pathname === '/history'} />
            <NavItem icon="👤" label="Profile" href="/profile" active={pathname === '/profile'} />
          </nav>
        </aside>

        <main className="pt-14 md:pl-[72px] md:ml-[220px] min-h-screen pb-20 md:pb-0">
          {children}
        </main>

        <MobileNav />
      </div>
    </>
  );
}

function NavItem({ icon, label, href, active }: { icon: string; label: string; href: string; active?: boolean }) {
  return (
    <Link 
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
        active 
          ? "bg-[var(--cyan-dim)] text-[var(--cyan)] border-r-2 border-[var(--cyan)]" 
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white"
      )}
    >
      <span className="text-lg">{icon}</span>
      <span className="hidden md:block text-sm">{label}</span>
    </Link>
  );
}