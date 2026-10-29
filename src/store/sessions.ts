import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Session {
  id: string
  userId: string
  device: string
  browser: string
  os: string
  ip: string
  location: string
  signedInAt: string
  lastActiveAt: string
  current: boolean
}

interface SessionState {
  sessions: Session[]
  addSession: (session: Session) => void
  markActive: (id: string) => void
  endSession: (id: string) => void
  endOthers: (currentId: string) => void
  endAll: () => void
  reset: () => void
}

const NOW = Date.now()
const seedSessions: Session[] = [
  {
    id: 'sess-current',
    userId: 'U001',
    device: 'MacBook Pro 16"',
    browser: 'Chrome 128',
    os: 'macOS 15.0',
    ip: '103.21.45.78',
    location: 'Mumbai, IN',
    signedInAt: new Date(NOW - 1000 * 60 * 60 * 4).toISOString(),
    lastActiveAt: new Date(NOW - 1000 * 60 * 5).toISOString(),
    current: true,
  },
  {
    id: 'sess-mobile',
    userId: 'U001',
    device: 'iPhone 15 Pro',
    browser: 'PayLens iOS',
    os: 'iOS 18.0',
    ip: '103.21.45.78',
    location: 'Mumbai, IN',
    signedInAt: new Date(NOW - 1000 * 60 * 60 * 24 * 3).toISOString(),
    lastActiveAt: new Date(NOW - 1000 * 60 * 60 * 8).toISOString(),
    current: false,
  },
  {
    id: 'sess-laptop-old',
    userId: 'U001',
    device: 'MacBook Air',
    browser: 'Safari 17',
    os: 'macOS 14.5',
    ip: '49.36.118.22',
    location: 'Bangalore, IN',
    signedInAt: new Date(NOW - 1000 * 60 * 60 * 24 * 12).toISOString(),
    lastActiveAt: new Date(NOW - 1000 * 60 * 60 * 24 * 9).toISOString(),
    current: false,
  },
  {
    id: 'sess-web-archive',
    userId: 'U001',
    device: 'Windows desktop',
    browser: 'Firefox 130',
    os: 'Windows 11',
    ip: '182.74.91.45',
    location: 'Delhi, IN',
    signedInAt: new Date(NOW - 1000 * 60 * 60 * 24 * 27).toISOString(),
    lastActiveAt: new Date(NOW - 1000 * 60 * 60 * 24 * 24).toISOString(),
    current: false,
  },
]

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      sessions: seedSessions,
      addSession: (session) =>
        set((s) => ({
          sessions: [session, ...s.sessions.filter((x) => x.id !== session.id)],
        })),
      markActive: (id) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id ? { ...x, lastActiveAt: new Date().toISOString() } : x,
          ),
        })),
      endSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
      endOthers: (currentId) =>
        set((s) => ({ sessions: s.sessions.filter((x) => x.id === currentId) })),
      endAll: () => set({ sessions: [] }),
      reset: () => set({ sessions: seedSessions }),
    }),
    { name: 'paylens.sessions' },
  ),
)