'use client';

import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '@/stores/callStore';
import { sendWsMessage } from '@/hooks/useWebSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoTile } from '@/components/call/VideoTile';
import { TileRegistryProvider, RemoteReactionsOverlay } from '@/components/call/TileRegistry';
import { useMusic } from '@/hooks/useMusic';
import { useSession } from 'next-auth/react';
import { IconButton } from '@/components/ui/GlassButton';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { Copy } from 'lucide-react';

const ChatPanel = lazy(() => import('@/components/chat/ChatPanel').then((m) => ({ default: m.ChatPanel })));
const ReactionsPanel = lazy(() => import('@/components/call/ReactionsPanel').then((m) => ({ default: m.ReactionsPanel })));
const MusicPlayer = lazy(() => import('@/components/call/MusicPlayer').then((m) => ({ default: m.MusicPlayer })));

const isIOS = typeof window !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function CallPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const theatreRemoteRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const {
    status,
    callId,
    joinCode,
    isMuted,
    isCameraOff,
    isScreenSharing,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    peerUsername,
  } = useCallStore();

  const {
    localStream,
    remoteStream,
    remoteStreams,
    contentStreams,
    peers,
    activeSpeakerId,
    connectionQuality,
    createPeerConnection,
    startLocalStream,
    toggleMute: webrtcToggleMute,
    toggleCamera: webrtcToggleCamera,
    endCall,
    monitorConnectionQuality,
    setAudioBitrate,
  } = useWebRTC({
    roomId: null,
    onSendSignal: (type, payload) => sendWsMessage({ type, payload }),
  });

  const music = useMusic(callId, session?.user?.id ?? null, sendWsMessage);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [duration, setDuration] = useState(0);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [theatreMode, setTheatreMode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const canScreenShare = typeof navigator !== 'undefined' &&
    typeof (navigator.mediaDevices as { getDisplayMedia?: unknown })?.getDisplayMedia === 'function' &&
    !isIOS;

  const canPiP = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;

  const isTheatre = isScreenSharing && theatreMode;
  const remotePeerIds = Array.from(remoteStreams.keys());
  const isGroupCall = remotePeerIds.length > 1;
  const firstContentStream = contentStreams.values().next().value ?? null;

  // Auto-enter theatre mode when screen sharing starts
  useEffect(() => {
    if (isScreenSharing) setTheatreMode(true);
    else setTheatreMode(false);
  }, [isScreenSharing]);

  // Screen wake lock: keep screen on during a call
  useEffect(() => {
    if (status === 'active' || status === 'connecting') {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((lock) => {
          wakeLockRef.current = lock;
        }).catch(() => {});
      }
    }
    return () => {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    if (status === 'connecting' || status === 'active') {
      startLocalStream();
      createPeerConnection();
      monitorConnectionQuality();
    }
    return () => { endCall(); };
  }, [status, startLocalStream, createPeerConnection, endCall, monitorConnectionQuality]);

  useEffect(() => {
    if (status === 'idle' || status === 'ended') {
      router.replace('/directory');
    }
  }, [status, router]);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Theatre: mirror content stream (screen share) or first remote stream into theatre ref
  useEffect(() => {
    const src = firstContentStream ?? remoteStream;
    if (src && theatreRemoteRef.current) {
      theatreRemoteRef.current.srcObject = src;
    }
  }, [firstContentStream, remoteStream]);

  useEffect(() => {
    if (status === 'active') {
      const interval = setInterval(() => setDuration((d) => d + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Raise audio bitrate to 320 kbps (Opus hi-fi) while DJ music plays
  useEffect(() => {
    setAudioBitrate(music.playing ? 320 : 32);
  }, [music.playing, setAudioBitrate]);

  const handleMouseMove = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!reactionsOpen && !showChat) setControlsVisible(false);
    }, 4000);
  };

  const handleEndCall = () => {
    if (callId) {
      sendWsMessage({ type: 'call:end', payload: { callId } });
      fetch(`/api/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended', endedAt: new Date().toISOString(), duration }),
      }).catch(() => {});
    }
    endCall();
    useCallStore.getState().resetCall();
    router.push('/directory');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (status === 'idle' || status === 'ended') return null;

  // ── Outgoing ringing screen ───────────────────────────────────────────────
  if (status === 'ringing' && !useCallStore.getState().incomingCall) {
    return (
      <div className="fixed inset-0 bg-[var(--bg-void)] z-[100] flex flex-col items-center justify-center gap-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative z-10 flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-24 h-24 rounded-full animate-pulse">
              <Avatar username={peerUsername || 'User'} size="xl" />
            </div>
            {[1, 2, 3].map((ring) => (
              <div
                key={ring}
                className="absolute inset-0 rounded-full border border-[var(--cyan)] opacity-30 animate-ping"
                style={{ animationDelay: `${ring * 0.3}s`, transform: `scale(${1 + ring * 0.25})` }}
              />
            ))}
          </div>
          <h2 className="text-2xl font-bold text-white">{peerUsername || 'Calling…'}</h2>
          <p className="text-[var(--text-secondary)] text-sm animate-pulse">Ringing…</p>
        </motion.div>
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={() => {
            if (callId) sendWsMessage({ type: 'call:cancel', payload: { callId } });
            useCallStore.getState().resetCall();
            router.replace('/directory');
          }}
          className="z-10 w-16 h-16 rounded-full bg-[var(--danger)] flex items-center justify-center shadow-lg hover:brightness-110 transition-all"
        >
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </motion.button>
      </div>
    );
  }

  if (status !== 'active' && status !== 'connecting') return null;

  // ── Active call ───────────────────────────────────────────────────────────
  return (
    <TileRegistryProvider>
    <div
      className="fixed inset-0 bg-[var(--bg-void)] z-[100] flex overflow-hidden"
      style={{ height: '100dvh' }}
      onMouseMove={handleMouseMove}
      onTouchStart={() => setControlsVisible(true)}
    >
      {/* ── Theatre content area ─────────────────────────────────────────────── */}
      {isTheatre ? (
        <div className="flex w-full h-full">
          {/* Content (full or screen-share) — left 75%, full-width on mobile */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={theatreRemoteRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
            {!remoteStream && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-[var(--text-secondary)] text-sm">Waiting for stream…</span>
              </div>
            )}
          </div>

          {/* Sidebar — right 25%, stacks below on mobile */}
          <div className="w-[25%] min-w-[160px] max-w-[260px] hidden md:flex bg-[var(--bg-void)] border-l border-[var(--border-glass)] flex-col z-20">
            {/* Remote face */}
            <div className="flex-1 relative overflow-hidden border-b border-[var(--border-glass)]">
              <VideoTile
                stream={remoteStream}
                username={peers.values().next().value?.username ?? peerUsername ?? 'Peer'}
                userId={remotePeerIds[0]}
                isMuted={peers.values().next().value?.muted}
                isCameraOff={peers.values().next().value?.cameraOff}
                isSpeaking={activeSpeakerId === remotePeerIds[0]}
                className="w-full h-full rounded-none"
              />
            </div>
            {/* Local face */}
            <div className="flex-1 relative overflow-hidden">
              <VideoTile
                stream={localStream}
                username="You"
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                isLocal
                className="w-full h-full rounded-none"
              />
            </div>
            {/* Drift indicator */}
            {music.syncDrift > 500 && (
              <div className="px-3 py-1.5 flex items-center gap-2 bg-amber-950/50 border-t border-amber-700/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[11px] text-amber-300">{Math.round(music.syncDrift / 1000)}s drift</span>
              </div>
            )}
            <button
              onClick={() => setTheatreMode(false)}
              className="px-3 py-2 text-[11px] font-bold text-[var(--text-secondary)] hover:text-white border-t border-[var(--border-glass)] transition-colors"
            >
              Exit Theatre
            </button>
          </div>

          {/* Mobile theatre: floating face row at bottom */}
          <div className="absolute bottom-20 left-2 right-2 flex gap-2 md:hidden z-20">
            <VideoTile
              stream={remoteStream}
              username={peers.values().next().value?.username ?? peerUsername ?? 'Peer'}
              userId={remotePeerIds[0]}
              isSpeaking={activeSpeakerId === remotePeerIds[0]}
              className="h-24 w-32 shrink-0"
            />
            <VideoTile
              stream={localStream}
              username="You"
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              isLocal
              className="h-24 w-32 shrink-0"
            />
          </div>
        </div>
      ) : isGroupCall ? (
        /* ── Multi-participant grid ───────────────────────────────────────── */
        <div className="absolute inset-0 p-2 pt-14 pb-20 z-0">
          <div className={cn(
            'w-full h-full grid gap-2',
            remotePeerIds.length === 1 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2',
            remotePeerIds.length >= 5 ? 'grid-cols-3' : '',
          )}>
            {/* Remote participants */}
            {remotePeerIds.map((uid) => {
              const peer = peers.get(uid);
              return (
                <VideoTile
                  key={uid}
                  stream={remoteStreams.get(uid) ?? null}
                  username={peer?.username ?? 'Peer'}
                  userId={uid}
                  isMuted={peer?.muted}
                  isCameraOff={peer?.cameraOff}
                  isSpeaking={activeSpeakerId === uid}
                  className="w-full h-full"
                />
              );
            })}
            {/* Local tile */}
            <VideoTile
              stream={localStream}
              username="You"
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              isLocal
              className="w-full h-full"
            />
            {/* Add person tile */}
            <button
              onClick={() => {/* TODO: invite person */ }}
              className="flex flex-col items-center justify-center bg-[var(--bg-surface)] rounded-xl border-2 border-dashed border-[var(--border-glass)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--cyan)] transition-all gap-2"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-[11px] font-semibold">Add person</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── 1:1 layout: remote full-screen, self floating ───────────────── */
        <div className="absolute inset-0 z-0">
          <VideoTile
            stream={remoteStream}
            username={peers.values().next().value?.username ?? peerUsername ?? 'Peer'}
            userId={remotePeerIds[0]}
            isMuted={peers.values().next().value?.muted}
            isCameraOff={peers.values().next().value?.cameraOff}
            isSpeaking={activeSpeakerId === remotePeerIds[0]}
            className="w-full h-full rounded-none"
          />
          {!remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-[var(--bg-surface)] flex items-center justify-center mb-4 mx-auto animate-pulse">
                  <svg className="w-10 h-10 text-[var(--cyan)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-1">Connecting...</h2>
                <p className="text-xs text-[var(--text-secondary)]">Establishing connection</p>
              </div>
            </div>
          )}

          {/* Self-view floating thumbnail */}
          <div className="absolute top-20 right-4 w-[140px] md:w-[180px] lg:w-[220px] aspect-video rounded-lg overflow-hidden glass-md shadow-lg z-20">
            <VideoTile
              stream={localStream}
              username="You"
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              isLocal
              className="w-full h-full rounded-none"
            />
          </div>
        </div>
      )}

      {/* ── Gradient overlays ───────────────────────────────────────────────── */}
      {!isTheatre && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[var(--bg-void)] to-transparent" />
          <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[var(--bg-void)] to-transparent" />
        </div>
      )}

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 h-12 glass flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2 h-2 rounded-full',
            connectionQuality === 'poor' ? 'bg-amber-400' : 'bg-[var(--cyan)]',
          )} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            {status === 'connecting' ? 'CONNECTING' : 'LIVE'}
          </span>
        </div>
        <div className="text-[12px] font-mono text-[var(--text-secondary)]">
          {formatDuration(duration)}
        </div>
        <div className="flex items-center gap-2">
          {connectionQuality && (
            <span className={cn('badge', connectionQuality === 'excellent' && 'badge-success')}>
              {connectionQuality.toUpperCase()}
            </span>
          )}
          {joinCode && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(joinCode).catch(() => {});
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 2000);
              }}
              title="Copy join code"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--cyan)]/15 border border-[var(--cyan)]/30 text-[var(--cyan)] text-[11px] font-bold tracking-widest hover:bg-[var(--cyan)]/25 transition-colors"
            >
              {codeCopied ? '✓ Copied' : `${joinCode}`}
              {!codeCopied && <Copy className="w-3 h-3 opacity-70" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <main className="relative z-20 flex flex-col justify-end h-full pointer-events-none">
        <div
          className="pointer-events-auto w-full px-4 pb-6 flex flex-col items-center gap-3"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="glass rounded-full px-6 py-3 flex items-center justify-center gap-3 flex-wrap"
              >
                <IconButton
                  variant={isMuted ? 'danger' : 'default'}
                  onClick={() => { webrtcToggleMute(); toggleMute(); }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isMuted ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    )}
                  </svg>
                </IconButton>

                <IconButton
                  variant={isCameraOff ? 'danger' : 'default'}
                  onClick={() => { webrtcToggleCamera(); toggleCamera(); }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </IconButton>

                {canScreenShare && (
                  <IconButton
                    variant={isScreenSharing ? 'active' : 'default'}
                    onClick={() => {
                      if (isScreenSharing) {
                        import('@/hooks/useWebRTC').then(({ useWebRTC: _u }) => {});
                      }
                      toggleScreenShare();
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </IconButton>
                )}

                {isScreenSharing && (
                  <IconButton
                    variant={theatreMode ? 'active' : 'default'}
                    onClick={() => setTheatreMode(!theatreMode)}
                    title="Toggle Theatre Mode"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                    </svg>
                  </IconButton>
                )}

                {canPiP && (
                  <IconButton
                    variant="default"
                    title="Picture-in-Picture"
                    onClick={() => {
                      const el = document.querySelector('video[autoplay]:not([muted])') as HTMLVideoElement | null;
                      if (el && document.pictureInPictureElement !== el) {
                        el.requestPictureInPicture().catch(() => {});
                      } else if (document.pictureInPictureElement) {
                        document.exitPictureInPicture().catch(() => {});
                      }
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </IconButton>
                )}

                <div className="w-px h-6 bg-[var(--border-glass)]" />

                <IconButton variant="primary" onClick={handleEndCall}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                </IconButton>

                <div className="w-px h-6 bg-[var(--border-glass)]" />

                <IconButton
                  variant={reactionsOpen ? 'active' : 'default'}
                  onClick={() => setReactionsOpen(!reactionsOpen)}
                >
                  <span className="text-lg">😀</span>
                </IconButton>

                <IconButton
                  variant={showChat ? 'active' : 'default'}
                  onClick={() => setShowChat(!showChat)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </IconButton>

                <IconButton
                  variant={showMusic ? 'active' : 'default'}
                  onClick={() => setShowMusic(!showMusic)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </IconButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ── Panels ──────────────────────────────────────────────────────────── */}
      <Suspense fallback={null}>
        <ReactionsPanel isOpen={reactionsOpen} onClose={() => setReactionsOpen(false)} />
        <ChatPanel isOpen={showChat} onClose={() => setShowChat(false)} nowPlaying={music.track ?? undefined} />
        <MusicPlayer isOpen={showMusic} onClose={() => setShowMusic(false)} music={music} />
      </Suspense>

      {/* Remote emoji reactions float from each sender's tile */}
      <RemoteReactionsOverlay />
    </div>
    </TileRegistryProvider>
  );
}

