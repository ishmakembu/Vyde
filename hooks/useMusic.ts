'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';

/** Drift threshold before a listener auto-seeks to re-sync */
const SYNC_TOLERANCE_MS = 500;

export interface MusicTrack {
  url: string;
  title: string;
  artist?: string;
  albumArt?: string;
  duration: number; // seconds
}

interface MusicHookState {
  track: MusicTrack | null;
  playing: boolean;
  position: number;
  isDJ: boolean;
  djUserId: string | null;
  localVolume: number; // 0–1
  isLoading: boolean;
  syncDrift: number; // ms — how far listener's playhead is from DJ
}

export interface MusicControls extends MusicHookState {
  loadTrack: (track: MusicTrack) => void;
  play: () => void;
  pause: () => void;
  seek: (position: number) => void;
  stopTrack: () => void;
  setLocalVolume: (vol: number) => void;
  /** Returns the Web Audio MediaStream so it can be injected as a WebRTC audio track */
  getMusicStream: () => MediaStream | null;
}

export function useMusic(
  callId: string | null,
  userId: string | null,
  sendWS: (msg: { type: string; payload: unknown }) => void,
): MusicControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<MusicHookState>({
    track: null,
    playing: false,
    position: 0,
    isDJ: false,
    djUserId: null,
    localVolume: 0.8,
    isLoading: false,
    syncDrift: 0,
  });

  // ------------------------------------------------------------------
  // Audio graph helpers
  // ------------------------------------------------------------------

  const ensureContext = useCallback((): {
    ctx: AudioContext;
    dest: MediaStreamAudioDestinationNode;
    gain: GainNode;
  } => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      gain.connect(dest);       // goes out via WebRTC
      gain.connect(ctx.destination); // also heard locally
      audioCtxRef.current = ctx;
      destRef.current = dest;
      gainRef.current = gain;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return {
      ctx: audioCtxRef.current,
      dest: destRef.current!,
      gain: gainRef.current!,
    };
  }, []);

  const connectElement = useCallback(
    (audio: HTMLAudioElement) => {
      const { ctx, gain } = ensureContext();
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch { /* ignore */ }
        sourceRef.current = null;
      }
      const src = ctx.createMediaElementSource(audio);
      src.connect(gain);
      sourceRef.current = src;
    },
    [ensureContext],
  );

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(() => {
      const t = audioRef.current?.currentTime;
      if (t != null && !isNaN(t)) setState((s) => ({ ...s, position: t }));
    }, 500);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startSyncBroadcast = useCallback(() => {
    if (syncIntervalRef.current) return;
    syncIntervalRef.current = setInterval(() => {
      const audio = audioRef.current;
      if (audio && callId) {
        sendWS({ type: 'music:seek', payload: { callId, timestamp: audio.currentTime } });
      }
    }, 2000);
  }, [callId, sendWS]);

  const stopSyncBroadcast = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  const getMusicStream = useCallback((): MediaStream | null => {
    return destRef.current?.stream ?? null;
  }, []);

  // ------------------------------------------------------------------
  // DJ actions
  // ------------------------------------------------------------------

  const loadTrack = useCallback(
    (track: MusicTrack) => {
      if (!callId || !userId) return;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setState((s) => ({
        ...s,
        track,
        playing: false,
        position: 0,
        isDJ: true,
        djUserId: userId,
        isLoading: true,
      }));
      const audio = new Audio();
      audio.src = track.url;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audio.oncanplaythrough = () => setState((s) => ({ ...s, isLoading: false }));
      audio.onerror = () => {
        setState((s) => ({ ...s, isLoading: false }));
        useUIStore.getState().showToast('Failed to load audio track', 'error');
      };
      audioRef.current = audio;
      connectElement(audio);
    },
    [callId, userId, connectElement],
  );

  const play = useCallback(() => {
    if (!callId || !userId) return;
    const audio = audioRef.current;
    if (!audio) return;
    ensureContext();
    audio
      .play()
      .then(() => {
        setState((s) => ({ ...s, playing: true }));
        startPolling();
        startSyncBroadcast();
        sendWS({
          type: 'music:play',
          payload: {
            callId,
            url: audio.src,
            title: state.track?.title,
            artist: state.track?.artist,
            albumArt: state.track?.albumArt,
            duration: state.track?.duration,
            timestamp: audio.currentTime,
          },
        });
      })
      .catch(() => {
        useUIStore.getState().showToast('Playback blocked by browser', 'error');
      });
  }, [callId, userId, state.track, sendWS, ensureContext, startPolling]);

  const pause = useCallback(() => {
    if (!callId || !userId) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setState((s) => ({ ...s, playing: false }));
    stopPolling();
    stopSyncBroadcast();
    sendWS({
      type: 'music:pause',
      payload: { callId, timestamp: audio.currentTime },
    });
  }, [callId, userId, sendWS, stopPolling]);

  const seek = useCallback(
    (position: number) => {
      if (!callId || !userId) return;
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = position;
      setState((s) => ({ ...s, position }));
      sendWS({ type: 'music:seek', payload: { callId, timestamp: position } });
    },
    [callId, userId, sendWS],
  );

  const stopTrack = useCallback(() => {
    if (!callId || !userId) return;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ''; }
    stopPolling();
    stopSyncBroadcast();
    setState((s) => ({
      track: null,
      playing: false,
      position: 0,
      isDJ: false,
      djUserId: null,
      localVolume: s.localVolume,
      isLoading: false,
      syncDrift: 0,
    }));
    sendWS({ type: 'music:stop', payload: { callId } });
  }, [callId, userId, sendWS, stopPolling]);

  const setLocalVolume = useCallback((vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    if (gainRef.current) gainRef.current.gain.value = v;
    setState((s) => ({ ...s, localVolume: v }));
  }, []);

  // ------------------------------------------------------------------
  // Listener: handle server-broadcast music:state events
  // ------------------------------------------------------------------

  const handleMusicState = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        url?: string;
        playing: boolean;
        timestamp: number;
        title?: string;
        artist?: string;
        albumArt?: string;
        duration?: number;
        initiatedBy?: string;
      };
      const { url, playing, timestamp, title, artist, albumArt, duration, initiatedBy } = detail;

      // Ignore our own events echoed back from server
      if (initiatedBy === userId) return;

      const track: MusicTrack = {
        url: url ?? state.track?.url ?? '',
        title: title ?? state.track?.title ?? 'Unknown',
        artist,
        albumArt,
        duration: duration ?? state.track?.duration ?? 0,
      };

      setState((s) => ({
        ...s,
        isDJ: false,
        djUserId: initiatedBy ?? null,
        track,
        playing,
        position: timestamp,
      }));

      // If URL changed (or no audio element), load fresh
      const audio = audioRef.current;
      const needLoad = !audio || (url != null && !audio.src.endsWith(url));
      if (needLoad && url) {
        if (audio) { audio.pause(); audio.src = ''; }
        const newAudio = new Audio();
        newAudio.src = url;
        newAudio.crossOrigin = 'anonymous';
        audioRef.current = newAudio;
        connectElement(newAudio);
        newAudio.oncanplaythrough = () => {
          newAudio.currentTime = timestamp;
          if (playing) {
            ensureContext();
            newAudio.play().catch(() => {});
            startPolling();
          }
        };
        return;
      }

      if (!audio) return;

      // Drift correction
      const drift = Math.abs(audio.currentTime - timestamp) * 1000;
      setState((s) => ({ ...s, syncDrift: drift }));
      if (drift > SYNC_TOLERANCE_MS) audio.currentTime = timestamp;

      if (playing && audio.paused) {
        ensureContext();
        audio.play().catch(() => {});
        startPolling();
      } else if (!playing && !audio.paused) {
        audio.pause();
        stopPolling();
      }
    },
    [userId, state.track, connectElement, ensureContext, startPolling, stopPolling],
  );

  useEffect(() => {
    window.addEventListener('music:state', handleMusicState);
    return () => window.removeEventListener('music:state', handleMusicState);
  }, [handleMusicState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      stopSyncBroadcast();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopPolling]);

  return {
    track: state.track,
    playing: state.playing,
    position: state.position,
    isDJ: state.isDJ,
    djUserId: state.djUserId,
    localVolume: state.localVolume,
    isLoading: state.isLoading,
    syncDrift: state.syncDrift,
    loadTrack,
    play,
    pause,
    seek,
    stopTrack,
    setLocalVolume,
    getMusicStream,
  };
}
