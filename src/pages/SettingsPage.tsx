import { Navigate } from 'react-router-dom'

/**
 * @deprecated — kept only so older imports don't break.
 * The route table now mounts the SettingsLayout with sub-routes,
 * so `/settings` redirects to `/settings/profile`.
 */
export default function SettingsPage() {
  return <Navigate to="/settings/profile" replace />
}