'use client';

import React, { useRef, useEffect, memo } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { useTileRegistry } from '@/components/call/TileRegistry';

export interface VideoTileProps {
  stream: MediaStream | null;
  username: string;
  userId?: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSpeaking?: boolean;
  isLocal?: boolean;
  frameTheme?: string;
  className?: string;
}

/** Deterministic hue (0–359) from a userId string */
function userHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export const VideoTile = memo(function VideoTile({
  stream,
  username,
  userId,
  isMuted,
  isCameraOff,
  isSpeaking,
  isLocal,
  className,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { registerTile } = useTileRegistry();

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Register this tile so RemoteReactionsOverlay can find coordinates
  useEffect(() => {
    if (!userId || isLocal) return;
    const el = containerRef.current;
    registerTile(userId, el);
    return () => registerTile(userId, null);
  }, [userId, isLocal, registerTile]);

  // Per-user tint ring — subtle HSL color unique to each participant
  const tintStyle: React.CSSProperties = userId && !isSpeaking
    ? { boxShadow: `0 0 0 1.5px hsla(${userHue(userId)}, 65%, 65%, 0.35)` }
    : {};

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative rounded-xl overflow-hidden bg-[var(--bg-surface)] transition-all duration-200',
        isSpeaking && 'frame-glow ring-2 ring-[var(--cyan)] shadow-[0_0_20px_rgba(0,229,255,0.45)]',
        className,
      )}
      style={tintStyle}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!!isLocal}
        className={cn(
          'w-full h-full object-cover',
          isLocal && 'scale-x-[-1]',
          (isCameraOff || !stream) && 'hidden',
        )}
      />

      {(isCameraOff || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-surface)]">
          <Avatar username={username} size="lg" />
        </div>
      )}

      {/* Speaking ring pulse overlay */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-xl ring-2 ring-[var(--cyan)] pointer-events-none speaking-ring" />
      )}

      {/* Name/status bar */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-white leading-none max-w-full truncate">
          {username}{isMuted && ' 🔇'}
        </div>
        {isSpeaking && (
          <div className="bg-[var(--cyan)] rounded-full w-2 h-2 animate-pulse ml-1 shrink-0" />
        )}
      </div>
    </div>
  );
});
