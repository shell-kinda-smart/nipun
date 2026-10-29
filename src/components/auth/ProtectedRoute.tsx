import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore, useCurrentUser, usePermissions } from '@/store/auth'
import { PageLoader } from '@/components/shared/PageLoader'
import type { Permission } from '@/data'

interface ProtectedRouteProps {
  children: ReactNode
  permission?: Permission
}

/**
 * Client-side route guard.
 *
 * This is a convenience, not a security control: it keeps unauthenticated
 * visitors off the app and hides screens a role cannot use. Every endpoint
 * behind these routes enforces the same permission on the server, so a
 * direct API call cannot bypass anything this component checks.
 *
 * The session is restored asynchronously, so the guard waits for that to
 * finish before deciding — otherwise a deep link would bounce through the
 * sign-in screen and back to the dashboard.
 */
export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const user = useCurrentUser()
  const status = useAuthStore((s) => s.status)
  const permissions = usePermissions()

  if (status === 'loading') return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (permission && !permissions.includes(permission)) {
    return <Navigate to="/forbidden" replace />
  }
  return <>{children}</>
}
