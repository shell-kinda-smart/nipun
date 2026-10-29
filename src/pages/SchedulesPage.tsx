import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Play, Pause, Plus, Mail, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'
import { useHasPermission } from '@/store/auth'
import type { ScheduledJob } from '@/data'

const REPORT_TYPES = [
  ['monthly_payroll', 'Monthly payroll'],
  ['tax_summary', 'Tax summary'],
  ['employee_salary', 'Employee salary'],
  ['department_cost', 'Department cost'],
  ['payroll_growth', 'Payroll growth'],
  ['anomaly_report', 'Anomaly report'],
  ['ytd_payroll', 'Year-to-date payroll'],
] as const

const STATUS_VARIANT: Record<string, 'success' | 'secondary' | 'destructive'> = {
  active: 'success',
  paused: 'secondary',
  cancelled: 'destructive',
}

function when(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function SchedulesPage() {
  usePageMeta('Schedules · PayLens', 'Prepare payroll and deliver recurring reports on a schedule.')
  const jobsQuery = useApi<ScheduledJob[]>('/api/schedules')
  const mailQuery = useApi<{ configured: boolean; message: string }>('/api/schedules/mail-status')
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<'payroll_preparation' | 'recurring_report'>('payroll_preparation')
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString().slice(0, 10))
  const [reportType, setReportType] = useState('monthly_payroll')
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1)
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear())
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)

  const canWrite = useHasPermission('schedules:write')
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data])

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        kind,
        name: name.trim(),
        frequency,
        scheduledAt: `${scheduledAt} 02:00:00`,
      }
      if (kind === 'payroll_preparation') {
        body.criteria = { month: periodMonth, year: periodYear }
      } else {
        body.reportType = reportType
        body.recipients = [{ email: recipient.trim() }]
        body.delivery = 'email'
      }
      await apiSend('POST', '/api/schedules', body)
      toast.success('Schedule created')
      setCreating(false)
      setName('')
      setRecipient('')
      jobsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The schedule could not be created.')
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (job: ScheduledJob, status: string) => {
    try {
      await apiSend('PATCH', `/api/schedules/${job.id}`, { status })
      toast.success(`Schedule ${status}`)
      jobsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The schedule could not be updated.')
    }
  }

  const runDue = async () => {
    try {
      const result = await apiSend<{ data: { status: string; result?: { summary?: string } }[] }>(
        'POST',
        '/api/schedules/run-due',
      )
      const ran = result.data ?? []
      toast.success(
        ran.length === 0
          ? 'Nothing was due'
          : `${ran.length} schedule${ran.length === 1 ? '' : 's'} processed`,
      )
      jobsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The schedules could not be run.')
    }
  }

  const mail = mailQuery.data

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Schedules"
        description="Preparing payroll can be automated. Approving it always stays a human decision."
        actions={
          canWrite ? (
            <>
              <Button variant="outline" size="sm" onClick={runDue}>
                <Play className="h-4 w-4" />
                Run due now
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New schedule
              </Button>
            </>
          ) : undefined
        }
      />

      {mail && !mail.configured && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-sm">
            <div className="font-medium">Email delivery is awaiting configuration</div>
            <div className="mt-0.5 text-muted-foreground">{mail.message}</div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Schedules</CardTitle>
          <CardDescription>{jobs.length} configured</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Schedule</th>
                  <th className="px-4 py-3 font-semibold">Kind</th>
                  <th className="px-4 py-3 font-semibold">Frequency</th>
                  <th className="px-4 py-3 font-semibold">Next run</th>
                  <th className="px-4 py-3 font-semibold">Last run</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {jobsQuery.loading && jobs.length === 0 ? (
                  Array.from({ length: 3 }).map((_, r) => (
                    <tr key={r} className="border-b border-border/50">
                      {Array.from({ length: 7 }).map((__, c) => (
                        <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : jobsQuery.error ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground">{jobsQuery.error.message}</p>
                        <Button variant="outline" size="sm" onClick={jobsQuery.reload}>Try again</Button>
                      </div>
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No schedules yet.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium">
                          <CalendarClock className="h-4 w-4 text-muted-foreground" />
                          {job.name}
                        </div>
                        {job.reportType && (
                          <div className="text-[11px] text-muted-foreground">{job.reportType}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {job.kind === 'payroll_preparation' ? 'Payroll preparation' : 'Recurring report'}
                      </td>
                      <td className="px-4 py-3 text-sm capitalize">{job.frequency}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{when(job.nextRunAt)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {job.lastRunAt ? when(job.lastRunAt) : 'Never'}
                        {job.lastResult && <div className="max-w-xs truncate">{job.lastResult}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[job.status] ?? 'secondary'}>{job.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && job.status === 'active' && (
                          <Button variant="ghost" size="sm" onClick={() => setStatus(job, 'paused')}>
                            <Pause className="h-4 w-4" />
                            Pause
                          </Button>
                        )}
                        {canWrite && job.status === 'paused' && (
                          <Button variant="ghost" size="sm" onClick={() => setStatus(job, 'active')}>
                            <Play className="h-4 w-4" />
                            Resume
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New schedule</DialogTitle>
            <DialogDescription>
              A scheduled payroll preparation stops at "calculated" — it is never submitted or approved automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payroll_preparation">Payroll preparation</SelectItem>
                  <SelectItem value="recurring_report">Recurring report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Monthly payroll preparation"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-at">Scheduled date</Label>
                <Input
                  id="schedule-at"
                  type="date"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </div>

            {kind === 'payroll_preparation' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="schedule-month">Payroll month</Label>
                  <Input
                    id="schedule-month"
                    type="number"
                    min={1}
                    max={12}
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-year">Payroll year</Label>
                  <Input
                    id="schedule-year"
                    type="number"
                    min={2000}
                    max={2100}
                    value={periodYear}
                    onChange={(e) => setPeriodYear(Number(e.target.value))}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Report</Label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPORT_TYPES.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-recipient">Recipient email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="schedule-recipient"
                      className="pl-9"
                      type="email"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="finance@paylens.co"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              disabled={
                busy
                || !name.trim()
                || (kind === 'recurring_report' && !recipient.trim())
              }
              onClick={create}
            >
              Create schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
