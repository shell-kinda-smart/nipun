import { useEffect, useState } from 'react'
import { Edit } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageLoader } from '@/components/shared/PageLoader'
import { useAuthStore, useCurrentEmployee, useCurrentUser } from '@/store/auth'
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/data'
import { initials } from '@/lib/format'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'

import { usePageMeta } from '@/lib/usePageMeta'

/** `GET /api/settings/profile` — the signed-in user's own account record. */
interface SettingsProfile {
  id: string
  name: string
  email: string
  role: 'admin' | 'hr' | 'finance' | 'employee'
  employeeId: string | null
  avatarSeed: string
  permissions: string[]
}

/**
 * Every answer arrives in a `{ "data": … }` envelope. Some endpoints wrap the
 * payload a second time, so the inner object is unwrapped when it is there.
 */
function toObject<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const inner = (payload as { data?: unknown }).data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner as T
  return payload as T
}

export function ProfileSettings() {
  usePageMeta('Profile · PayLens', 'Your account information.')
  const user = useCurrentUser()
  const emp = useCurrentEmployee()
  const { data: payload, loading, error, reload } = useApi<SettingsProfile | { data: SettingsProfile }>(
    '/api/settings/profile',
  )
  const profile = toObject<SettingsProfile>(payload)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile && !editing) setDraft(profile.name)
  }, [profile, editing])

  if (!user) return <PageLoader label="Loading profile" />

  const name = profile?.name ?? user.name
  const email = profile?.email ?? user.email
  const role = profile?.role ?? user.role
  const avatarSeed = profile?.avatarSeed ?? user.avatarSeed

  const startEditing = () => {
    setDraft(profile?.name ?? user.name)
    setEditing(true)
  }

  const save = async () => {
    const next = draft.trim()
    if (!next) {
      toast.error('Your name cannot be empty.')
      return
    }
    setSaving(true)
    try {
      await apiSend('PUT', '/api/settings/profile', { name: next })
      toast.success('Profile updated')
      setEditing(false)
      reload()
      // Refresh the signed-in user so the name in the shell follows too.
      await useAuthStore.getState().refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Your profile could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false)
                setDraft(profile?.name ?? user.name)
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => { void save() }} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Edit className="h-4 w-4" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <EmptyState
            title="Could not load your profile"
            description={error.message}
            action={
              <Button variant="outline" size="sm" onClick={reload}>
                Try again
              </Button>
            }
          />
        ) : loading ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${avatarSeed}`} />
              <AvatarFallback className="text-xl">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              {editing ? (
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Your name"
                  autoFocus
                />
              ) : (
                <div className="font-medium">{name}</div>
              )}
              <div className="text-sm text-muted-foreground">{email}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
                {emp && <Badge variant="outline">{emp.designation}</Badge>}
                {emp && <Badge variant="outline">{emp.id}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
