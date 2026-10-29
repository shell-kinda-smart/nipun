import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Calculator, Send, Check, X, Lock, Undo2, Users2, ChevronRight, ShieldAlert,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'
import { formatINR } from '@/lib/format'
import { useHasPermission } from '@/store/auth'
import type { PayrollRun, RunSelection } from '@/data'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'secondary' | 'destructive' | 'default'> = {
  draft: 'secondary',
  review: 'info',
  submitted: 'default',
  rejected: 'destructive',
  approved: 'success',
  finalized: 'success',
  failed: 'destructive',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  review: 'Calculated',
  submitted: 'Awaiting approval',
  rejected: 'Sent back',
  approved: 'Approved',
  finalized: 'Finalised',
  failed: 'Reversed',
}

const INELIGIBLE_REASON: Record<string, string> = {
  no_longer_employed: 'No longer employed',
  access_revoked: 'Account access revoked',
  on_hold: 'On hold',
  no_compensation: 'No compensation record',
  not_joined_yet: 'Not joined yet',
}

function monthLabel(run: PayrollRun): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${months[run.month - 1]} ${run.year}`
}

export function PayrollRunsPage() {
  usePageMeta('Payroll runs · PayLens', 'Every payroll run, who it covers and where it sits in the approval flow.')
  const runsQuery = useApi<PayrollRun[]>('/api/payroll/runs')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reasonFor, setReasonFor] = useState<null | 'reject' | 'reverse'>(null)
  const [reason, setReason] = useState('')

  const canProcess = useHasPermission('payroll:process')
  const canSubmit = useHasPermission('payroll:submit')
  const canApprove = useHasPermission('payroll:approve')
  const canReject = useHasPermission('payroll:reject')
  const canSelect = useHasPermission('payroll:select')

  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data])
  const selectionQuery = useApi<RunSelection>(
    openId ? `/api/payroll/runs/${openId}/selection` : null,
  )
  const openRun = runs.find((r) => r.id === openId) ?? null

  const act = async (path: string, label: string, body?: unknown) => {
    if (!openId) return
    setBusy(true)
    try {
      await apiSend('POST', path, body)
      toast.success(label)
      runsQuery.reload()
      selectionQuery.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The action could not be completed.'
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const actWithReason = async () => {
    if (!openId || !reason.trim()) return
    const path = reasonFor === 'reject'
      ? `/api/payroll/runs/${openId}/reject`
      : `/api/payroll/runs/${openId}/reverse`
    // Both actions record why they happened, so the reason has to travel
    // with the request.
    await act(
      path,
      reasonFor === 'reject' ? 'Payroll sent back' : 'Payroll run reversed',
      { reason: reason.trim() },
    )
    setReasonFor(null)
    setReason('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Payroll Runs"
        description="Prepare, review, submit and approve the payroll. A finalised run is not a paid run — payment is tracked separately."
      />

      <Card>
        <CardHeader>
          <CardTitle>All runs</CardTitle>
          <CardDescription>{runs.length} payroll periods</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Employees</th>
                  <th className="px-4 py-3 text-right font-semibold">Gross</th>
                  <th className="px-4 py-3 text-right font-semibold">Net</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {runsQuery.loading && runs.length === 0 ? (
                  Array.from({ length: 5 }).map((_, r) => (
                    <tr key={r} className="border-b border-border/50">
                      {Array.from({ length: 6 }).map((__, c) => (
                        <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : runsQuery.error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground">{runsQuery.error.message}</p>
                        <Button variant="outline" size="sm" onClick={runsQuery.reload}>Try again</Button>
                      </div>
                    </td>
                  </tr>
                ) : runs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No payroll runs yet. Start one from the Payroll wizard.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr
                      key={run.id}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40"
                      onClick={() => setOpenId(run.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{monthLabel(run)}</div>
                        <div className="font-mono text-xs text-muted-foreground">{run.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[run.status] ?? 'secondary'}>
                          {STATUS_LABEL[run.status] ?? run.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{run.employeesCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatINR(run.totalGross, { compact: true })}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatINR(run.totalNet, { compact: true })}</td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={openId !== null} onOpenChange={(open) => { if (!open) setOpenId(null) }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{openRun ? monthLabel(openRun) : 'Payroll run'}</SheetTitle>
            <SheetDescription>
              {openRun?.id} · {openRun?.employeesCount ?? 0} employees · {openRun ? formatINR(openRun.totalGross, { compact: true }) : ''} gross
            </SheetDescription>
          </SheetHeader>

          {selectionQuery.loading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : selectionQuery.error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">{selectionQuery.error.message}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={selectionQuery.reload}>
                Try again
              </Button>
            </div>
          ) : selectionQuery.data ? (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Selected', selectionQuery.data.summary.selected],
                  ['Excluded', selectionQuery.data.summary.excluded],
                  ['Ineligible', selectionQuery.data.summary.ineligible],
                  ['On hold', selectionQuery.data.summary.onHold],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-border bg-card/50 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                    <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>

              {selectionQuery.data.selected.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Users2 className="h-4 w-4 text-muted-foreground" />
                    On this run
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full">
                      <tbody>
                        {selectionQuery.data.selected.map((e) => (
                          <tr key={e.id} className="border-b border-border/50 last:border-0">
                            <td className="px-3 py-2">
                              <div className="text-sm font-medium">{e.name}</div>
                              <div className="font-mono text-[11px] text-muted-foreground">{e.id} · {e.departmentName}</div>
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-muted-foreground">{e.designation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectionQuery.data.excluded.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <X className="h-4 w-4 text-muted-foreground" />
                    Excluded from this run
                  </h3>
                  <ul className="space-y-1.5">
                    {selectionQuery.data.excluded.map((e) => (
                      <li key={e.id} className="rounded-lg border border-border bg-card/50 px-3 py-2">
                        <div className="text-sm font-medium">{e.name}</div>
                        <div className="text-[11px] text-muted-foreground">{e.reason}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectionQuery.data.ineligible.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    Not eligible
                  </h3>
                  <ul className="space-y-1.5">
                    {selectionQuery.data.ineligible.map((e) => (
                      <li key={e.id} className="rounded-lg border border-border bg-card/50 px-3 py-2">
                        <div className="text-sm font-medium">{e.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {INELIGIBLE_REASON[e.reason] ?? e.reason} — {e.detail}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectionQuery.data.holds.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Active holds</h3>
                  <ul className="space-y-1.5">
                    {selectionQuery.data.holds.map((h) => (
                      <li key={h.id} className="rounded-lg border border-border bg-card/50 px-3 py-2">
                        <div className="text-sm">{h.reason}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {h.employee_id} · from {h.effective_from}
                          {h.effective_to ? ` until ${h.effective_to}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          <SheetFooter className="flex flex-wrap gap-2">
            {openRun?.status === 'draft' && canProcess && (
              <Button size="sm" disabled={busy} onClick={() => act(`/api/payroll/runs/${openId}/calculate`, 'Payroll calculated')}>
                <Calculator className="h-4 w-4" />
                Calculate
              </Button>
            )}
            {openRun?.status === 'review' && canSubmit && (
              <Button size="sm" disabled={busy} onClick={() => act(`/api/payroll/runs/${openId}/submit`, 'Submitted for approval')}>
                <Send className="h-4 w-4" />
                Submit for approval
              </Button>
            )}
            {openRun?.status === 'submitted' && canApprove && (
              <Button size="sm" disabled={busy} onClick={() => act(`/api/payroll/runs/${openId}/approve`, 'Payroll approved')}>
                <Check className="h-4 w-4" />
                Approve
              </Button>
            )}
            {openRun?.status === 'submitted' && canReject && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setReasonFor('reject')}>
                <X className="h-4 w-4" />
                Send back
              </Button>
            )}
            {openRun?.status === 'approved' && canApprove && (
              <Button size="sm" disabled={busy} onClick={() => act(`/api/payroll/runs/${openId}/finalize`, 'Payroll finalised')}>
                <Lock className="h-4 w-4" />
                Finalise
              </Button>
            )}
            {openRun?.status === 'finalized' && canApprove && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setReasonFor('reverse')}>
                <Undo2 className="h-4 w-4" />
                Reverse
              </Button>
            )}
            {!canSelect && openRun?.status === 'draft' && (
              <p className="text-xs text-muted-foreground">
                You can review this run, but not change who it covers.
              </p>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={reasonFor !== null} onOpenChange={(open) => { if (!open) setReasonFor(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonFor === 'reject' ? 'Send this payroll back' : 'Reverse this payroll run'}</DialogTitle>
            <DialogDescription>
              {reasonFor === 'reject'
                ? 'The run returns to the preparer with your reason.'
                : 'The run is marked reversed. The payslips are kept, and pending payments are withdrawn.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What needs to change?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReasonFor(null); setReason('') }}>
              Cancel
            </Button>
            <Button disabled={!reason.trim() || busy} onClick={actWithReason}>
              {reasonFor === 'reject' ? 'Send back' : 'Reverse run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
