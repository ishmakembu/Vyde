# WEBSOCKET TRACE

## Connection Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| user:online | Client | Server | { userId: string } | IMPLEMENTED |
| user:status | Client | Server | { status: string, emoji: string } | IMPLEMENTED |
| ping | Client | Server | { ts: number } | IMPLEMENTED |
| pong | Server | Client | - | IMPLEMENTED |

## Messaging Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| chat:send | Client | Server | { callId, content, imageUrl? } | IMPLEMENTED |
| chat:message | Server | Client | { id, userId, username, content, imageUrl?, createdAt } | IMPLEMENTED |
| chat:typing | Client | Server | { callId, isTyping: boolean } | IMPLEMENTED |
| chat:ack | Server | Client | { messageId, status } | IMPLEMENTED |

## Call Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| call:initiate | Client | Server | { calleeId, roomId, callId } | IMPLEMENTED |
| call:incoming | Server | Client | { callId, roomId, caller } | IMPLEMENTED |
| call:accept | Client | Server | { callId, roomId } | IMPLEMENTED |
| call:accepted | Server | Client | { callId, roomId } | IMPLEMENTED |
| call:decline | Client | Server | { callId } | IMPLEMENTED |
| call:declined | Server | Client | { callId, reason } | IMPLEMENTED |
| call:end | Client | Server | { callId } | IMPLEMENTED |
| call:ended | Server | Client | { callId, duration } | IMPLEMENTED |
| call:cancel | Client | Server | { callId } | IMPLEMENTED |
| call:cancelled | Server | Client | { callId } | IMPLEMENTED |
| call:invite | Client | Server | { callId, userId } | IMPLEMENTED |
| call:invited | Server | Client | { callId, roomId, caller, participants } | IMPLEMENTED |
| call:timeout | Server | Client | { callId } | IMPLEMENTED |

## WebRTC Signaling Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| signal:offer | Client | Server | { to, callId, sdp, iceServers } | IMPLEMENTED |
| signal:offer | Server | Client | { from, callId, sdp, iceServers } | IMPLEMENTED |
| signal:answer | Client | Server | { to, callId, sdp } | IMPLEMENTED |
| signal:answer | Server | Client | { from, callId, sdp } | IMPLEMENTED |
| signal:ice | Client | Server | { to, callId, candidate } | IMPLEMENTED |
| signal:ice | Server | Client | { from, callId, candidate } | IMPLEMENTED |

## Room Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| room:peer_joined | Server | Client | { userId, username?, participants? } | IMPLEMENTED |
| room:peer_left | Server | Client | { userId } | IMPLEMENTED |

## Presence Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| user:presence | Server | Client | { userId, lastSeen, inCall } | IMPLEMENTED |
| user:status_update | Server | Client | { userId, status, emoji } | IMPLEMENTED |

## Reaction Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| reaction:send | Client | Server | { callId, emoji, pack } | IMPLEMENTED |
| reaction:incoming | Server | Client | { id, userId, username, emoji, pack, createdAt } | IMPLEMENTED |

## Server Events

| EVENT | FROM | TO | PAYLOAD | STATUS |
|-------|------|-----|---------|--------|
| server:shutting_down | Server | Client | - | IMPLEMENTED |

---

## Event Flow Summary

### Login + Presence
1. Client → user:online → Server
2. Server → user:presence → All Clients

### Messaging
1. Sender → chat:send → Server
2. Server → broadcast → chat:message → All participants
3. Server → chat:ack → Sender

### Video Call (1:1)
1. Caller → call:initiate → Server
2. Server → call:incoming → Callee
3. Callee → call:accept → Server
4. Server → call:accepted → Caller
5. Both → signal:offer/signal:answer → Server → Peer
6. Both → signal:ice → Server → Peer
7. Either → call:end → Server
8. Server → call:ended → All participants

### Group Call
1. Caller → call:invite → Server
2. Server → call:invited → New participant
3. Server → room:peer_joined → All participants

---

## Implementation Status

All WebSocket events are IMPLEMENTED in:
- vide/server/index.js (server side)
- vide/hooks/useWebSocket.ts (client side)