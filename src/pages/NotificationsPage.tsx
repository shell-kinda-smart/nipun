import { useState } from 'react'
import { Bell, CheckCheck, AlertTriangle, Info, XCircle, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApi } from '@/hooks/useApi'
import { useNotifications, useNotificationStore } from '@/store/notifications'
import type { AppNotification } from '@/data'

const iconFor = (type: 'info' | 'success' | 'warning' | 'error') => {
  switch (type) {
    case 'success':
      return CheckCircle2
    case 'warning':
      return AlertTriangle
    case 'error':
      return XCircle
    default:
      return Info
  }
}
const colorFor = (type: 'info' | 'success' | 'warning' | 'error') => {
  switch (type) {
    case 'success':
      return 'text-success bg-success/10'
    case 'warning':
      return 'text-warning bg-warning/15'
    case 'error':
      return 'text-destructive bg-destructive/10'
    default:
      return 'text-info bg-info/10'
  }
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

export function NotificationsPage() {
  usePageMeta('Notifications · PayLens', 'Inbox of system, payroll and anomaly alerts.')
  // The store is the shared, server-backed list (it also feeds the sidebar
  // badge). The page mirrors the same endpoint so it can show a failure and
  // offer a retry instead of an empty inbox.
  const notifs = useNotifications()
  const storeLoading = useNotificationStore((s) => s.loading)
  const { data: fetched, loading: fetchLoading, error, reload } = useApi<AppNotification[]>(
    '/api/notifications',
  )
  const [tab, setTab] = useState('all')
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const load = useNotificationStore((s) => s.load)

  const list = notifs.length > 0 ? notifs : toList<AppNotification>(fetched)
  const loading = storeLoading || fetchLoading
  const filtered = list.filter((n) => {
    if (tab === 'unread') return !n.read
    if (tab === 'payroll') return n.category === 'payroll'
    if (tab === 'anomaly') return n.category === 'anomaly'
    return true
  })
  const unread = list.filter((n) => !n.read).length

  /** Re-reads the inbox from the server (the store keeps the shared cache). */
  const refresh = () => {
    void load()
    reload()
  }

  const handleMarkRead = async (id: string) => {
    try {
      await markRead(id)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The notification could not be updated.')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllRead()
      reload()
      toast.success('All notifications marked as read')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The notifications could not be updated.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description={`${unread} unread of ${list.length} total`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { refresh(); toast.info('Reloaded from server') }}>
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={() => { void handleMarkAllRead() }}>
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="anomaly">Anomalies</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-3">
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="flex gap-4 p-4">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : error ? (
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Could not load notifications"
              description={error.message}
              action={
                <Button variant="outline" size="sm" onClick={refresh}>
                  Try again
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Nothing in this view</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((n) => {
              const Icon = iconFor(n.type)
              return (
                <Card
                  key={n.id}
                  onClick={() => { void handleMarkRead(n.id) }}
                  className={cn(
                    'cursor-pointer transition-colors',
                    !n.read && 'border-primary/30 bg-primary/[0.03]',
                  )}
                >
                  <CardContent className="flex gap-4 p-4">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                        colorFor(n.type),
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{n.title}</span>
                          {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </div>
                        <span className="text-xs text-muted-foreground">{relativeTime(n.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{n.description}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {n.category}
                        </Badge>
                        {n.severity && (
                          <Badge
                            variant={n.severity === 'high' ? 'destructive' : 'warning'}
                            className="uppercase text-[10px]"
                          >
                            {n.severity}
                          </Badge>
                        )}
                        {n.actionLabel && (
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                            <Link to={n.actionHref ?? '/notifications'}>{n.actionLabel} →</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
