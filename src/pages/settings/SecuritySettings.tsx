import { useEffect, useState } from 'react'
import { Shield, KeyRound, Building2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageLoader } from '@/components/shared/PageLoader'
import { useAuthStore, useCurrentUser } from '@/store/auth'
import { ROLE_LABELS } from '@/data'
import { usePageMeta } from '@/lib/usePageMeta'
import { useApi } from '@/hooks/useApi'
import { ApiError, apiSend } from '@/lib/api'

/** `GET /api/settings/preferences` — notification + security preferences. */
interface Preferences {
  emailNotifications: boolean
  pushNotifications: boolean
  desktopAlerts: boolean
  autoLock: boolean
  newDeviceAlerts: boolean
  timezone: string
}

/** `GET /api/settings/profile` — carries the signed-in user's permissions. */
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

export function SecuritySettings() {
  usePageMeta('Security · PayLens', 'Two-factor, password and session controls.')
  const user = useCurrentUser()
  const signOut = useAuthStore((s) => s.signOut)
  const {
    data: prefsPayload,
    loading: prefsLoading,
    error: prefsError,
    reload: reloadPrefs,
  } = useApi<Preferences | { data: Preferences }>('/api/settings/preferences')
  const { data: profilePayload } = useApi<SettingsProfile | { data: SettingsProfile }>(
    '/api/settings/profile',
  )
  const prefs = toObject<Preferences>(prefsPayload)
  const profile = toObject<SettingsProfile>(profilePayload)

  // The server replaces the whole preference row on every write, so the page
  // keeps a local copy and always sends every field back.
  const [local, setLocal] = useState<Preferences | null>(null)
  const [changing, setChanging] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (prefs) setLocal(prefs)
  }, [prefs])

  if (!user) return <PageLoader label="Loading security settings" />

  const perms = profile?.permissions ?? []
  const role = profile?.role ?? user.role

  const setPref = async (patch: Partial<Preferences>) => {
    if (!local) return
    const previous = local
    const next = { ...previous, ...patch }
    setLocal(next)
    try {
      await apiSend('PUT', '/api/settings/preferences', next)
      toast.success('Preference saved')
    } catch (err) {
      setLocal(previous)
      toast.error(err instanceof Error ? err.message : 'The preference could not be saved.')
    }
  }

  const submitPassword = async () => {
    setFieldErrors({})
    setSavingPassword(true)
    try {
      await apiSend('POST', '/api/auth/password', { currentPassword, newPassword })
      toast.success('Password updated', {
        description: 'Other devices have been signed out.',
      })
      setCurrentPassword('')
      setNewPassword('')
      setChanging(false)
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors
        setFieldErrors({
          currentPassword: fields.currentPassword?.join(' ') ?? '',
          newPassword: fields.newPassword?.join(' ') ?? '',
        })
        toast.error(err.message)
      } else {
        toast.error('Your password could not be changed.')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary-ink" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>Authentication & session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {prefsError ? (
            <EmptyState
              title="Could not load your preferences"
              description={prefsError.message}
              action={
                <Button variant="outline" size="sm" onClick={reloadPrefs}>
                  Try again
                </Button>
              }
            />
          ) : prefsLoading || !local ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <>
              <Row
                icon={<KeyRound className="h-4 w-4" />}
                label="Two-factor authentication"
                desc="Add an extra layer with an authenticator app"
                checked={false}
                disabled
              />
              <Row
                icon={<Shield className="h-4 w-4" />}
                label="Auto-lock after 15 minutes"
                desc="Lock screen when you're away"
                checked={local.autoLock}
                onChange={(v) => { void setPref({ autoLock: v }) }}
              />
              <Row
                icon={<Building2 className="h-4 w-4" />}
                label="New device alerts"
                desc="Email when signing in from a new device"
                checked={local.newDeviceAlerts}
                onChange={(v) => { void setPref({ newDeviceAlerts: v }) }}
              />
              <Separator className="my-3" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Password</div>
                  <div className="text-xs text-muted-foreground">Last changed 47 days ago</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFieldErrors({})
                    setChanging((v) => !v)
                  }}
                >
                  Change
                </Button>
              </div>
              {changing && (
                <div className="mt-3 space-y-3 rounded-md border border-border bg-card/40 p-3">
                  <div>
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor="current-password"
                    >
                      Current password
                    </label>
                    <Input
                      id="current-password"
                      className="mt-1"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    {fieldErrors.currentPassword && (
                      <p className="mt-1 text-xs text-destructive">{fieldErrors.currentPassword}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground" htmlFor="new-password">
                      New password
                    </label>
                    <Input
                      id="new-password"
                      className="mt-1"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    {fieldErrors.newPassword && (
                      <p className="mt-1 text-xs text-destructive">{fieldErrors.newPassword}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { void submitPassword() }} disabled={savingPassword}>
                      {savingPassword ? 'Saving…' : 'Save password'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setChanging(false)
                        setCurrentPassword('')
                        setNewPassword('')
                        setFieldErrors({})
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary-ink" />
            <CardTitle>Your permissions</CardTitle>
          </div>
          <CardDescription>
            {perms.length} permissions granted to {ROLE_LABELS[role]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {perms.map((p) => (
              <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                {p}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Sign out</CardTitle>
          <CardDescription>End your current session on this device</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => { void signOut() }}>
            <LogOut className="h-4 w-4" />
            Sign out of this device
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({
  icon, label, desc, checked, onChange, disabled,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  checked: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-accent/40">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={(v) => onChange?.(v)} />
    </div>
  )
}
