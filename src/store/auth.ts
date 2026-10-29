import { create } from 'zustand'
import type { Permission, Role, User, Employee } from '@/data'
import { ApiError, apiGet, apiSend, setCsrfToken } from '@/lib/api'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthState {
  user: User | null
  employee: Employee | null
  permissions: Permission[]
  status: AuthStatus
  demoMode: boolean
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>
  signOut: () => Promise<void>
  /** Demo affordance: sign in as another seeded role. */
  switchRole: (role: Role) => Promise<void>
  refresh: () => Promise<void>
  loadEmployee: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  employee: null,
  permissions: [],
  status: 'loading',
  demoMode: false,

  async refresh() {
    try {
      const result = await apiGet<{
        user: User
        permissions: Permission[]
        csrfToken: string
        demoMode: boolean
      }>('/api/auth/me')
      setCsrfToken(result.csrfToken)
      set({
        user: result.user,
        permissions: result.permissions,
        demoMode: result.demoMode,
        status: 'authenticated',
      })
      await get().loadEmployee()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setCsrfToken(null)
        set({ user: null, employee: null, permissions: [], status: 'anonymous' })
        return
      }
      set({ status: 'anonymous' })
    }
  },

  async loadEmployee() {
    const user = get().user
    if (!user?.employeeId) {
      set({ employee: null })
      return
    }
    try {
      const employee = await apiGet<Employee>('/api/me/profile')
      set({ employee })
    } catch {
      set({ employee: null })
    }
  },

  async signIn(email, password, remember = true) {
    const result = await apiSend<{
      user: User
      csrfToken: string
      permissions: Permission[]
      demoMode: boolean
    }>('POST', '/api/auth/login', { email, password, remember })
    setCsrfToken(result.csrfToken)
    set({
      user: result.user,
      permissions: result.permissions,
      demoMode: result.demoMode,
      status: 'authenticated',
    })
    await get().loadEmployee()
  },

  async signOut() {
    try {
      await apiSend('POST', '/api/auth/logout')
    } catch {
      // The session may already be gone; the local state is cleared either way.
    }
    setCsrfToken(null)
    set({ user: null, employee: null, permissions: [], status: 'anonymous' })
  },

  async switchRole(role) {
    // Only available while the server runs in demo mode; the endpoint does
    // not exist in production.
    const result = await apiSend<{
      user: User
      csrfToken: string
      permissions: Permission[]
      demoMode: boolean
    }>('POST', '/api/auth/demo-login', { role })
    setCsrfToken(result.csrfToken)
    set({
      user: result.user,
      permissions: result.permissions,
      demoMode: result.demoMode,
      status: 'authenticated',
    })
    await get().loadEmployee()
  },
}))

export function useCurrentUser(): User | null {
  return useAuthStore((s) => s.user)
}

export function useCurrentEmployee(): Employee | null {
  return useAuthStore((s) => s.employee)
}

export function usePermissions(): Permission[] {
  return useAuthStore((s) => s.permissions)
}

export function useHasPermission(permission: Permission): boolean {
  const permissions = useAuthStore((s) => s.permissions)
  return permissions.includes(permission)
}

export function useHasAnyPermission(...perms: Permission[]): boolean {
  const permissions = useAuthStore((s) => s.permissions)
  return perms.some((p) => permissions.includes(p))
}
