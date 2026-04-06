'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useCallStore } from '@/stores/callStore';
import { useUIStore } from '@/stores/uiStore';

interface UseWebRTCOptions {
  roomId: string | null;
  onSendSignal: (type: string, payload: Record<string, unknown>) => void;
  /** @deprecated kept for backward compat — ignored, peers are discovered via room:peers/room:peer_joined */
  peerId?: string | null;
}

export interface PeerInfo {
  userId: string;
  username: string;
  avatar: string | null;
  muted: boolean;
  cameraOff: boolean;
  isSpeaking: boolean;
}

interface PeerConn {
  pc: RTCPeerConnection;
  screenStream: MediaStream | null;
  contentSender: RTCRtpSender | null;
}

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
  }
  return servers;
}

const ICE_SERVERS = buildIceServers();
const SPEAKING_THRESHOLD = 10;

/** Prefer VP9 codec by reordering SDP m=video payload types */
function preferCodec(sdp: string, codec: string): string {
  const lines = sdp.split('\r\n');
  const mVideoIdx = lines.findIndex((l) => l.startsWith('m=video'));
  if (mVideoIdx === -1) return sdp;
  const codecLine = lines.find((l) => new RegExp(`a=rtpmap:\\d+ ${codec}/`, 'i').test(l));
  if (!codecLine) return sdp;
  const pt = codecLine.match(/a=rtpmap:(\d+)/)?.[1];
  if (!pt) return sdp;
  const parts = lines[mVideoIdx].split(' ');
  const header = parts.slice(0, 3);
  const payloads = parts.slice(3).filter((p) => p !== pt);
  lines[mVideoIdx] = [...header, pt, ...payloads].join(' ');
  return lines.join('\r\n');
}

export function useWebRTC({ onSendSignal }: UseWebRTCOptions) {
  // Multi-peer: one RTCPeerConnection per remote userId
  const peerConnsRef = useRef<Map<string, PeerConn>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'fair' | 'poor' | null>(null);

  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakerDetectRef = useRef<Map<string, { analyser: AnalyserNode; ctx: AudioContext }>>(new Map());
  const contentStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [contentStreams, setContentStreams] = useState<Map<string, MediaStream>>(new Map());
  const bitrateRampRef = useRef<{ current: number; target: number; intervalId: ReturnType<typeof setInterval> | null }>({ current: 1_200_000, target: 1_200_000, intervalId: null });

  // ─── helpers ────────────────────────────────────────────────────────────────

  const startSpeakingDetection = useCallback((userId: string, stream: MediaStream) => {
    if (speakerDetectRef.current.has(userId)) return;
    try {
      if (!stream.getAudioTracks().length) return;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      speakerDetectRef.current.set(userId, { analyser, ctx });
    } catch { /* ignore */ }
  }, []);

  const buildPC = useCallback((userId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ontrack = (event) => {
      // If a second video track arrives from this peer, route it to contentStreams
      const existingRemote = remoteStreamsRef.current.get(userId);
      if (event.track.kind === 'video' && (existingRemote?.getVideoTracks().length ?? 0) > 0) {
        const contentStream = contentStreamsRef.current.get(userId) ?? new MediaStream();
        if (!contentStream.getTrackById(event.track.id)) contentStream.addTrack(event.track);
        contentStreamsRef.current.set(userId, contentStream);
        setContentStreams(new Map(contentStreamsRef.current));
        // Clean up when track ends (screen share stopped by remote)
        event.track.onended = () => {
          contentStream.removeTrack(event.track);
          if (!contentStream.getTracks().length) contentStreamsRef.current.delete(userId);
          setContentStreams(new Map(contentStreamsRef.current));
        };
        return;
      }
      const existing = existingRemote ?? new MediaStream();
      event.streams[0]?.getTracks().forEach((t) => {
        if (!existing.getTrackById(t.id)) existing.addTrack(t);
      });
      remoteStreamsRef.current.set(userId, existing);
      setRemoteStreams(new Map(remoteStreamsRef.current));
      startSpeakingDetection(userId, existing);
    };

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        onSendSignal('signal:ice', {
          to: userId,
          callId: useCallStore.getState().callId,
          candidate: evt.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        useCallStore.getState().setStatus('active');
      } else if (pc.iceConnectionState === 'failed') {
        useUIStore.getState().showToast('Peer connection failed — retrying…', 'info');
        pc.createOffer({ iceRestart: true })
          .then((o) => { pc.setLocalDescription(o); onSendSignal('signal:offer', { to: userId, callId: useCallStore.getState().callId, sdp: o }); })
          .catch(() => {});
      }
    };

    peerConnsRef.current.set(userId, { pc, screenStream: null, contentSender: null });
    return pc;
  }, [onSendSignal, startSpeakingDetection]);

  const getOrBuildPC = useCallback((userId: string): RTCPeerConnection => {
    return peerConnsRef.current.get(userId)?.pc ?? buildPC(userId);
  }, [buildPC]);

  const addPeerInfo = useCallback((userId: string, username: string, avatar: string | null) => {
    setPeers((prev) => {
      if (prev.has(userId)) return prev;
      const next = new Map(prev);
      next.set(userId, { userId, username, avatar, muted: false, cameraOff: false, isSpeaking: false });
      return next;
    });
  }, []);

  // ─── stream ─────────────────────────────────────────────────────────────────

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch {
      useUIStore.getState().showToast('Camera access denied. Audio-only mode.', 'error');
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        return audioStream;
      } catch {
        return null;
      }
    }
  }, []);

  // ─── signaling ──────────────────────────────────────────────────────────────

  const createOfferForPeer = useCallback(async (userId: string) => {
    if (!localStreamRef.current) return;
    const pc = getOrBuildPC(userId);
    if (!peerConnsRef.current.get(userId)) peerConnsRef.current.set(userId, { pc, screenStream: null, contentSender: null });

    localStreamRef.current.getTracks().forEach((track) => {
      if (!pc.getSenders().find((s) => s.track === track)) {
        pc.addTrack(track, localStreamRef.current!);
      }
    });

    let offer = await pc.createOffer();
    offer = new RTCSessionDescription({ type: offer.type, sdp: preferCodec(offer.sdp ?? '', 'VP9') });
    await pc.setLocalDescription(offer);
    onSendSignal('signal:offer', { to: userId, callId: useCallStore.getState().callId, sdp: offer, iceServers: ICE_SERVERS });
  }, [getOrBuildPC, onSendSignal]);

  const createAnswerForPeer = useCallback(async (userId: string, offer: RTCSessionDescriptionInit) => {
    if (!localStreamRef.current) await startLocalStream();
    if (!localStreamRef.current) return;
    const pc = getOrBuildPC(userId);
    if (!peerConnsRef.current.get(userId)) peerConnsRef.current.set(userId, { pc, screenStream: null, contentSender: null });

    localStreamRef.current.getTracks().forEach((track) => {
      if (!pc.getSenders().find((s) => s.track === track)) {
        pc.addTrack(track, localStreamRef.current!);
      }
    });

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    let answer = await pc.createAnswer();
    answer = new RTCSessionDescription({ type: answer.type, sdp: preferCodec(answer.sdp ?? '', 'VP9') });
    await pc.setLocalDescription(answer);
    onSendSignal('signal:answer', { to: userId, callId: useCallStore.getState().callId, sdp: answer });
  }, [getOrBuildPC, startLocalStream, onSendSignal]);

  const handleRemoteAnswer = useCallback(async (userId: string, sdp: RTCSessionDescriptionInit) => {
    const conn = peerConnsRef.current.get(userId);
    if (!conn) return;
    try { await conn.pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch { /* ignore */ }
  }, []);

  const handleIceCandidate = useCallback(async (userId: string, candidate: RTCIceCandidateInit) => {
    const conn = peerConnsRef.current.get(userId);
    if (!conn) return;
    try { await conn.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
  }, []);

  const removePeer = useCallback((userId: string) => {
    const conn = peerConnsRef.current.get(userId);
    if (conn) { conn.pc.close(); peerConnsRef.current.delete(userId); }
    remoteStreamsRef.current.delete(userId);
    setRemoteStreams(new Map(remoteStreamsRef.current));
    setPeers((prev) => { const n = new Map(prev); n.delete(userId); return n; });
    const d = speakerDetectRef.current.get(userId);
    if (d) { d.ctx.close().catch(() => {}); speakerDetectRef.current.delete(userId); }
  }, []);

  // ─── event listeners ────────────────────────────────────────────────────────

  useEffect(() => {
    const onOffer = async (e: Event) => {
      const { from, sdp } = (e as CustomEvent).detail;
      addPeerInfo(from, 'Peer', null);
      await createAnswerForPeer(from, sdp);
    };
    const onAnswer = async (e: Event) => {
      const { from, sdp } = (e as CustomEvent).detail;
      await handleRemoteAnswer(from, sdp);
    };
    const onIce = async (e: Event) => {
      const { from, candidate } = (e as CustomEvent).detail;
      await handleIceCandidate(from, candidate);
    };
    const onPeers = async (e: Event) => {
      const { peers: existingPeers } = (e as CustomEvent).detail as {
        peers: Array<{ userId: string; username: string; avatar: string | null }>;
      };
      for (const peer of existingPeers) {
        addPeerInfo(peer.userId, peer.username, peer.avatar);
        buildPC(peer.userId);
        await createOfferForPeer(peer.userId);
      }
    };
    const onPeerJoined = async (e: Event) => {
      const { userId, username, avatar } = (e as CustomEvent).detail;
      addPeerInfo(userId, username ?? 'User', avatar ?? null);
      buildPC(userId);
      await createOfferForPeer(userId);
    };
    const onPeerLeft = (e: Event) => { removePeer((e as CustomEvent).detail.userId); };
    const onPeerState = (e: Event) => {
      const { userId, muted, cameraOff } = (e as CustomEvent).detail;
      setPeers((prev) => {
        const n = new Map(prev);
        const p = n.get(userId);
        if (p) n.set(userId, { ...p, muted, cameraOff });
        return n;
      });
    };

    window.addEventListener('webrtc:offer', onOffer);
    window.addEventListener('webrtc:answer', onAnswer);
    window.addEventListener('webrtc:ice', onIce);
    window.addEventListener('webrtc:peers', onPeers);
    window.addEventListener('webrtc:peer_joined', onPeerJoined);
    window.addEventListener('webrtc:peer_left', onPeerLeft);
    window.addEventListener('webrtc:peer_state', onPeerState);

    return () => {
      window.removeEventListener('webrtc:offer', onOffer);
      window.removeEventListener('webrtc:answer', onAnswer);
      window.removeEventListener('webrtc:ice', onIce);
      window.removeEventListener('webrtc:peers', onPeers);
      window.removeEventListener('webrtc:peer_joined', onPeerJoined);
      window.removeEventListener('webrtc:peer_left', onPeerLeft);
      window.removeEventListener('webrtc:peer_state', onPeerState);
    };
  }, [createAnswerForPeer, handleRemoteAnswer, handleIceCandidate, buildPC, createOfferForPeer, removePeer, addPeerInfo]);

  // ─── speaking detection ──────────────────────────────────────────────────────

  useEffect(() => {
    speakIntervalRef.current = setInterval(() => {
      const data = new Uint8Array(128);
      let dominantUser: string | null = null;
      let maxVol = SPEAKING_THRESHOLD;
      speakerDetectRef.current.forEach(({ analyser }, uid) => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > maxVol) { maxVol = avg; dominantUser = uid; }
      });
      setActiveSpeakerId(dominantUser);
      setPeers((prev) => {
        const n = new Map(prev);
        prev.forEach((p, uid) => n.set(uid, { ...p, isSpeaking: uid === dominantUser }));
        return n;
      });
    }, 200);
    return () => { if (speakIntervalRef.current) clearInterval(speakIntervalRef.current); };
  }, []);

  // ─── controls ────────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const newMuted = !audioTrack.enabled;
      useCallStore.getState().toggleMute();
      const { callId } = useCallStore.getState();
      if (callId) onSendSignal('room:peer_state', { callId, muted: newMuted, cameraOff: useCallStore.getState().isCameraOff });
    }
  }, [onSendSignal]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const newCameraOff = !videoTrack.enabled;
      useCallStore.getState().toggleCamera();
      const { callId } = useCallStore.getState();
      if (callId) onSendSignal('room:peer_state', { callId, muted: useCallStore.getState().isMuted, cameraOff: newCameraOff });
    }
  }, [onSendSignal]);

  const stopScreenShare = useCallback(() => {
    peerConnsRef.current.forEach((conn, uid) => {
      conn.screenStream?.getTracks().forEach((t) => t.stop());
      conn.screenStream = null;
      if (conn.contentSender) {
        conn.pc.removeTrack(conn.contentSender);
        conn.contentSender = null;
      }
      onSendSignal('signal:content_track', { to: uid, callId: useCallStore.getState().callId, hasContent: false });
    });
    contentStreamsRef.current.clear();
    setContentStreams(new Map());
    useCallStore.getState().toggleScreenShare();
  }, [onSendSignal]);

  const startScreenShare = useCallback(async () => {
    if (typeof (navigator.mediaDevices as { getDisplayMedia?: unknown }).getDisplayMedia === 'undefined') {
      useUIStore.getState().showToast('Screen sharing is not available on this device.', 'error');
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenVideoTrack = screenStream.getVideoTracks()[0];
      peerConnsRef.current.forEach((conn, uid) => {
        if (screenVideoTrack) {
          conn.contentSender = conn.pc.addTrack(screenVideoTrack, screenStream);
        }
        conn.screenStream = screenStream;
        onSendSignal('signal:content_track', { to: uid, callId: useCallStore.getState().callId, hasContent: true });
      });
      screenVideoTrack.onended = () => stopScreenShare();
      useCallStore.getState().toggleScreenShare();
    } catch {
      useUIStore.getState().showToast('Screen sharing not available.', 'error');
    }
  }, [onSendSignal, stopScreenShare]);

  const endCall = useCallback(() => {
    peerConnsRef.current.forEach((conn) => conn.pc.close());
    peerConnsRef.current.clear();
    remoteStreamsRef.current.clear();
    contentStreamsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    speakerDetectRef.current.forEach(({ ctx }) => ctx.close().catch(() => {}));
    speakerDetectRef.current.clear();
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (speakIntervalRef.current) clearInterval(speakIntervalRef.current);
    if (bitrateRampRef.current.intervalId) { clearInterval(bitrateRampRef.current.intervalId); bitrateRampRef.current.intervalId = null; }
    setLocalStream(null);
    setRemoteStreams(new Map());
    setContentStreams(new Map());
    setPeers(new Map());
    setActiveSpeakerId(null);
    setConnectionQuality(null);
  }, []);

  const applyVideoBitrate = useCallback((bitrate: number) => {
    peerConnsRef.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings?.[0]) return;
      params.encodings[0].maxBitrate = bitrate;
      sender.setParameters(params).catch(() => {});
    });
  }, []);

  const adaptBitrate = useCallback((quality: string | null) => {
    const bitrateMap: Record<string, number> = { excellent: 2_500_000, good: 1_500_000, fair: 800_000, poor: 350_000 };
    const target = quality ? (bitrateMap[quality] ?? 1_200_000) : 1_200_000;
    const ramp = bitrateRampRef.current;
    if (target <= ramp.current) {
      // Quality degraded: instant drop (voice priority — never buffer on a poor link)
      if (ramp.intervalId) { clearInterval(ramp.intervalId); ramp.intervalId = null; }
      ramp.current = target;
      ramp.target = target;
      applyVideoBitrate(target);
    } else {
      // Quality improved: gradual 10s recovery ramp (~10% of gap per second)
      ramp.target = target;
      if (!ramp.intervalId) {
        ramp.intervalId = setInterval(() => {
          const step = Math.max((ramp.target - ramp.current) * 0.1, 10_000);
          ramp.current = Math.min(ramp.current + step, ramp.target);
          applyVideoBitrate(Math.round(ramp.current));
          if (ramp.current >= ramp.target) {
            clearInterval(ramp.intervalId!);
            ramp.intervalId = null;
          }
        }, 1000);
      }
    }
  }, [applyVideoBitrate]);

  const setAudioBitrate = useCallback((kbps: number) => {
    peerConnsRef.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings?.[0]) return;
      params.encodings[0].maxBitrate = kbps * 1000;
      sender.setParameters(params).catch(() => {});
    });
  }, []);

  const monitorConnectionQuality = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    statsIntervalRef.current = setInterval(async () => {
      const first = peerConnsRef.current.values().next().value;
      if (!first) return;
      try {
        const stats = await first.pc.getStats();
        let packetsLost = 0; let packetsReceived = 0; let rtt = 0;
        stats.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') { packetsLost += r.packetsLost ?? 0; packetsReceived += r.packetsReceived ?? 0; }
          if (r.type === 'candidate-pair' && r.state === 'succeeded') rtt = Math.max(rtt, (r.currentRoundTripTime ?? 0) * 1000);
        });
        const loss = packetsReceived > 0 ? packetsLost / packetsReceived : 0;
        let q: 'excellent' | 'good' | 'fair' | 'poor';
        if (loss < 0.02 && rtt < 100) q = 'excellent';
        else if (loss < 0.05 && rtt < 200) q = 'good';
        else if (loss < 0.10 && rtt < 400) q = 'fair';
        else q = 'poor';
        setConnectionQuality(q);
        adaptBitrate(q);
      } catch { /* ignore */ }
    }, 4000);
  }, [adaptBitrate]);

  // Legacy compat: call page calls createPeerConnection; with multi-peer it's a no-op
  const createPeerConnection = useCallback(async () => {}, []);

  // cleanup on unmount
  useEffect(() => () => { endCall(); }, [endCall]);

  const firstRemoteStream = remoteStreams.values().next().value ?? null;

  return {
    localStream,
    remoteStream: firstRemoteStream,   // backward compat for 1:1 layout
    remoteStreams,
    contentStreams,
    peers,
    activeSpeakerId,
    connectionQuality,
    createPeerConnection,
    startLocalStream,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    endCall,
    monitorConnectionQuality,
    adaptBitrate,
    setAudioBitrate,
  };
}
