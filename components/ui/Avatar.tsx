"use client";

import { cn } from "@/lib/utils";

export interface AvatarProps {
  username: string;
  size?: "sm" | "md" | "lg" | "xl";
  showPresence?: boolean;
  isOnline?: boolean;
  isSpeaking?: boolean;
  isInCall?: boolean;
  className?: string;
}

const AVATAR_PALETTES = [
  { bg: "rgba(0,229,255,0.18)", color: "#00e5ff" },
  { bg: "rgba(192,132,252,0.18)", color: "#c084fc" },
  { bg: "rgba(74,222,128,0.18)", color: "#4ade80" },
  { bg: "rgba(251,191,36,0.18)", color: "#fbbf24" },
  { bg: "rgba(249,115,22,0.18)", color: "#f97316" },
  { bg: "rgba(236,72,153,0.18)", color: "#ec4899" },
];

function getAvatarColor(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    const char = username.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function getInitials(username: string): string {
  const parts = username.split(/[\s_-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

const sizes = {
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-xs",
  lg: "w-12 h-12 text-sm",
  xl: "w-[72px] h-[72px] text-lg",
};

export function Avatar({
  username,
  size = "md",
  showPresence = false,
  isOnline = false,
  isSpeaking = false,
  isInCall = false,
  className,
}: AvatarProps) {
  const palette = getAvatarColor(username);
  const initials = getInitials(username);
  const sizeClass = sizes[size];

  return (
    <div className={cn("relative inline-flex", className)}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-semibold",
          sizeClass
        )}
        style={{ backgroundColor: palette.bg, color: palette.color }}
      >
        {initials}
      </div>

      {showPresence && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-[#080a10]",
            isInCall ? "bg-amber-400" : isOnline ? "bg-[var(--cyan)]" : "bg-gray-500",
            isInCall && "shadow-[0_0_8px_rgba(251,191,36,0.8)]",
            isOnline && !isInCall && "shadow-[0_0_8px_rgba(0,229,255,0.8)]",
            size === "sm" ? "w-2 h-2" : size === "md" ? "w-2.5 h-2.5" : "w-3 h-3"
          )}
        />
      )}

      {isSpeaking && (
        <span
          className={cn(
            "absolute -inset-1 rounded-full animate-[speak-pulse_1.2s_ease-in-out_infinite]",
            "ring-2 ring-[var(--cyan)] ring-offset-2 ring-offset-[#080a10]"
          )}
        />
      )}
    </div>
  );
}