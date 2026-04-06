import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type CallStatus = 'idle' | 'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended';

interface CallState {
  status: CallStatus;
  callId: string | null;
  roomId: string | null;
  peerId: string | null;
  peerUsername: string | null;
  peerAvatar: string | null;
  startedAt: Date | null;
  duration: number;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isMusicOpen: boolean;
  controlsVisible: boolean;
  pipActive: boolean;
  pipPosition: { x: number; y: number };
  joinCode: string | null;
  incomingCall: {
    callId: string;
    callerId: string;
    callerUsername: string;
    callerAvatar: string | null;
  } | null;
  setStatus: (status: CallState['status']) => void;
  setCallId: (callId: string | null) => void;
  setRoomId: (roomId: string | null) => void;
  setPeerInfo: (peerId: string, peerUsername: string, peerAvatar: string | null) => void;
  setStartedAt: (startedAt: Date | null) => void;
  setDuration: (duration: number) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  toggleChat: () => void;
  toggleParticipants: () => void;
  toggleMusic: () => void;
  setControlsVisible: (visible: boolean) => void;
  setPipActive: (active: boolean) => void;
  setPipPosition: (position: { x: number; y: number }) => void;
  setJoinCode: (code: string | null) => void;
  setIncomingCall: (incoming: CallState['incomingCall']) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>()(
  subscribeWithSelector((set) => ({
    status: 'idle',
    callId: null,
    roomId: null,
    peerId: null,
    peerUsername: null,
    peerAvatar: null,
    startedAt: null,
    duration: 0,
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    isChatOpen: false,
    isParticipantsOpen: false,
    isMusicOpen: false,
    controlsVisible: true,
    pipActive: false,
    pipPosition: { x: 0, y: 0 },
    joinCode: null,
    incomingCall: null,
    setStatus: (status) => set({ status }),
    setJoinCode: (joinCode) => set({ joinCode }),
    setCallId: (callId) => set({ callId }),
    setRoomId: (roomId) => set({ roomId }),
    setPeerInfo: (peerId, peerUsername, peerAvatar) =>
      set({ peerId, peerUsername, peerAvatar }),
    setStartedAt: (startedAt) => set({ startedAt }),
    setDuration: (duration) => set({ duration }),
    toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
    toggleCamera: () => set((state) => ({ isCameraOff: !state.isCameraOff })),
    toggleScreenShare: () => set((state) => ({ isScreenSharing: !state.isScreenSharing })),
    toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
    toggleParticipants: () =>
      set((state) => ({ isParticipantsOpen: !state.isParticipantsOpen })),
    toggleMusic: () => set((state) => ({ isMusicOpen: !state.isMusicOpen })),
    setControlsVisible: (controlsVisible) => set({ controlsVisible }),
    setPipActive: (pipActive) => set({ pipActive }),
    setPipPosition: (pipPosition) => set({ pipPosition }),
    setIncomingCall: (incomingCall) => set({ incomingCall }),
    resetCall: () =>
      set({
        status: 'idle',
        callId: null,
        roomId: null,
        peerId: null,
        peerUsername: null,
        peerAvatar: null,
        startedAt: null,
        duration: 0,
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false,
        isChatOpen: false,
        isParticipantsOpen: false,
        isMusicOpen: false,
        controlsVisible: true,
        pipActive: false,
        pipPosition: { x: 0, y: 0 },
        joinCode: null,
        incomingCall: null,
      }),
  }))
);
