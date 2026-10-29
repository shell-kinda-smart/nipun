import { useEffect } from 'react'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { AppRoutes } from '@/routes'
import { useAuthStore } from '@/store/auth'

export default function App() {
  const refresh = useAuthStore((s) => s.refresh)

  // Restore the session on first load: the session lives in an HttpOnly
  // cookie, so the only way to know who is signed in is to ask the server.
  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  )
}
