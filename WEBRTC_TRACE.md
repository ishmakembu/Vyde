# WEBRTC TRACE

## WebRTC Lifecycle States

### 1. Initialization
- STATE: initial
- ACTION: useWebRTC hook initialized
- LOG: Peer connection object created with STUN servers

### 2. Local Stream Acquisition
- STATE: local_stream_requested
- ACTION: startLocalStream() called
- LOG: navigator.mediaDevices.getUserMedia() invoked

### 3. Peer Connection Creation
- STATE: peer_connection_creating
- ACTION: createPeerConnection() called
- LOG: RTCPeerConnection created with ICE servers

### 4. Offer Creation (Initiator)
- STATE: creating_offer
- ACTION: createOffer() called after local stream
- LOG: RTCSessionDescription created, set as local description
- PAYLOAD: SDP offer sent via WebSocket

### 5. Offer Reception (Receiver)
- STATE: offer_received
- ACTION: WebSocket event 'signal:offer' received
- LOG: SDP offer stored, createAnswer() initiated

### 6. Answer Creation (Receiver)
- STATE: creating_answer
- ACTION: createAnswer() called with received offer
- LOG: RTCSessionDescription answer created
- PAYLOAD: SDP answer sent via WebSocket

### 7. Answer Reception (Initiator)
- STATE: answer_received
- ACTION: WebSocket event 'signal:answer' received
- LOG: SDP answer set as remote description

### 8. ICE Candidate Exchange
- STATE: ice_candidate_generated
- ACTION: pc.onicecandidate callback triggered
- LOG: Each candidate sent via WebSocket signal:ice

### 9. ICE Reception
- STATE: ice_candidates_received
- ACTION: WebSocket event 'signal:ice' received
- LOG: pc.addIceCandidate() called for each candidate

### 10. Connection Established
- STATE: connection_established
- ACTION: pc.onconnectionstatechange → 'connected'
- LOG: ICE connection state changed to 'connected'
- LOG: pc.ontrack triggered with remote stream

### 11. Stream Active
- STATE: stream_active
- ACTION: Remote stream attached to video element
- LOG: setRemoteStream(state) called, UI updates

---

## Call State Transitions

### Idle → Ringing
- STATE: ringing
- TRIGGER: call:initiate sent
- LOG: IncomingCallModal shown

### Ringing → Connecting
- STATE: connecting
- TRIGGER: call:accept sent
- LOG: WebRTC hook initializing

### Connecting → Active
- STATE: active
- TRIGGER: Connection established
- LOG: Video elements shown, controls visible

### Active → Reconnecting
- STATE: reconnecting
- TRIGGER: ICE connection 'disconnected' or 'failed'
- LOG: handleReconnect() called, ICE restart

### Any → Ended
- STATE: ended
- TRIGGER: call:end sent or received
- LOG: endCall() cleanup, cleanup all streams

---

## WebRTC Methods in useWebRTC.ts

| Method | Purpose | State Changes |
|--------|---------|---------------|
| startLocalStream | Get camera/mic | local_stream_requested → local_stream_acquired |
| createPeerConnection | Setup RTCPeerConnection | peer_connection_creating → peer_connection_created |
| createOffer | Create SDP offer | creating_offer → offer_created |
| createAnswer | Create SDP answer | creating_answer → answer_created |
| toggleMute | Enable/disable audio | - |
| toggleCamera | Enable/disable video | - |
| startScreenShare | Share screen | screen_share_started |
| stopScreenShare | Stop sharing | screen_share_stopped |
| endCall | Cleanup | all → ended |
| monitorConnectionQuality | Check stats | quality_excellent/good/fair/poor |
| adaptBitrate | Adjust quality | bitrate_adjusted |

---

## ICE Server Configuration

```javascript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
```

---

## Connection Quality Levels

| Quality | Packet Loss | RTT | Jitter | Max Bitrate |
|---------|-------------|-----|--------|-------------|
| excellent | < 2% | < 100ms | < 30ms | 2.5 Mbps |
| good | < 5% | < 200ms | < 60ms | 1.5 Mbps |
| fair | < 10% | < 400ms | < 100ms | 800 Kbps |
| poor | ≥ 10% | ≥ 400ms | ≥ 100ms | 400 Kbps |

---

## Implementation Files

- vide/hooks/useWebRTC.ts - All WebRTC logic
- vide/hooks/useWebSocket.ts - Signaling event handling
- vide/components/call/IncomingCallModal.tsx - Call UI
- vide/app/(app)/call/page.tsx - Video call page

---

## Edge Case Handling

### Network Drop
- DETECTION: ICE state 'disconnected' or 'failed'
- ACTION: handleReconnect() called
- LOG: ICE restart with new offer

### Tab Switch
- HANDLING: useEffect cleanup on unmount
- LOG: Streams remain active via WebRTC

### Camera/Mic Permission Denied
- HANDLING: Fallback to audio-only
- LOG: Toast notification shown

### Slow Network
- HANDLING: adaptBitrate() reduces quality
- LOG: Connection quality downgraded