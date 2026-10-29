import { useMemo, useState } from 'react'
import {
  AlertTriangle, Shield, Check, X, Clock, UserPlus, ChevronRight, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { StatCard } from '@/components/shared/StatCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Pagination } from '@/components/shared/Pagination'
import { useApi } from '@/hooks/useApi'
import { ApiError, apiSend } from '@/lib/api'
import type { Employee } from '@/data'
import { formatINR, relativeTime, initials } from '@/lib/format'
import { cn } from '@/lib/utils'

const TYPE_LABELS: Record<string, string> = {
  salary_spike: 'Salary spike',
  duplicate_payment: 'Duplicate payment',
  unusual_deduction: 'Unusual deduction',
  overtime_spike: 'Overtime spike',
  attendance_mismatch: 'Attendance mismatch',
  late_payroll: 'Late payroll',
  bank_mismatch: 'Bank mismatch',
  contract_expiring: 'Contract expiring',
}

const PAGE_SIZE = 6

/** A row of GET /api/anomalies. */
interface AnomalyRow {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigating' | 'resolved' | 'dismissed'
  employeeId: string | null
  payrollRunId: string | null
  title: string
  description: string
  detectedAt: string
  riskScore: number
  amount: number | null
  assignedTo: string | null
}

export function AnomaliesPage() {
  usePageMeta('Anomalies · PayLens', 'Auto-detected payroll irregularities with risk scoring.')
  const [severity, setSeverity] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [selected, setSelected] = useState<AnomalyRow | null>(null)
  const [page, setPage] = useState(0)

  // The filters are applied by the server.
  const { data, meta, loading, reload } = useApi<AnomalyRow[] | { data: AnomalyRow[] }>(
    '/api/anomalies',
    {
      severity: severity === 'all' ? undefined : severity,
      status: status === 'all' ? undefined : status,
    },
  )
  const { data: employeeData } = useApi<Employee[]>('/api/employees', { perPage: 200 })

  const list = useMemo(() => toList<AnomalyRow>(data), [data])
  const employees = useMemo(() => employeeData ?? [], [employeeData])
  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])

  const filtered = useMemo(() => {
    return [...list].sort((a, b) => b.riskScore - a.riskScore)
  }, [list])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const counts = (meta?.counts ?? {}) as Record<string, number>
  const stats = {
    open: counts.open ?? 0,
    investigating: counts.investigating ?? 0,
    resolved: counts.resolved ?? 0,
    critical: counts.critical ?? 0,
  }
  const total = stats.open + stats.investigating + stats.resolved + (counts.dismissed ?? 0)

  const reset = (next: string, setter: (v: string) => void) => {
    setter(next)
    setPage(0)
  }

  const update = async (a: AnomalyRow, nextStatus: 'resolved' | 'dismissed') => {
    try {
      await apiSend('PATCH', `/api/anomalies/${a.id}`, { status: nextStatus })
      toast.success(nextStatus === 'resolved' ? 'Anomaly resolved' : 'Anomaly dismissed', {
        description: a.title,
      })
      setSelected(null)
      reload()
    } catch (error) {
      toast.error('The anomaly could not be updated', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Anomalies"
        description={`${filtered.length} of ${total} anomalies · ${stats.open + stats.investigating} active`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open" value={String(stats.open)} icon={<AlertCircle className="h-4 w-4" />} hint="awaiting review" />
        <StatCard label="Investigating" value={String(stats.investigating)} icon={<Shield className="h-4 w-4" />} hint="in progress" />
        <StatCard label="Resolved" value={String(stats.resolved)} trend="down" delta={-15} icon={<Check className="h-4 w-4" />} hint="this quarter" />
        <StatCard label="Critical" value={String(stats.critical)} trend="up" delta={2} icon={<AlertTriangle className="h-4 w-4" />} hint="need attention" />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={severity} onValueChange={(v) => reset(v, setSeverity)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => reset(v, setStatus)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            Sorted by risk score · {filtered.length} match
          </div>
        </div>
      </Card>

      <Card>
        <ul className="divide-y divide-border">
          {visible.length === 0 && (
            <li className="p-12 text-center text-sm text-muted-foreground">
              {loading ? 'Loading anomalies…' : 'No anomalies match your filters.'}
            </li>
          )}
          {visible.map((a) => {
            const emp = a.employeeId ? employeesById.get(a.employeeId) ?? null : null
            return (
              <li
                key={a.id}
                onClick={() => setSelected(a)}
                className="flex cursor-pointer items-start gap-4 p-4 transition-colors hover:bg-accent/40"
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                    a.severity === 'critical'
                      ? 'bg-destructive/15 text-destructive'
                      : a.severity === 'high'
                        ? 'bg-warning/15 text-warning'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    <Badge
                      variant={
                        a.severity === 'critical'
                          ? 'destructive'
                          : a.severity === 'high'
                            ? 'warning'
                            : 'secondary'
                      }
                      className="text-[10px] uppercase"
                    >
                      {a.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {a.status}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {TYPE_LABELS[a.type] || a.type}
                    </Badge>
                  </div>
                  <div className="mt-1 line-clamp-1 text-sm text-muted-foreground">{a.description}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {emp && (
                      <span className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${emp.avatarSeed}`} />
                          <AvatarFallback className="text-[9px]">{initials(emp.name)}</AvatarFallback>
                        </Avatar>
                        {emp.name}
                      </span>
                    )}
                    {a.assignedTo && (
                      <span className="flex items-center gap-1">
                        <UserPlus className="h-3 w-3" /> {a.assignedTo}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {relativeTime(a.detectedAt)}
                    </span>
                    {a.amount != null && (
                      <span className="font-mono">{formatINR(a.amount)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk</div>
                  <div className="font-mono text-xl font-bold text-warning">{a.riskScore}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </li>
            )
          })}
        </ul>
        {totalPages > 1 && (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          {selected && (
            <AnomalyDetail
              a={selected}
              emp={selected.employeeId ? employeesById.get(selected.employeeId) ?? null : null}
              onResolve={() => update(selected, 'resolved')}
              onDismiss={() => update(selected, 'dismissed')}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function AnomalyDetail({
  a, emp, onResolve, onDismiss,
}: {
  a: AnomalyRow
  emp: Employee | null
  onResolve: () => void
  onDismiss: () => void
}) {
  return (
    <div className="space-y-5">
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              a.severity === 'critical' ? 'destructive' : a.severity === 'high' ? 'warning' : 'secondary'
            }
            className="text-[10px] uppercase"
          >
            {a.severity}
          </Badge>
          <Badge variant="outline" className="text-[10px] capitalize">
            {a.status}
          </Badge>
        </div>
        <SheetTitle className="text-xl">{a.title}</SheetTitle>
        <SheetDescription>{a.description}</SheetDescription>
      </SheetHeader>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk score</div>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-2xl font-bold text-warning">{a.riskScore}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
        <Progress value={a.riskScore} className="mt-2 h-2" />
      </div>

      {emp && (
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Employee</div>
          <div className="mt-2 flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${emp.avatarSeed}`} />
              <AvatarFallback>{initials(emp.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{emp.name}</div>
              <div className="text-xs text-muted-foreground">
                {emp.designation} · {emp.id}
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/employees/${emp.id}`}>View profile</Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</div>
          <div className="mt-1 text-sm">{TYPE_LABELS[a.type] || a.type}</div>
        </Card>
        {a.amount != null && (
          <Card className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</div>
            <div className="mt-1 font-mono text-sm">{formatINR(a.amount)}</div>
          </Card>
        )}
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Detected</div>
          <div className="mt-1 text-sm">{relativeTime(a.detectedAt)}</div>
        </Card>
        {a.assignedTo && (
          <Card className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned</div>
            <div className="mt-1 text-sm">{a.assignedTo}</div>
          </Card>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Timeline</h3>
        <ol className="space-y-3 border-l-2 border-border pl-4">
          <li className="relative">
            <span className="absolute -left-[19px] top-0 h-3 w-3 rounded-full bg-warning" />
            <div className="text-xs font-medium">Anomaly detected</div>
            <div className="text-[10px] text-muted-foreground">
              {relativeTime(a.detectedAt)} · Auto-flagged by detector
            </div>
          </li>
          {a.assignedTo && (
            <li className="relative">
              <span className="absolute -left-[19px] top-0 h-3 w-3 rounded-full bg-info" />
              <div className="text-xs font-medium">Assigned to {a.assignedTo}</div>
              <div className="text-[10px] text-muted-foreground">Manual assignment</div>
            </li>
          )}
          {a.status === 'investigating' && (
            <li className="relative">
              <span className="absolute -left-[19px] top-0 h-3 w-3 rounded-full bg-primary" />
              <div className="text-xs font-medium">Investigation started</div>
              <div className="text-[10px] text-muted-foreground">In progress</div>
            </li>
          )}
          {a.status === 'resolved' && (
            <li className="relative">
              <span className="absolute -left-[19px] top-0 h-3 w-3 rounded-full bg-success" />
              <div className="text-xs font-medium">Resolved</div>
              <div className="text-[10px] text-muted-foreground">Closed by admin</div>
            </li>
          )}
        </ol>
      </div>

      <Separator />

      {a.status !== 'resolved' && a.status !== 'dismissed' && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss}>
            <X className="h-4 w-4" />
            Dismiss
          </Button>
          <Button className="flex-1" onClick={onResolve}>
            <Check className="h-4 w-4" />
            Mark resolved
          </Button>
        </div>
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
