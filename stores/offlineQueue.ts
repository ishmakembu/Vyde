import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface QueuedMessage {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
  retries: number;
}

interface OfflineQueueState {
  queuedMessages: QueuedMessage[];
  addToQueue: (message: Omit<QueuedMessage, 'timestamp' | 'retries'>) => void;
  removeFromQueue: (id: string) => void;
  incrementRetry: (id: string) => void;
  clearQueue: () => void;
  getPendingMessages: () => QueuedMessage[];
}

export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queuedMessages: [],

      addToQueue: (message) => {
        const queued: QueuedMessage = {
          ...message,
          timestamp: Date.now(),
          retries: 0,
        };
        set((state) => ({
          queuedMessages: [...state.queuedMessages, queued],
        }));
      },

      removeFromQueue: (id) => {
        set((state) => ({
          queuedMessages: state.queuedMessages.filter((m) => m.id !== id),
        }));
      },

      incrementRetry: (id) => {
        set((state) => ({
          queuedMessages: state.queuedMessages.map((m) =>
            m.id === id ? { ...m, retries: m.retries + 1 } : m
          ),
        }));
      },

      clearQueue: () => {
        set({ queuedMessages: [] });
      },

      getPendingMessages: () => {
        return get().queuedMessages.filter((m) => m.retries < 3);
      },
    }),
    {
      name: 'offline-queue',
    }
  )
);

export function processOfflineQueue(send: (msg: unknown) => boolean) {
  const pending = useOfflineQueue.getState().getPendingMessages();
  
  pending.forEach((msg) => {
    const sent = send(msg);
    if (sent) {
      useOfflineQueue.getState().removeFromQueue(msg.id);
    } else {
      useOfflineQueue.getState().incrementRetry(msg.id);
    }
  });
}