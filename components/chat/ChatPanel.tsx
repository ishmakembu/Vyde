'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useChatStore } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

import type { MusicTrack } from '@/hooks/useMusic';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nowPlaying?: MusicTrack;
}

export function ChatPanel({ isOpen, onClose, nowPlaying }: ChatPanelProps) {
  const { data: session } = useSession();
  const { messages, typingUsers, addMessage, setMessages } = useChatStore();
  const { callId } = useCallStore();
  const { send } = useWebSocket();
  const [input, setInput] = useState('');
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetchedCallIdRef = useRef<string | null>(null);

  // Track incoming reactions for count display
  useEffect(() => {
    const onReaction = (e: Event) => {
      const { emoji } = (e as CustomEvent).detail as { emoji: string };
      setReactionCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
    };
    window.addEventListener('reaction:incoming', onReaction);
    return () => window.removeEventListener('reaction:incoming', onReaction);
  }, []);

  // Load message history from DB once per callId when panel first opens
  useEffect(() => {
    if (!isOpen || !callId || fetchedCallIdRef.current === callId) return;
    fetchedCallIdRef.current = callId;
    fetch(`/api/messages?callId=${encodeURIComponent(callId)}&limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.messages) return;
        const myId = session?.user?.id;
        const loaded = data.messages.map((m: {
          id: string;
          content: string;
          userId: string;
          user: { username: string; avatar: string | null };
          createdAt: string;
          isDeleted: boolean;
        }) => ({
          id: m.id,
          content: m.content,
          userId: m.userId === myId ? 'me' : m.userId,
          username: m.user.username,
          avatar: m.user.avatar,
          createdAt: new Date(m.createdAt),
          isDeleted: m.isDeleted,
          deliveryState: 'delivered' as const,
        }));
        // Merge: DB messages first, then any in-memory messages not already in DB
        const dbIds = new Set(loaded.map((m: { id: string }) => m.id));
        const existingNew = useChatStore.getState().messages.filter(
          (m) => !dbIds.has(m.id)
        );
        setMessages([...loaded, ...existingNew]);
      })
      .catch(() => {});
  }, [isOpen, callId, session?.user?.id, setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !callId) return;
    const tempId = `temp-${Date.now()}`;
    addMessage({
      id: tempId,
      content: input,
      userId: 'me',
      username: 'Me',
      createdAt: new Date(),
      isDeleted: false,
      deliveryState: 'sending',
    });
    send({ type: 'chat:send', payload: { callId, content: input }, id: tempId });
    setInput('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-y-0 right-0 w-[280px] md:w-[320px] z-[60] flex flex-col p-3 pointer-events-none"
        >
          <div className="h-full w-full glass-dark rounded-2xl overflow-hidden flex flex-col pointer-events-auto">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-glass)]">
              <h2 className="text-[14px] font-semibold text-white">Chat</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-secondary)]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Now-playing card */}
            {nowPlaying && (
              <div className="mx-3 mt-2 p-2.5 rounded-xl bg-[var(--cyan-dim)] border border-[var(--border-cyan)] flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center shrink-0 text-base">
                  🎵
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[var(--cyan)] truncate">{nowPlaying.title}</p>
                  {nowPlaying.artist && (
                    <p className="text-[10px] text-[var(--text-secondary)] truncate">{nowPlaying.artist}</p>
                  )}
                </div>
                <span className="text-[9px] text-[var(--text-secondary)] shrink-0 ml-auto">Now Playing</span>
              </div>
            )}

            {/* Reaction counts */}
            {Object.keys(reactionCounts).length > 0 && (
              <div className="px-3 pt-2 flex flex-wrap gap-1">
                {Object.entries(reactionCounts).map(([emoji, count]) => (
                  <span key={emoji} className="inline-flex items-center gap-0.5 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-full px-2 py-0.5 text-[11px]">
                    {emoji} <span className="text-[var(--text-secondary)]">{count}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-[var(--text-secondary)] text-sm">
                  No messages yet
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.userId === 'me';
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex gap-2", isMe ? "justify-end" : "justify-start")}
                    >
                      {!isMe && <Avatar username={msg.username} size="sm" />}
                      <div className={cn(
                        "max-w-[75%] px-3 py-2 rounded-lg text-[12px]",
                        isMe 
                          ? "bg-[var(--cyan-dim)] border border-[var(--border-cyan)] text-white rounded-tr-sm" 
                          : "glass rounded-tl-sm"
                      )}>
                        <p className="leading-relaxed break-words">{msg.content}</p>
                        <p className="text-[10px] mt-1 opacity-40 text-right">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </motion.div>
                  );
                })
              )}
              {typingUsers.size > 0 && (
                <div className="flex items-center gap-2 text-[10px] text-[var(--cyan)] animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)]" />
                  typing...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-[var(--border-glass)]">
              <div className="flex items-center gap-2 glass rounded-full px-4 py-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-[var(--text-tertiary)]"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="w-7 h-7 rounded-full bg-[var(--cyan-dim)] border border-[var(--border-cyan)] flex items-center justify-center text-[var(--cyan)] disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}