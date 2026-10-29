import { useEffect, useState } from 'react'
import { Bell, Mail, Smartphone, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePageMeta } from '@/lib/usePageMeta'
import { Separator } from '@/components/ui/separator'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'

/** `GET /api/settings/preferences` — notification + security preferences. */
interface Preferences {
  emailNotifications: boolean
  pushNotifications: boolean
  desktopAlerts: boolean
  autoLock: boolean
  newDeviceAlerts: boolean
  timezone: string
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

export function NotificationsSettings() {
  usePageMeta('Notification preferences · PayLens', 'Choose what reaches you.')
  const { data: payload, loading, error, reload } = useApi<Preferences | { data: Preferences }>(
    '/api/settings/preferences',
  )
  const prefs = toObject<Preferences>(payload)

  // The server rewrites the whole preference row on every write, so every
  // field is always sent back with the change.
  const [local, setLocal] = useState<Preferences | null>(null)

  useEffect(() => {
    if (prefs) setLocal(prefs)
  }, [prefs])

  const setPref = async (patch: Partial<Preferences>) => {
    if (!local) return
    const previous = local
    const next = { ...previous, ...patch }
    setLocal(next)
    try {
      await apiSend('PUT', '/api/settings/preferences', next)
    } catch (err) {
      setLocal(previous)
      toast.error(err instanceof Error ? err.message : 'The preference could not be saved.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary-ink" />
          <CardTitle>Notifications</CardTitle>
        </div>
        <CardDescription>Decide what reaches you · saved automatically</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {error ? (
          <EmptyState
            title="Could not load your preferences"
            description={error.message}
            action={
              <Button variant="outline" size="sm" onClick={reload}>
                Try again
              </Button>
            }
          />
        ) : loading || !local ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <Row
              icon={<Mail className="h-4 w-4" />}
              label="Email notifications"
              desc="Payroll runs, anomalies, weekly summary"
              checked={local.emailNotifications}
              onChange={(v) => { void setPref({ emailNotifications: v }) }}
            />
            <Row
              icon={<Smartphone className="h-4 w-4" />}
              label="Push notifications"
              desc="Real-time alerts in your browser"
              checked={local.pushNotifications}
              onChange={(v) => { void setPref({ pushNotifications: v }) }}
            />
            <Row
              icon={<Monitor className="h-4 w-4" />}
              label="Desktop alerts"
              desc="System-level toasts on macOS / Windows"
              checked={local.desktopAlerts}
              onChange={(v) => { void setPref({ desktopAlerts: v }) }}
            />
            <Separator className="my-3" />
            <div className="space-y-2">
              <div className="text-sm font-medium">Categories</div>
              <Row
                icon={<Bell className="h-4 w-4" />}
                label="Anomaly alerts"
                desc="Critical and high severity anomalies"
                checked
                disabled
              />
              <Row
                icon={<Bell className="h-4 w-4" />}
                label="Payroll reminders"
                desc="When a new pay period is approaching"
                checked
                disabled
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange?.(v)}
      />
    </div>
  )
}
