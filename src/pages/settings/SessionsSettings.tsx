import { useState } from 'react'
import {
  MonitorSmartphone, Smartphone, Monitor, MapPin, Globe, Clock, Trash2, LogOut,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageLoader } from '@/components/shared/PageLoader'
import { useCurrentUser } from '@/store/auth'
import { relativeTime } from '@/lib/format'
import { usePageMeta } from '@/lib/usePageMeta'
import { cn } from '@/lib/utils'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'

/** `GET /api/auth/sessions` — the signed-in user's own sessions. */
interface ApiSession {
  id: string
  device: string
  browser: string
  os: string
  ip: string
  location: string | null
  signedInAt: string
  lastActiveAt: string
  current: boolean
}

/**
 * Every answer arrives in a `{ "data": … }` envelope. Some endpoints wrap the
 * payload a second time, so the inner list is unwrapped when it is there.
 */
function toList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const inner = (payload as { data?: unknown }).data
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}

/**
 * The API returns MySQL datetimes ("YYYY-MM-DD HH:MM:SS", UTC). Safari's
 * Date parser rejects that form, so they are normalised to ISO first.
 */
function apiDate(value: string): string {
  if (!value) return value
  if (!value.includes(' ')) return value
  const iso = value.replace(' ', 'T')
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
}

export function SessionsSettings() {
  usePageMeta('Active sessions · PayLens', 'Manage devices that have accessed your account.')
  const user = useCurrentUser()
  const { data: payload, loading, error, reload } = useApi<ApiSession[] | { data: ApiSession[] }>(
    '/api/auth/sessions',
  )
  const [filter, setFilter] = useState<'all' | 'current'>('all')
  const [busy, setBusy] = useState(false)

  if (!user) return <PageLoader label="Loading sessions" />

  const sessions = toList<ApiSession>(payload)
  const filtered = filter === 'current' ? sessions.filter((s) => s.current) : sessions

  const endSession = async (session: ApiSession) => {
    setBusy(true)
    try {
      await apiSend('DELETE', `/api/auth/sessions/${session.id}`)
      toast.success('Session ended', {
        description: session.location
          ? `${session.device} (${session.location})`
          : session.device,
      })
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The session could not be ended.')
    } finally {
      setBusy(false)
    }
  }

  const endOthers = async () => {
    const others = sessions.filter((s) => !s.current)
    if (others.length === 0) return
    setBusy(true)
    try {
      await Promise.all(
        others.map((s) => apiSend('DELETE', `/api/auth/sessions/${s.id}`)),
      )
      toast.success('All other sessions signed out')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The other sessions could not be ended.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-primary-ink" />
            <CardTitle>Active sessions</CardTitle>
          </div>
          <CardDescription>
            {sessions.length} device{sessions.length !== 1 ? 's' : ''} have accessed your account · sorted by most recent
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-card/40 p-0.5">
            {(['all', 'current'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f === 'all' ? 'All' : 'This device'}
              </button>
            ))}
          </div>
          {sessions.length > 1 && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { void endOthers() }}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out others
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <EmptyState
            title="Could not load your sessions"
            description={error.message}
            action={
              <Button variant="outline" size="sm" onClick={reload}>
                Try again
              </Button>
            }
          />
        ) : loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-3">
            {[...filtered]
              .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
              .map((s) => {
                const deviceIcon = /iPhone|iPad|Android|Mobile/i.test(s.device) ? Smartphone : Monitor
                const DeviceIcon = deviceIcon
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                      s.current ? 'border-success/30 bg-success/[0.04]' : 'border-border bg-card/40',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                        s.current ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <DeviceIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{s.device}</span>
                        {s.current && (
                          <Badge variant="success" className="text-[10px] uppercase">
                            Current
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {s.browser}
                        </Badge>
                      </div>
                      <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {s.location ?? 'Unknown'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          <span className="font-mono">{s.ip}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          active {relativeTime(apiDate(s.lastActiveAt))}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        Signed in {relativeTime(apiDate(s.signedInAt))} · {s.os}
                      </div>
                    </div>
                    {!s.current && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() => { void endSession(s) }}
                        aria-label={`End ${s.device} session`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                )
              })}
            {filtered.length === 0 && (
              <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No sessions.
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
