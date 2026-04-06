import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { parse } from 'url';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;

// ─── WS token auth ───────────────────────────────────────────────────────────
/**
 * Verifies a short-lived HMAC-SHA256 token issued by /api/auth/ws-token.
 * Token format: `{userId}.{expiry}.{hex-hmac}`
 * Returns the userId string on success, or null on failure.
 * @param {string | undefined} token
 * @returns {string | null}
 */
function verifyWsToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiryStr, hmac] = parts;

  const now = Math.floor(Date.now() / 1000);
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry) || now > expiry) return null;

  const secret = process.env.AUTH_SECRET ?? '';
  const payload = `${userId}.${expiryStr}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (hmac.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }

  return userId;
}

/** Keyed by clientId. Primary Map — use for iteration to avoid duplicates. @type {Map<string, { ws: WebSocket, userId: string | null, username: string | null, avatar: string | null, lastSeen: number, inCall: string | null, clientId: string }>} */
const clients = new Map();

/** Keyed by userId — lookup-only. Do NOT iterate this to broadcast. @type {Map<string, typeof clients extends Map<any, infer V> ? V : never>} */
const userClients = new Map();

/** @type {Map<string, { id: string, roomId: string, participants: Set<string>, status: string, startedAt: number | null }>} */
const callSessions = new Map();

const eventBuffers = new Map();
const processedEvents = new Map();

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

const server = createServer((req, res) => {
  // Health check for Render
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: userClients.size }));
    return;
  }

  // Internal endpoint for Next.js API routes to push a message to an online user
  if (req.method === 'POST' && req.url === '/internal/notify') {
    // Verify shared secret to prevent abuse
    const secret = process.env.INTERNAL_SECRET ?? process.env.AUTH_SECRET ?? '';
    const auth = req.headers['x-internal-secret'];
    if (!auth || auth !== secret) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { userId, message } = JSON.parse(body);
        if (!userId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'userId and message required' }));
          return;
        }
        const client = userClients.get(userId);
        if (client?.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(message));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ delivered: true }));
        } else {
          // User is offline — caller should persist to DB separately
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ delivered: false }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url || '', true);
  const clientId = query.clientId || generateId();

  console.log(`Client connected: ${clientId}`);

  const client = {
    ws,
    userId: null,
    username: null,
    avatar: null,
    lastSeen: Date.now(),
    inCall: null,
    clientId,
  };
  
  clients.set(clientId, client);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(client, message, clientId);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);

    if (client.userId) {
      userClients.delete(client.userId);

      // Persist lastSeen to DB
      prisma.user.update({ where: { id: client.userId }, data: { lastSeen: new Date() } }).catch(() => {});

      // Broadcast that this user went offline
      broadcastPresence(client.userId, false);

      // Notify call room participants that this peer left
      if (client.inCall) {
        const session = callSessions.get(client.inCall);
        if (session) {
          session.participants.delete(client.userId);
          session.participants.forEach((userId) => {
            const c = userClients.get(userId);
            if (c?.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({
                type: 'room:peer_left',
                payload: { userId: client.userId, callId: client.inCall },
              }));
            }
          });
          if (session.participants.size === 0) {
            callSessions.delete(client.inCall);
          }
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

/** @param {{ ws: WebSocket, userId: string | null, lastSeen: number, inCall: string | null, clientId: string }} client */
/** @param {{ type: string, payload: unknown, id?: string }} message */
async function handleMessage(client, message, clientId) {
  const { type, payload, id } = message;

  switch (type) {
    case 'auth': {
      const { userId } = payload;
      client.userId = userId;
      userClients.set(userId, client);
      client.ws.send(JSON.stringify({ type: 'auth:ok', payload: { userId } }));
      break;
    }

    case 'user:online': {
      const { userId, username, avatar, token } = payload;

      // Validate the short-lived WS auth token
      const verifiedId = verifyWsToken(token);
      if (!verifiedId || verifiedId !== userId) {
        client.ws.send(JSON.stringify({ type: 'auth:error', payload: { error: 'Invalid authentication token' } }));
        client.ws.close(4001, 'Unauthorized');
        return;
      }

      client.userId = userId;
      if (username) client.username = username;
      if (avatar !== undefined) client.avatar = avatar;
      client.lastSeen = Date.now();
      userClients.set(userId, client);
      broadcastPresence(userId, true);
      // Persist lastSeen to DB asynchronously
      prisma.user.update({ where: { id: userId }, data: { lastSeen: new Date() } }).catch(() => {});

      // Send the newly connected client the current presence of all other online users
      // so their UI is immediately accurate without waiting for the next ping cycle
      const onlineSnapshot = [];
      userClients.forEach((c, uid) => {
        if (uid !== userId) {
          onlineSnapshot.push({ userId: uid, online: true, inCall: c.inCall ?? null });
        }
      });
      if (onlineSnapshot.length > 0 && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'presence:snapshot',
          payload: { users: onlineSnapshot },
        }));
      }

      // Deliver any unread notifications that accumulated while offline
      prisma.notification.findMany({
        where: { userId, read: false },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }).then((unread) => {
        if (unread.length > 0 && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'notification:pending',
            payload: { notifications: unread },
          }));
        }
      }).catch(() => {});
      break;
    }

    case 'ping': {
      client.lastSeen = Date.now();
      client.ws.send(JSON.stringify({ type: 'pong' }));
      // Keep DB lastSeen fresh and re-broadcast presence so all clients know this user is still online
      if (client.userId) {
        prisma.user.update({ where: { id: client.userId }, data: { lastSeen: new Date() } }).catch(() => {});
        broadcastPresence(client.userId, true);
      }
      break;
    }

    case 'call:initiate': {
      const { calleeId, roomId, callId, username: callerUsername, avatar: callerAvatar } = payload;
      if (!client.userId) return;

      const callee = userClients.get(calleeId);
      if (!callee) {
        // Callee is offline — persist a missed_call notification so they see it on login
        prisma.notification.create({
          data: {
            userId: calleeId,
            type: 'missed_call',
            title: 'Missed call',
            body: `${client.username ?? 'Someone'} tried to call you`,
            data: {
              callerId: client.userId,
              callerUsername: client.username ?? 'Unknown',
              callerAvatar: client.avatar ?? null,
            },
          },
        }).catch((e) => console.error('[WS] Failed to create missed_call notification:', e));

        // Inform caller with a typed event so the client can react properly
        client.ws.send(JSON.stringify({
          type: 'call:callee_offline',
          payload: { calleeId },
        }));
        return;
      }

      // Privacy check: if callee is private, only friends may call them
      try {
        const calleeUser = await prisma.user.findUnique({ where: { id: calleeId }, select: { isPrivate: true } });
        if (calleeUser?.isPrivate) {
          const friendship = await prisma.friendship.findFirst({
            where: {
              OR: [
                { adderId: client.userId, receiverId: calleeId, status: 'accepted' },
                { adderId: calleeId, receiverId: client.userId, status: 'accepted' },
              ],
            },
          });
          if (!friendship) {
            client.ws.send(JSON.stringify({ id, ok: false, error: 'User is private' }));
            return;
          }
        }
      } catch { /* non-fatal, continue */ }

      callSessions.set(callId, {
        id: callId,
        roomId,
        participants: new Set([client.userId, calleeId]),
        status: 'ringing',
        startedAt: null,
      });

      callee.ws.send(JSON.stringify({
        type: 'call:incoming',
        payload: {
          callId,
          roomId,
          caller: { id: client.userId, username: callerUsername ?? client.username ?? 'Unknown', avatar: callerAvatar ?? client.avatar ?? null },
        },
      }));

      setTimeout(() => {
        const session = callSessions.get(callId);
        if (session?.status === 'ringing') {
          session.status = 'missed';
          client.ws.send(JSON.stringify({ type: 'call:timeout', payload: { callId } }));
          callee.ws.send(JSON.stringify({ type: 'call:timeout', payload: { callId } }));

          // Persist a missed_call notification for the callee (they had the modal but didn't answer)
          prisma.notification.create({
            data: {
              userId: calleeId,
              type: 'missed_call',
              title: 'Missed call',
              body: `${client.username ?? 'Someone'} tried to call you`,
              data: {
                callerId: client.userId,
                callerUsername: client.username ?? 'Unknown',
                callerAvatar: client.avatar ?? null,
              },
            },
          }).catch(() => {});

          callSessions.delete(callId);
        }
      }, 30000);

      client.ws.send(JSON.stringify({ id, ok: true }));
      break;
    }

    case 'call:accept': {
      const { callId, roomId } = payload;
      const session = callSessions.get(callId);
      if (!session || (session.status !== 'ringing' && session.status !== 'active')) {
        client.ws.send(JSON.stringify({ id, ok: false, error: 'Call not found or already ended' }));
        return;
      }

      session.status = 'active';
      if (!session.startedAt) session.startedAt = Date.now();
      if (!session.participants.has(client.userId)) session.participants.add(client.userId);
      client.inCall = callId;

      // Notify the caller that their call was accepted
      session.participants.forEach((userId) => {
        if (userId === client.userId) return; // skip acceptee itself
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'call:accepted',
            payload: { callId, roomId: session.roomId, acceptedBy: client.userId },
          }));
        }
      });

      // Send the acceptee the list of existing peers in the room
      client.ws.send(JSON.stringify({
        type: 'room:peers',
        payload: {
          callId,
          roomId: session.roomId,
          peers: Array.from(session.participants)
            .filter((uid) => uid !== client.userId)
            .map((uid) => {
              const c = userClients.get(uid);
              return { userId: uid, username: c?.username ?? 'Unknown', avatar: c?.avatar ?? null };
            }),
        },
      }));

      // Notify all existing peers that a new participant joined
      session.participants.forEach((userId) => {
        if (userId === client.userId) return;
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'room:peer_joined',
            payload: { userId: client.userId, username: client.username ?? 'Unknown' },
          }));
        }
      });

      client.ws.send(JSON.stringify({ id, ok: true }));
      break;
    }

    case 'call:cancel': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session) return;

      session.participants.forEach((userId) => {
        if (userId === client.userId) return;
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'call:cancelled', payload: { callId, cancelledBy: client.userId } }));
        }
      });

      callSessions.delete(callId);
      client.ws.send(JSON.stringify({ id, ok: true }));
      break;
    }

    case 'call:decline': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session) return;

      const otherUserId = Array.from(session.participants).find((id) => id !== client.userId);
      if (otherUserId) {
        const other = userClients.get(otherUserId);
        other?.ws.send(JSON.stringify({
          type: 'call:declined',
          payload: { callId, reason: 'declined' },
        }));
      }

      callSessions.delete(callId);
      break;
    }

    case 'call:end': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session) return;

      const duration = session.startedAt ? Date.now() - session.startedAt : 0;

      session.participants.forEach((userId) => {
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'call:ended', payload: { callId, duration } }));
          c.inCall = null;
          // Broadcast updated presence (no longer in call)
          broadcastPresence(userId, true);
        }
      });

      callSessions.delete(callId);
      break;
    }

    case 'call:invite': {
      const { callId, userId: inviteeId } = payload;
      if (!client.userId) return;

      const session = callSessions.get(callId);
      if (!session) {
        client.ws.send(JSON.stringify({ id, ok: false, error: 'Call not found' }));
        return;
      }

      const callee = userClients.get(inviteeId);
      if (!callee) {
        client.ws.send(JSON.stringify({ id, ok: false, error: 'User not online' }));
        return;
      }

      session.participants.add(inviteeId);

      callee.ws.send(JSON.stringify({
        type: 'call:invited',
        payload: {
          callId,
          roomId: session.roomId,
          callerId: client.userId,
          caller: { id: client.userId, username: client.username ?? 'Unknown', avatar: client.avatar ?? null },
          participants: Array.from(session.participants),
        },
      }));

      client.ws.send(JSON.stringify({ id, ok: true }));
      break;
    }

    case 'signal:offer':
    case 'signal:answer':
    case 'signal:ice':
    case 'signal:content_track': {
      const { to, callId } = payload;
      const target = userClients.get(to);
      if (target?.ws.readyState === WebSocket.OPEN) {
        target.ws.send(JSON.stringify({
          type,
          payload: { ...payload, from: client.userId },
        }));
      }
      break;
    }

    case 'chat:send': {
      const { callId, content, imageUrl } = payload;
      const session = callSessions.get(callId);
      if (!session) return;

      const messageId = id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = Date.now();

      session.participants.forEach((userId) => {
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'chat:message',
            payload: {
              id: messageId,
              userId: client.userId,
              username: client.username ?? 'Unknown',
              content,
              imageUrl,
              createdAt: new Date(timestamp).toISOString(),
              deliveryState: 'delivered',
            },
          }));
        }
      });
      break;
    }

    case 'chat:typing': {
      const { callId, isTyping } = payload;
      const session = callSessions.get(callId);
      if (!session) return;

      session.participants.forEach((userId) => {
        if (userId === client.userId) return;
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'chat:typing',
            payload: { userId: client.userId, username: client.username ?? 'Unknown', isTyping },
          }));
        }
      });
      break;
    }

    case 'room:peer_state': {
      const { callId, muted, cameraOff } = payload;
      const session = callSessions.get(callId);
      if (!session) return;

      session.participants.forEach((userId) => {
        if (userId === client.userId) return;
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'room:peer_state',
            payload: { userId: client.userId, muted, cameraOff },
          }));
        }
      });
      break;
    }

    case 'user:status': {
      const { status, statusEmoji } = payload;
      if (!client.userId) return;
      // Broadcast the status update to all connected clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'user:status',
            payload: { userId: client.userId, status, statusEmoji },
          }));
        }
      });
      break;
    }

    case 'music:play':
    case 'music:pause':
    case 'music:seek': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session || !client.userId) return;

      session.participants.forEach((userId) => {
        if (userId === client.userId) return;
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'music:state',
            payload: { ...payload, initiatedBy: client.userId },
          }));
        }
      });
      break;
    }

    case 'music:stop': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session || !client.userId) return;

      session.participants.forEach((userId) => {
        if (userId === client.userId) return;
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'music:state',
            payload: { playing: false, timestamp: 0, url: null, initiatedBy: client.userId },
          }));
        }
      });
      break;
    }

    case 'reaction:send': {
      const { callId, emoji, pack } = payload;
      const session = callSessions.get(callId);
      if (!session) return;

      const reactionId = `reaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      session.participants.forEach((userId) => {
        const c = userClients.get(userId);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'reaction:incoming',
            payload: {
              id: reactionId,
              userId: client.userId,
              username: client.username ?? 'Unknown',
              emoji,
              pack,
              createdAt: new Date().toISOString(),
            },
          }));
        }
      });
      break;
    }

    default:
      // ignore unknown message types
  }  
}

function broadcastPresence(userId, isOnline = true) {
  const userClient = userClients.get(userId);
  const inCall = userClient?.inCall ?? null;

  // Iterate clients (keyed by clientId) to avoid duplicate sends from dual-indexed userClients
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'user:presence',
        payload: { userId, online: isOnline, lastSeen: Date.now(), inCall },
      }));
    }
  });
}

server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});