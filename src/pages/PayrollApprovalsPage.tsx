import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, X, Send } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'
import { formatINR } from '@/lib/format'
import { useHasPermission } from '@/store/auth'
import type { PayrollRun } from '@/data'

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

export function PayrollApprovalsPage() {
  usePageMeta('Approvals · PayLens', 'Payroll runs that are waiting for a decision.')
  const runsQuery = useApi<PayrollRun[]>('/api/payroll/approvals')
  const [rejecting, setRejecting] = useState<PayrollRun | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const canApprove = useHasPermission('payroll:approve')
  const canReject = useHasPermission('payroll:reject')
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data])

  const decide = async (run: PayrollRun, action: 'approve' | 'reject') => {
    setBusy(true)
    try {
      if (action === 'approve') {
        await apiSend('POST', `/api/payroll/runs/${run.id}/approve`)
        toast.success('Payroll approved')
      } else {
        await apiSend('POST', `/api/payroll/runs/${run.id}/reject`, { reason: reason.trim() })
        toast.success('Payroll sent back')
      }
      setRejecting(null)
      setReason('')
      runsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The decision could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decisions"
        title="Approvals"
        description="Runs submitted for approval. Preparing a run does not grant the right to approve it."
      />

      <Card>
        <CardHeader>
          <CardTitle>Waiting for a decision</CardTitle>
          <CardDescription>{runs.length} runs</CardDescription>
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
                  <th className="px-4 py-3 text-right font-semibold">Decision</th>
                </tr>
              </thead>
              <tbody>
                {runsQuery.loading && runs.length === 0 ? (
                  Array.from({ length: 4 }).map((_, r) => (
                    <tr key={r} className="border-b border-border/50">
                      {Array.from({ length: 5 }).map((__, c) => (
                        <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : runsQuery.error ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground">{runsQuery.error.message}</p>
                        <Button variant="outline" size="sm" onClick={runsQuery.reload}>Try again</Button>
                      </div>
                    </td>
                  </tr>
                ) : runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Nothing is waiting for approval.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {new Date(run.year, run.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">{run.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[run.status] ?? 'secondary'}>
                          {STATUS_LABEL[run.status] ?? run.status}
                        </Badge>
                        {run.rejectionReason && (
                          <div className="mt-1 max-w-xs text-[11px] text-muted-foreground">
                            {run.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{run.employeesCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatINR(run.totalGross, { compact: true })}</td>
                      <td className="px-4 py-3 text-right">
                        {run.status === 'submitted' ? (
                          <div className="flex justify-end gap-2">
                            {canReject && (
                              <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(run)}>
                                <X className="h-4 w-4" />
                                Send back
                              </Button>
                            )}
                            {canApprove && (
                              <Button size="sm" disabled={busy} onClick={() => decide(run, 'approve')}>
                                <Check className="h-4 w-4" />
                                Approve
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {run.status === 'approved' ? 'Ready to finalise' : '—'}
                          </span>
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

      <Dialog open={rejecting !== null} onOpenChange={(open) => { if (!open) setRejecting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this payroll back</DialogTitle>
            <DialogDescription>
              The run returns to the preparer with your reason. Nothing is finalised.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What needs to change?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejecting(null); setReason('') }}>Cancel</Button>
            <Button
              disabled={!reason.trim() || busy}
              onClick={() => rejecting && decide(rejecting, 'reject')}
            >
              <Send className="h-4 w-4" />
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
