import { useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useCallStore } from '@/stores/callStore';
import { useUIStore } from '@/stores/uiStore';
import type { AppNotification } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { useOfflineQueue, processOfflineQueue } from '@/stores/offlineQueue';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

interface WSMessage {
  type: string;
  payload: unknown;
  id?: string;
}

// ─── Module-level singleton ───────────────────────────────────────────────────
// AppShell calls useWebSocket() once; all other components call sendWsMessage()
// directly so there is only ever ONE live connection for the whole app session.
type WSMessageArg = Omit<WSMessage, 'id'> & { id?: string };
let _globalSend: ((msg: WSMessageArg) => boolean) | null = null;

/** Send a message through the app-level WebSocket. Returns false if not connected. */
export function sendWsMessage(msg: WSMessageArg): boolean {
  return _globalSend?.(msg) ?? false;
}

export function useWebSocket() {
  const { data: session } = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isConnectingRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  // Stable refs so closures inside connect() always read the latest callbacks
  // without causing the useCallback deps to re-fire.
  const connectRef = useRef<() => void>(() => {});
  const handleMessageRef = useRef<(msg: WSMessage) => void>(() => {});
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      useUIStore.getState().showToast(
        'Server unreachable. Please check your internet connection.',
        'error'
      );
      return;
    }

    const delayIndex = Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1);
    const delay = RECONNECT_DELAYS[delayIndex] + (Math.random() * 1000 - 500);
    reconnectAttemptRef.current++;

    setTimeout(() => {
      if (!sessionRef.current?.user?.id) return;
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    intentionalDisconnectRef.current = false;
    const session = sessionRef.current;
    if (!session?.user?.id || isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnectingRef.current = true;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }, 5000);

      const sendMessage = (msg: WSMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      };

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        isConnectingRef.current = false;
        reconnectAttemptRef.current = 0;
        useUIStore.getState().setIsOnline(true);

        const s = sessionRef.current;
        if (s?.user?.id) {
          (async () => {
            let wsToken = '';
            try {
              const res = await fetch('/api/auth/ws-token');
              if (res.ok) {
                const data = await res.json() as { token?: string };
                wsToken = data.token ?? '';
              }
            } catch { /* network error — server will reject and close */ }

            sendMessage({
              type: 'user:online',
              payload: {
                userId: s.user.id,
                username: s.user.username,
                avatar: s.user.avatar ?? null,
                token: wsToken,
              },
            });

            processOfflineQueue((msg) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(msg));
                return true;
              }
              return false;
            });
          })();
        }

        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          handleMessageRef.current(message);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = (event) => {
        isConnectingRef.current = false;
        useUIStore.getState().setIsOnline(false);
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        // Don't retry on intentional disconnect or server-side auth rejection (4001)
        if (intentionalDisconnectRef.current || event.code === 4001) {
          return;
        }
        if (event.code !== 1000 && event.code !== 1001) {
          console.warn(`[WebSocket] Closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''}) — will reconnect`);
        }
        attemptReconnect();
      };

      ws.onerror = () => {
        // onerror only fires a generic Event — actual reason arrives in onclose.code/reason
        isConnectingRef.current = false;
      };
    } catch (err) {
      console.error('[WebSocket] Exception during connect:', err);
      isConnectingRef.current = false;
      attemptReconnect();
    }
  }, [attemptReconnect]);

  // Keep stable refs current so closures inside connect always call latest versions
  useEffect(() => { connectRef.current = connect; }, [connect]);

  const handleIncomingMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'pong':
        break;

      case 'auth:error': {
        useUIStore.getState().showToast('Authentication failed. Please sign in again.', 'error');
        break;
      }

      case 'user:presence': {
        useUIStore.getState().setIsOnline(true);
        const presencePayload = message.payload as {
          userId: string;
          online: boolean;
          inCall: string | null;
        };
        useUIStore.getState().updateUserPresence(presencePayload.userId, {
          online: presencePayload.online,
          inCall: presencePayload.inCall,
        });
        break;
      }

      case 'presence:snapshot': {
        // Bulk-populate presence map with all currently online users on connect
        const { users } = message.payload as {
          users: Array<{ userId: string; online: boolean; inCall: string | null }>;
        };
        users.forEach((u) => {
          useUIStore.getState().updateUserPresence(u.userId, {
            online: u.online,
            inCall: u.inCall,
          });
        });
        break;
      }

      case 'call:incoming': {
        const payload = message.payload as {
          callId: string;
          roomId: string;
          caller: { id: string; username: string; avatar: string | null };
        };
        useCallStore.getState().setIncomingCall({
          callId: payload.callId,
          callerId: payload.caller.id,
          callerUsername: payload.caller.username,
          callerAvatar: payload.caller.avatar,
        });
        useCallStore.getState().setStatus('ringing');
        break;
      }

      case 'call:accepted': {
        const payload = message.payload as { callId: string; roomId: string };
        useCallStore.getState().setCallId(payload.callId);
        useCallStore.getState().setRoomId(payload.roomId);
        useCallStore.getState().setStatus('connecting');
        break;
      }

      case 'call:declined': {
        useCallStore.getState().setIncomingCall(null);
        useCallStore.getState().setStatus('idle');
        useUIStore.getState().showToast('Call declined', 'info');
        break;
      }

      case 'call:cancelled': {
        useCallStore.getState().setIncomingCall(null);
        useCallStore.getState().setStatus('idle');
        useUIStore.getState().showToast('Call cancelled', 'info');
        break;
      }

      case 'call:ended': {
        useCallStore.getState().resetCall();
        useUIStore.getState().showToast('Call ended', 'info');
        break;
      }

      case 'call:timeout': {
        useCallStore.getState().setIncomingCall(null);
        useCallStore.getState().setStatus('idle');
        useUIStore.getState().showToast('Call timed out', 'info');
        break;
      }

      case 'call:callee_offline': {
        // The person we tried to call was offline; a missed-call notification was sent to them
        useCallStore.getState().resetCall();
        useUIStore.getState().showToast(
          "They're offline — they'll see a missed call notification when they return",
          'info'
        );
        break;
      }

      case 'notification:pending': {
        const { notifications } = message.payload as { notifications: AppNotification[] };
        useUIStore.getState().setNotifications(notifications);
        const missedCalls = notifications.filter((n) => n.type === 'missed_call' && !n.read).length;
        const friendRequests = notifications.filter((n) => n.type === 'friend_request' && !n.read).length;
        const friendAccepted = notifications.filter((n) => n.type === 'friend_accepted' && !n.read).length;
        if (missedCalls > 0) {
          useUIStore.getState().showToast(`You have ${missedCalls} missed call${missedCalls > 1 ? 's' : ''}`, 'info');
        }
        if (friendRequests > 0) {
          useUIStore.getState().showToast(`You have ${friendRequests} friend request${friendRequests > 1 ? 's' : ''}`, 'info');
        }
        if (friendAccepted > 0) {
          useUIStore.getState().showToast(`${friendAccepted} friend request${friendAccepted > 1 ? 's were' : ' was'} accepted`, 'info');
        }
        break;
      }

      case 'notification:new': {
        const notif = message.payload as AppNotification;
        useUIStore.getState().addNotification(notif);
        if (notif.type === 'friend_request') {
          useUIStore.getState().showToast(notif.body, 'info');
        } else if (notif.type === 'friend_accepted') {
          useUIStore.getState().showToast(notif.body, 'info');
        } else if (notif.type === 'missed_call') {
          useUIStore.getState().showToast(notif.body, 'info');
        }
        break;
      }

      case 'chat:message': {
        const payload = message.payload as {
          id: string;
          userId: string;
          username: string;
          avatar?: string | null;
          content: string;
          imageUrl?: string;
          createdAt: string;
        };
        useChatStore.getState().addMessage({
          id: payload.id,
          content: payload.content,
          imageUrl: payload.imageUrl,
          userId: payload.userId,
          username: payload.username,
          avatar: payload.avatar,
          createdAt: new Date(payload.createdAt),
          isDeleted: false,
          deliveryState: 'delivered',
        });
        break;
      }

      case 'chat:typing': {
        const payload = message.payload as { userId: string; isTyping: boolean };
        useChatStore.getState().setTypingUser(payload.userId, payload.isTyping);
        break;
      }

      case 'signal:offer': {
        const offerPayload = message.payload as {
          from: string;
          callId: string;
          sdp: RTCSessionDescriptionInit;
        };
        useCallStore.getState().setPeerInfo(offerPayload.from, 'Peer', null);
        window.dispatchEvent(new CustomEvent('webrtc:offer', { detail: offerPayload }));
        break;
      }

      case 'signal:answer': {
        const answerPayload = message.payload as {
          from: string;
          callId: string;
          sdp: RTCSessionDescriptionInit;
        };
        window.dispatchEvent(new CustomEvent('webrtc:answer', { detail: answerPayload }));
        break;
      }

      case 'signal:ice': {
        const icePayload = message.payload as {
          from: string;
          callId: string;
          candidate: RTCIceCandidateInit;
        };
        window.dispatchEvent(new CustomEvent('webrtc:ice', { detail: icePayload }));
        break;
      }

      case 'signal:content_track': {
        const ctPayload = message.payload as { from: string; callId: string; hasContent: boolean };
        window.dispatchEvent(new CustomEvent('webrtc:content_track', { detail: ctPayload }));
        break;
      }

      case 'call:invited': {
        const invitePayload = message.payload as {
          callId: string;
          roomId: string;
        };
        useCallStore.getState().setCallId(invitePayload.callId);
        useCallStore.getState().setRoomId(invitePayload.roomId);
        useUIStore.getState().showToast('Added to call', 'info');
        break;
      }

      case 'room:peer_joined': {
        const peerPayload = message.payload as { userId: string; username?: string };
        useCallStore.getState().setPeerInfo(peerPayload.userId, peerPayload.username || 'User', null);
        // Also trigger WebRTC offer creation for new peer
        window.dispatchEvent(new CustomEvent('webrtc:peer_joined', { detail: peerPayload }));
        break;
      }

      case 'room:peers': {
        const peersPayload = message.payload as {
          callId: string;
          roomId: string;
          peers: Array<{ userId: string; username: string; avatar: string | null }>;
        };
        // Set primary peer info from first existing peer
        if (peersPayload.peers.length > 0) {
          const firstPeer = peersPayload.peers[0];
          useCallStore.getState().setPeerInfo(firstPeer.userId, firstPeer.username, firstPeer.avatar);
        }
        window.dispatchEvent(new CustomEvent('webrtc:peers', { detail: peersPayload }));
        break;
      }

      case 'room:peer_state': {
        const statePayload = message.payload as { userId: string; muted: boolean; cameraOff: boolean };
        window.dispatchEvent(new CustomEvent('webrtc:peer_state', { detail: statePayload }));
        break;
      }

      case 'room:peer_left': {
        const leftPayload = message.payload as { userId: string; callId: string };
        window.dispatchEvent(new CustomEvent('webrtc:peer_left', { detail: leftPayload }));
        useUIStore.getState().showToast('User left the call', 'info');
        break;
      }

      case 'music:state': {
        const musicPayload = message.payload as {
          url?: string;
          playing: boolean;
          timestamp: number;
          title?: string;
          artist?: string;
          albumArt?: string;
          duration?: number;
          initiatedBy?: string;
        };
        window.dispatchEvent(new CustomEvent('music:state', { detail: musicPayload }));
        break;
      }

      case 'reaction:incoming': {
        const reactionPayload = message.payload as { userId: string; emoji: string };
        window.dispatchEvent(new CustomEvent('reaction:incoming', { detail: reactionPayload }));
        break;
      }

      case 'server:shutting_down': {
        useUIStore.getState().showToast('Server is restarting. Reconnecting...', 'info');
        break;
      }

      default:
        break;
    }
  }, []);

  // Keep handleMessageRef current so ws.onmessage always dispatches to latest handler
  useEffect(() => { handleMessageRef.current = handleIncomingMessage; }, [handleIncomingMessage]);

  const send = useCallback((message: Omit<WSMessage, 'id'> & { id?: string }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    
    const { addToQueue } = useOfflineQueue.getState();
    if (message.type.startsWith('chat:') || message.type.startsWith('reaction:')) {
      addToQueue({ id: message.id || `queue-${Date.now()}`, type: message.type, payload: message.payload });
      return false;
    }
    return false;
  }, []);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    useUIStore.getState().setIsOnline(false);
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [session?.user?.id, connect, disconnect]);

  // Register this hook instance as the app-level singleton send function
  useEffect(() => {
    _globalSend = send;
    return () => {
      _globalSend = null;
    };
  }, [send]);

  return { send, disconnect, connect };
}