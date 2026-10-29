import { useMemo, useState } from 'react'
import {
  Activity, LogIn, LogOut, UserPlus, Edit, Trash2, Play, CheckCircle2, Settings, Download, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Pagination } from '@/components/shared/Pagination'
import { ApiError, apiDownload, buildQuery } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import { ROLE_LABELS } from '@/data'
import { relativeTime, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Role } from '@/data'

const ACTION_META: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  login: { icon: LogIn, label: 'Logged in', color: 'text-info' },
  logout: { icon: LogOut, label: 'Logged out', color: 'text-muted-foreground' },
  'employee.created': { icon: UserPlus, label: 'Employee added', color: 'text-success' },
  'employee.updated': { icon: Edit, label: 'Employee updated', color: 'text-info' },
  'employee.deleted': { icon: Trash2, label: 'Employee deleted', color: 'text-destructive' },
  'payroll.processed': { icon: Play, label: 'Payroll processed', color: 'text-primary-ink' },
  'payroll.approved': { icon: CheckCircle2, label: 'Payroll approved', color: 'text-success' },
  'salary.changed': { icon: Edit, label: 'Salary changed', color: 'text-warning' },
  'role.changed': { icon: Settings, label: 'Role changed', color: 'text-warning' },
  'report.generated': { icon: FileText, label: 'Report generated', color: 'text-info' },
  'settings.updated': { icon: Settings, label: 'Settings updated', color: 'text-info' },
  'anomaly.resolved': { icon: CheckCircle2, label: 'Anomaly resolved', color: 'text-success' },
}

const PAGE_SIZE = 10

/** A row of GET /api/audit-logs. */
interface AuditLogRow {
  id: string
  actor: string
  actorRole: Role
  action: string
  entity: string
  entityId: string | null
  description: string
  timestamp: string
  ipAddress: string | null
}

export function AuditPage() {
  usePageMeta('Audit log · PayLens', 'Every action tracked with actor, time and entity.')
  const [actor, setActor] = useState<string>('all')
  const [action, setAction] = useState<string>('all')
  const [page, setPage] = useState(0)

  const actorParam = actor === 'all' ? undefined : actor
  const actionParam = action === 'all' ? undefined : action

  // The trail is filtered and paged by the server.
  const { data, meta, loading, error } = useApi<AuditLogRow[] | { data: AuditLogRow[] }>(
    '/api/audit-logs',
    { actor: actorParam, action: actionParam, page: page + 1, perPage: PAGE_SIZE },
  )
  // A second, unpaged request for the unfiltered total shown in the header.
  const { meta: totalMeta } = useApi<AuditLogRow[] | { data: AuditLogRow[] }>('/api/audit-logs', { perPage: 1 })

  const logs = useMemo(() => toList<AuditLogRow>(data), [data])

  const total = Number(meta?.total ?? 0)
  const allTotal = Number(totalMeta?.total ?? total)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)

  const actions = useMemo(() => toStringList(meta?.actions), [meta])
  const actors = useMemo(() => toStringList(meta?.actors), [meta])

  // Group the *paged* slice by day so the timeline header only shows days
  // visible on the current page.
  const grouped = useMemo(() => {
    const groups = new Map<string, AuditLogRow[]>()
    for (const log of logs) {
      const date = log.timestamp.slice(0, 10)
      const list = groups.get(date) ?? []
      list.push(log)
      groups.set(date, list)
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [logs])

  const reset = (next: string, setter: (v: string) => void) => {
    setter(next)
    setPage(0)
  }

  const exportLog = async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    try {
      await apiDownload(
        `/api/audit-logs.csv${buildQuery({ actor: actorParam, action: actionParam })}`,
        `paylens-audit-${stamp}.csv`,
      )
      toast.success('Audit log exported', {
        description: `${total} entries · CSV · ${stamp}`,
      })
    } catch (err) {
      toast.error('The audit log could not be exported', {
        description: err instanceof ApiError ? err.message : 'Please try again.',
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Audit Log"
        description={`${total} of ${allTotal} entries · last 30 days`}
        actions={
          <Button variant="outline" onClick={exportLog} disabled={total === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={actor} onValueChange={(v) => reset(v, setActor)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              {actors.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={(v) => reset(v, setAction)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_META[a]?.label || a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {grouped.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          {error ? 'The audit log could not be loaded.' : loading ? 'Loading audit log…' : 'No audit entries match your filters.'}
        </Card>
      ) : (
        <>
          <div className="space-y-6">
            {grouped.map(([date, dayLogs]) => (
              <div key={date}>
                <div className="mb-2 flex items-center gap-3">
                  <h3 className="text-sm font-semibold">{formatShortDate(date)}</h3>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {dayLogs.length} event{dayLogs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <Card>
                  <ul className="divide-y divide-border">
                    {dayLogs.map((log) => {
                      const meta = ACTION_META[log.action] || {
                        icon: Activity,
                        label: log.action,
                        color: 'text-muted-foreground',
                      }
                      const Icon = meta.icon
                      return (
                        <li key={log.id} className="flex items-start gap-3 p-3">
                          <div
                            className={cn(
                              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted',
                              meta.color,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{log.actor}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                {ROLE_LABELS[log.actorRole] ?? log.actorRole}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{meta.label}</span>
                              {log.ipAddress && (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  from {log.ipAddress}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">{log.description}</div>
                            {log.entityId && (
                              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                                {log.entity} · {log.entityId}
                              </div>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {relativeTime(log.timestamp)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <Card>
              <Pagination
                page={safePage}
                totalPages={totalPages}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </Card>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Some list endpoints answer with `{ "data": [...] }` and some with a bare
 * array; accept either so the page keeps working with both envelopes.
 */
function toList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const inner = (payload as { data?: unknown }).data
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}

function toStringList(payload: unknown): string[] {
  if (!Array.isArray(payload)) return []
  return payload.filter((v): v is string => typeof v === 'string')
}
