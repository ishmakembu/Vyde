import { create } from 'zustand';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

interface UIState {
  isOnline: boolean;
  theme: 'dark';
  searchQuery: string;
  activeTab: 'directory' | 'friends' | 'calls';
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  userPresenceMap: Record<string, { online: boolean; inCall: string | null }>;
  notifications: AppNotification[];
  unreadNotifCount: number;
  setIsOnline: (isOnline: boolean) => void;
  setSearchQuery: (query: string) => void;
  setActiveTab: (tab: UIState['activeTab']) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
  updateUserPresence: (userId: string, data: { online: boolean; inCall: string | null }) => void;
  setNotifications: (notifications: AppNotification[]) => void;
  addNotification: (notification: AppNotification) => void;
  markAllNotificationsRead: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isOnline: false,
  theme: 'dark',
  searchQuery: '',
  activeTab: 'directory',
  toast: null,
  userPresenceMap: {},
  notifications: [],
  unreadNotifCount: 0,
  setIsOnline: (isOnline) => set({ isOnline }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveTab: (activeTab) => set({ activeTab }),
  showToast: (message, type) => set({ toast: { message, type } }),
  hideToast: () => set({ toast: null }),
  updateUserPresence: (userId, data) =>
    set((state) => ({
      userPresenceMap: { ...state.userPresenceMap, [userId]: data },
    })),
  setNotifications: (notifications) =>
    set({ notifications, unreadNotifCount: notifications.filter((n) => !n.read).length }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadNotifCount: state.unreadNotifCount + (notification.read ? 0 : 1),
    })),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadNotifCount: 0,
    })),
}));
