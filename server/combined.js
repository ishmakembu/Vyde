/**
 * Combined Next.js + WebSocket server.
 * Runs both on the same $PORT so Render (single-service) can expose everything
 * through one URL.  WebSocket connections upgrade on the same port as HTTP.
 *
 * Local dev: still use `npm run dev` (Next.js) + `npm run start:ws` (standalone WS on :4000)
 * Production: `npm run start`  →  this file
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { parse } from 'url';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import next from 'next';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();
const PORT   = parseInt(process.env.PORT || '3000', 10);
const dev    = process.env.NODE_ENV !== 'production';

// ── Bootstrap Next.js ────────────────────────────────────────────────────────
const nextApp = next({ dev, dir: join(__dirname, '..') });
const handle  = nextApp.getRequestHandler();
await nextApp.prepare();
console.log(`> Next.js ready (${dev ? 'dev' : 'production'})`);

// ── WS token auth ────────────────────────────────────────────────────────────
function verifyWsToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiryStr, hmac] = parts;

  const now    = Math.floor(Date.now() / 1000);
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry) || now > expiry) return null;

  const secret   = process.env.AUTH_SECRET ?? '';
  const payload  = `${userId}.${expiryStr}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  if (hmac.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  return userId;
}

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {Map<string, { ws: WebSocket, userId: string|null, username: string|null, avatar: string|null, lastSeen: number, inCall: string|null, clientId: string }>} */
const clients     = new Map();
/** @type {Map<string, ReturnType<typeof clients.get>>} */
const userClients = new Map();
/** @type {Map<string, { id: string, roomId: string, participants: Set<string>, status: string, startedAt: number|null }>} */
const callSessions = new Map();

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: userClients.size }));
    return;
  }

  // Internal WS-notify endpoint (called by Next.js API routes)
  if (req.method === 'POST' && req.url === '/internal/notify') {
    const secret = process.env.INTERNAL_SECRET ?? process.env.AUTH_SECRET ?? '';
    const auth   = req.headers['x-internal-secret'];
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

  // Everything else → Next.js
  try {
    await handle(req, res, parse(req.url || '/', true));
  } catch (err) {
    console.error('Next.js handler error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

// ── WebSocket server (attached to same HTTP server) ───────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url || '', true);
  const clientId  = query.clientId || generateId();

  const client = {
    ws,
    userId:   null,
    username: null,
    avatar:   null,
    lastSeen: Date.now(),
    inCall:   null,
    clientId,
  };
  clients.set(clientId, client);

  ws.on('message', (data) => {
    try {
      handleMessage(client, JSON.parse(data.toString()), clientId);
    } catch (err) {
      console.error('WS message error:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    if (client.userId) {
      userClients.delete(client.userId);
      prisma.user.update({ where: { id: client.userId }, data: { lastSeen: new Date() } }).catch(() => {});
      broadcastPresence(client.userId, false);

      if (client.inCall) {
        const session = callSessions.get(client.inCall);
        if (session) {
          session.participants.delete(client.userId);
          session.participants.forEach((uid) => {
            const c = userClients.get(uid);
            if (c?.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({ type: 'room:peer_left', payload: { userId: client.userId, callId: client.inCall } }));
            }
          });
          if (session.participants.size === 0) callSessions.delete(client.inCall);
        }
      }
    }
  });

  ws.on('error', (err) => console.error('WS error:', err));
});

// ── Message handler ───────────────────────────────────────────────────────────
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
      const verifiedId = verifyWsToken(token);
      if (!verifiedId || verifiedId !== userId) {
        client.ws.send(JSON.stringify({ type: 'auth:error', payload: { error: 'Invalid authentication token' } }));
        client.ws.close(4001, 'Unauthorized');
        return;
      }

      client.userId   = userId;
      if (username)              client.username = username;
      if (avatar !== undefined)  client.avatar   = avatar;
      client.lastSeen = Date.now();
      userClients.set(userId, client);
      broadcastPresence(userId, true);
      prisma.user.update({ where: { id: userId }, data: { lastSeen: new Date() } }).catch(() => {});

      // Send snapshot of currently-online users to this newly-connected client
      const snapshot = [];
      userClients.forEach((c, uid) => {
        if (uid !== userId) snapshot.push({ userId: uid, online: true, inCall: c.inCall ?? null });
      });
      if (snapshot.length > 0 && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'presence:snapshot', payload: { users: snapshot } }));
      }

      // Deliver pending unread notifications
      prisma.notification.findMany({
        where: { userId, read: false },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }).then((unread) => {
        if (unread.length > 0 && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: 'notification:pending', payload: { notifications: unread } }));
        }
      }).catch(() => {});
      break;
    }

    case 'ping': {
      client.lastSeen = Date.now();
      client.ws.send(JSON.stringify({ type: 'pong' }));
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
        prisma.notification.create({
          data: {
            userId: calleeId,
            type: 'missed_call',
            title: 'Missed call',
            body: `${client.username ?? 'Someone'} tried to call you`,
            data: { callerId: client.userId, callerUsername: client.username ?? 'Unknown', callerAvatar: client.avatar ?? null },
          },
        }).catch(() => {});
        client.ws.send(JSON.stringify({ type: 'call:callee_offline', payload: { calleeId } }));
        return;
      }

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
      } catch { /* non-fatal */ }

      callSessions.set(callId, {
        id: callId, roomId,
        participants: new Set([client.userId, calleeId]),
        status: 'ringing', startedAt: null,
      });

      callee.ws.send(JSON.stringify({
        type: 'call:incoming',
        payload: {
          callId, roomId,
          caller: { id: client.userId, username: callerUsername ?? client.username ?? 'Unknown', avatar: callerAvatar ?? client.avatar ?? null },
        },
      }));

      setTimeout(() => {
        const session = callSessions.get(callId);
        if (session?.status === 'ringing') {
          session.status = 'missed';
          client.ws.send(JSON.stringify({ type: 'call:timeout', payload: { callId } }));
          callee.ws.send(JSON.stringify({ type: 'call:timeout', payload: { callId } }));
          prisma.notification.create({
            data: {
              userId: calleeId, type: 'missed_call', title: 'Missed call',
              body: `${client.username ?? 'Someone'} tried to call you`,
              data: { callerId: client.userId, callerUsername: client.username ?? 'Unknown', callerAvatar: client.avatar ?? null },
            },
          }).catch(() => {});
          callSessions.delete(callId);
        }
      }, 30000);

      client.ws.send(JSON.stringify({ id, ok: true }));
      break;
    }

    case 'call:accept': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session || (session.status !== 'ringing' && session.status !== 'active')) {
        client.ws.send(JSON.stringify({ id, ok: false, error: 'Call not found or already ended' }));
        return;
      }

      session.status = 'active';
      if (!session.startedAt) session.startedAt = Date.now();
      if (!session.participants.has(client.userId)) session.participants.add(client.userId);
      client.inCall = callId;

      session.participants.forEach((uid) => {
        if (uid === client.userId) return;
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'call:accepted', payload: { callId, roomId: session.roomId, acceptedBy: client.userId } }));
        }
      });

      client.ws.send(JSON.stringify({
        type: 'room:peers',
        payload: {
          callId, roomId: session.roomId,
          peers: Array.from(session.participants)
            .filter((uid) => uid !== client.userId)
            .map((uid) => {
              const c = userClients.get(uid);
              return { userId: uid, username: c?.username ?? 'Unknown', avatar: c?.avatar ?? null };
            }),
        },
      }));

      session.participants.forEach((uid) => {
        if (uid === client.userId) return;
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'room:peer_joined', payload: { userId: client.userId, username: client.username ?? 'Unknown' } }));
        }
      });

      client.ws.send(JSON.stringify({ id, ok: true }));
      break;
    }

    case 'call:cancel': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session) return;
      session.participants.forEach((uid) => {
        if (uid === client.userId) return;
        const c = userClients.get(uid);
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
      const otherUserId = Array.from(session.participants).find((uid) => uid !== client.userId);
      if (otherUserId) {
        userClients.get(otherUserId)?.ws.send(JSON.stringify({ type: 'call:declined', payload: { callId, reason: 'declined' } }));
      }
      callSessions.delete(callId);
      break;
    }

    case 'call:end': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session) return;
      const duration = session.startedAt ? Date.now() - session.startedAt : 0;
      session.participants.forEach((uid) => {
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'call:ended', payload: { callId, duration } }));
          c.inCall = null;
          broadcastPresence(uid, true);
        }
      });
      callSessions.delete(callId);
      break;
    }

    case 'call:invite': {
      const { callId, userId: inviteeId } = payload;
      if (!client.userId) return;
      const session = callSessions.get(callId);
      if (!session) { client.ws.send(JSON.stringify({ id, ok: false, error: 'Call not found' })); return; }
      const callee = userClients.get(inviteeId);
      if (!callee) { client.ws.send(JSON.stringify({ id, ok: false, error: 'User not online' })); return; }
      session.participants.add(inviteeId);
      callee.ws.send(JSON.stringify({
        type: 'call:invited',
        payload: {
          callId, roomId: session.roomId, callerId: client.userId,
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
      const { to } = payload;
      const target = userClients.get(to);
      if (target?.ws.readyState === WebSocket.OPEN) {
        target.ws.send(JSON.stringify({ type, payload: { ...payload, from: client.userId } }));
      }
      break;
    }

    case 'chat:send': {
      const { callId, content, imageUrl } = payload;
      const session = callSessions.get(callId);
      if (!session) return;
      const messageId = id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = Date.now();
      session.participants.forEach((uid) => {
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'chat:message',
            payload: { id: messageId, userId: client.userId, username: client.username ?? 'Unknown', content, imageUrl, createdAt: new Date(timestamp).toISOString(), deliveryState: 'delivered' },
          }));
        }
      });
      break;
    }

    case 'chat:typing': {
      const { callId, isTyping } = payload;
      const session = callSessions.get(callId);
      if (!session) return;
      session.participants.forEach((uid) => {
        if (uid === client.userId) return;
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'chat:typing', payload: { userId: client.userId, username: client.username ?? 'Unknown', isTyping } }));
        }
      });
      break;
    }

    case 'room:peer_state': {
      const { callId, muted, cameraOff } = payload;
      const session = callSessions.get(callId);
      if (!session) return;
      session.participants.forEach((uid) => {
        if (uid === client.userId) return;
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'room:peer_state', payload: { userId: client.userId, muted, cameraOff } }));
        }
      });
      break;
    }

    case 'user:status': {
      const { status, statusEmoji } = payload;
      if (!client.userId) return;
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'user:status', payload: { userId: client.userId, status, statusEmoji } }));
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
      session.participants.forEach((uid) => {
        if (uid === client.userId) return;
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'music:state', payload: { ...payload, initiatedBy: client.userId } }));
        }
      });
      break;
    }

    case 'music:stop': {
      const { callId } = payload;
      const session = callSessions.get(callId);
      if (!session || !client.userId) return;
      session.participants.forEach((uid) => {
        if (uid === client.userId) return;
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'music:state', payload: { playing: false, timestamp: 0, url: null, initiatedBy: client.userId } }));
        }
      });
      break;
    }

    case 'reaction:send': {
      const { callId, emoji, pack } = payload;
      const session = callSessions.get(callId);
      if (!session) return;
      const reactionId = `reaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      session.participants.forEach((uid) => {
        const c = userClients.get(uid);
        if (c?.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'reaction:incoming',
            payload: { id: reactionId, userId: client.userId, username: client.username ?? 'Unknown', emoji, pack, createdAt: new Date().toISOString() },
          }));
        }
      });
      break;
    }

    default:
      break;
  }
}

// ── Presence broadcast ────────────────────────────────────────────────────────
function broadcastPresence(userId, isOnline = true) {
  const inCall = userClients.get(userId)?.inCall ?? null;
  clients.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify({ type: 'user:presence', payload: { userId, online: isOnline, lastSeen: Date.now(), inCall } }));
    }
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`> Combined server ready on port ${PORT}`);
});
