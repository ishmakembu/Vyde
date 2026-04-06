'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { probeBandwidth } from '@/lib/bandwidthProbe';

export type BandwidthTier = 'high' | 'medium' | 'low' | 'unknown';

export interface BandwidthState {
  kbps: number | null;
  tier: BandwidthTier;
  isProbing: boolean;
}

const HIGH_KBPS = 2000;
const MEDIUM_KBPS = 500;

function getTier(kbps: number | null): BandwidthTier {
  if (kbps === null) return 'unknown';
  if (kbps >= HIGH_KBPS) return 'high';
  if (kbps >= MEDIUM_KBPS) return 'medium';
  return 'low';
}

/**
 * Runs a bandwidth probe immediately and then every `intervalMs` (default 60s).
 * Returns the current estimate and tier so callers can adapt quality settings.
 */
export function useBandwidth(intervalMs = 60_000): BandwidthState & { probe: () => void } {
  const [state, setState] = useState<BandwidthState>({
    kbps: null,
    tier: 'unknown',
    isProbing: false,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const probe = useCallback(async () => {
    setState((s) => ({ ...s, isProbing: true }));
    const kbps = await probeBandwidth();
    setState({ kbps, tier: getTier(kbps), isProbing: false });
  }, []);

  useEffect(() => {
    // Initial probe
    probe();

    // Periodic re-probe
    timerRef.current = setInterval(probe, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [probe, intervalMs]);

  return { ...state, probe };
}
