import { create } from 'zustand';

interface ChatMessage {
  id: string;
  content: string;
  imageUrl?: string;
  userId: string;
  username: string;
  avatar?: string | null;
  createdAt: Date;
  editedAt?: Date;
  isDeleted: boolean;
  deliveryState: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
}

interface ChatState {
  messages: ChatMessage[];
  typingUsers: Map<string, boolean>;
  unreadCount: number;
  isPanelOpen: boolean;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  setTypingUser: (userId: string, isTyping: boolean) => void;
  setUnreadCount: (count: number) => void;
  setIsPanelOpen: (isOpen: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  typingUsers: new Map(),
  unreadCount: 0,
  isPanelOpen: false,
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      unreadCount: state.isPanelOpen ? state.unreadCount : state.unreadCount + 1,
    })),
  updateMessage: (messageId, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    })),
  setTypingUser: (userId, isTyping) =>
    set((state) => {
      const newMap = new Map(state.typingUsers);
      if (isTyping) {
        newMap.set(userId, true);
      } else {
        newMap.delete(userId);
      }
      return { typingUsers: newMap };
    }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setIsPanelOpen: (isPanelOpen) =>
    set((state) => ({
      isPanelOpen,
      unreadCount: isPanelOpen ? 0 : state.unreadCount,
    })),
  clearMessages: () => set({ messages: [], typingUsers: new Map(), unreadCount: 0 }),
}));
