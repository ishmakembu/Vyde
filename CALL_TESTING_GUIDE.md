# Call Testing Guide

## Manual Test Steps

### Prerequisites
1. Start WebSocket server: `cd server && node index.js` (port 4000)
2. Start Next.js: `npm run dev` (port 3000)
3. Open 2 browser tabs at http://localhost:3000

### Test Flow

**Tab 1 (User A):**
1. Register/Login as "userA"
2. Go to Directory
3. See "userB" in online users

**Tab 2 (User B):**
1. Register/Login as "userB" 
2. Keep tab open

**Tab 1:**
1. Click "Call" on userB's card
2. See "Calling..." status

**Tab 2:**
1. See incoming call modal
2. Click "Accept"

### What Happens During Call

1. WebSocket sends `call:incoming` → `call:accepted`
2. Both clients create RTCPeerConnection
3. Exchange SDP via WebSocket (`signal:offer`/`signal:answer`)
4. Exchange ICE candidates via WebSocket (`signal:ice`)
5. Media streams connected → video/audio flows

## API Calls Made During Call Flow

```
POST /api/calls (creates call session in DB)
  ↓
WebSocket: call:initiate
  ↓
WebSocket: call:incoming (to callee)
  ↓
WebSocket: call:accept
  ↓
WebSocket: signal:offer / signal:answer (SDP exchange)
  ↓
WebSocket: signal:ice (ICE candidates)
  ↓
WebRTC: Direct peer-to-peer video/audio
```

## Streaming Quality Factors

1. **Network**: Latency, bandwidth, packet loss
2. **Codecs**: VP8/VP9 (from ICE servers)
3. **WebRTC Stats**:
   - Round-trip time (RTT) < 150ms = excellent
   - Packet loss < 1% = excellent  
   - Jitter < 30ms = excellent

## Quick API Test

```powershell
# Test call session creation
curl -X POST http://localhost:3000/api/calls `
  -H "Content-Type: application/json" `
  -d '{"calleeId":"some-user-id"}' `
  -b "next-auth.session-token=YOUR_SESSION"
```

## WebSocket Test Events

Send via WebSocket to port 4000:
```json
{"type": "user:online", "payload": {"userId": "USER_ID"}}
{"type": "call:initiate", "payload": {"calleeId":"USER_B","roomId":"room-1","callId":"call-1"}}
```

The actual video streaming can only be tested in a real browser with camera access - there's no API-only way to test WebRTC media quality.