import { Bell, CheckCheck, AlertTriangle, Info, XCircle, CheckCircle2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { useNotifications, useNotificationStore } from '@/store/notifications'

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
      return 'text-success'
    case 'warning':
      return 'text-warning'
    case 'error':
      return 'text-destructive'
    default:
      return 'text-info'
  }
}

export function NotificationsPopover() {
  const notifs = useNotifications()
  const loading = useNotificationStore((s) => s.loading)
  const unread = notifs.filter((n) => !n.read).length
  const markAllRead = useNotificationStore((s) => s.markAllRead)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="text-xs text-muted-foreground">
              {unread} unread · {notifs.length} total
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => { void markAllRead().catch(() => undefined) }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {loading && notifs.length === 0 ? (
            <ul className="px-4 py-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3 border-b border-border/50 py-3 last:border-0">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </li>
              ))}
            </ul>
          ) : notifs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              You have no notifications.
            </p>
          ) : (
            <ul>
              {notifs.slice(0, 8).map((n) => {
                const Icon = iconFor(n.type)
                return (
                  <li key={n.id}>
                    <Link
                      to={n.actionHref ?? '/notifications'}
                      onClick={() => {
                        void useNotificationStore.getState().markRead(n.id).catch(() => undefined)
                      }}
                      className={cn(
                        'flex gap-3 border-b border-border/50 px-4 py-3 transition-colors hover:bg-accent/40',
                        !n.read && 'bg-primary/[0.04]',
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted',
                          colorFor(n.type),
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate text-sm font-medium">{n.title}</div>
                          {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.description}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{relativeTime(n.timestamp)}</span>
                          {n.severity && (
                            <Badge
                              variant={n.severity === 'high' ? 'destructive' : 'warning'}
                              className="text-[9px] uppercase"
                            >
                              {n.severity}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
        <Separator />
        <Link
          to="/notifications"
          className="block px-4 py-2.5 text-center text-xs font-medium text-primary-ink hover:bg-accent/40"
        >
          View all notifications →
        </Link>
      </PopoverContent>
    </Popover>
  )
}
