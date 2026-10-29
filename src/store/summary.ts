import { create } from 'zustand'
import { apiGet } from '@/lib/api'

export interface Summary {
  unreadNotifications: number
  openAnomalies: number
  criticalAnomalies: number
  activeEmployees: number
}

interface SummaryState extends Summary {
  loaded: boolean
  load: () => Promise<void>
}

/**
 * The counters the shell shows in its badges.
 *
 * One small request serves the sidebar, the mobile nav and the app shell, so
 * the badge numbers always agree with each other.
 */
export const useSummaryStore = create<SummaryState>()((set, get) => ({
  unreadNotifications: 0,
  openAnomalies: 0,
  criticalAnomalies: 0,
  activeEmployees: 0,
  loaded: false,

  async load() {
    if (get().loaded) return
    try {
      const data = await apiGet<Summary>('/api/summary')
      set({ ...data, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
}))

export function useSummary(): Summary {
  // Each selector returns a primitive: a selector that built a new object on
  // every call would give the store a fresh snapshot each render and loop
  // forever.
  const unreadNotifications = useSummaryStore((s) => s.unreadNotifications)
  const openAnomalies = useSummaryStore((s) => s.openAnomalies)
  const criticalAnomalies = useSummaryStore((s) => s.criticalAnomalies)
  const activeEmployees = useSummaryStore((s) => s.activeEmployees)
  const loaded = useSummaryStore((s) => s.loaded)
  const load = useSummaryStore((s) => s.load)
  if (!loaded) void load()
  return { unreadNotifications, openAnomalies, criticalAnomalies, activeEmployees }
}
