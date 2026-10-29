import { create } from 'zustand'
import { apiGetWithMeta, apiSend } from '@/lib/api'
import type { AppNotification } from '@/data'

interface NotificationState {
  notifications: AppNotification[]
  unread: number
  loading: boolean
  loaded: boolean
  load: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  reset: () => void
}

/**
 * Notifications live on the server; the read state is persisted there, not
 * in the browser. The store is a thin cache so the sidebar badge and the
 * notifications page share one request.
 */
export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unread: 0,
  loading: false,
  loaded: false,

  async load() {
    set({ loading: true })
    try {
      const result = await apiGetWithMeta<AppNotification[]>('/api/notifications')
      set({
        notifications: result.data,
        unread: Number(result.meta?.unread ?? 0),
        loading: false,
        loaded: true,
      })
    } catch {
      set({ loading: false, loaded: true })
    }
  },

  async markRead(id) {
    // Optimistic: the badge updates immediately, the server confirms.
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unread: Math.max(0, s.unread - 1),
    }))
    try {
      await apiSend('PATCH', `/api/notifications/${id}/read`)
    } finally {
      await get().load()
    }
  },

  async markAllRead() {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unread: 0,
    }))
    try {
      await apiSend('POST', '/api/notifications/read-all')
    } finally {
      await get().load()
    }
  },

  reset() {
    set({ notifications: [], unread: 0, loaded: false })
  },
}))

/** The notifications list, loaded on first use. */
export function useNotifications(): AppNotification[] {
  const notifications = useNotificationStore((s) => s.notifications)
  const loaded = useNotificationStore((s) => s.loaded)
  const load = useNotificationStore((s) => s.load)
  if (!loaded) void load()
  return notifications
}

export function useUnreadCount(): number {
  const unread = useNotificationStore((s) => s.unread)
  const loaded = useNotificationStore((s) => s.loaded)
  const load = useNotificationStore((s) => s.load)
  if (!loaded) void load()
  return unread
}
