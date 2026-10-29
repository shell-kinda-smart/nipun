import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Wallet, CircleCheck, CircleX, Clock, History } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'
import { formatINR } from '@/lib/format'
import { useHasPermission } from '@/store/auth'
import type { PaymentRecord, PaymentStatus, PaymentSummary } from '@/data'

const STATUS_VARIANT: Record<PaymentStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  paid: 'success',
  failed: 'destructive',
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
}

interface RunPayments {
  records: PaymentRecord[]
  summary: PaymentSummary
}

export function PayrollPaymentsPage() {
  usePageMeta('Payments · PayLens', 'Track what has actually been paid on each payroll run.')
  const [filter, setFilter] = useState<'all' | PaymentStatus>('all')
  const [recording, setRecording] = useState<PaymentRecord | null>(null)
  const [status, setStatus] = useState<PaymentStatus>('paid')
  const [reference, setReference] = useState('')
  const [failureReason, setFailureReason] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [historyFor, setHistoryFor] = useState<PaymentRecord | null>(null)

  const canPay = useHasPermission('payroll:pay')
  const listQuery = useApi<PaymentRecord[]>('/api/payroll/payments', {
    status: filter === 'all' ? undefined : filter,
  })
  const runQuery = useApi<RunPayments>(
    recording ? `/api/payroll/runs/${recording.payrollRunId}/payments` : null,
  )
  const historyQuery = useApi<Record<string, unknown>[]>(
    historyFor ? `/api/payroll/payments/${historyFor.id}/history` : null,
  )

  const records = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const summary = runQuery.data?.summary

  const openRecording = (record: PaymentRecord) => {
    setRecording(record)
    setStatus(record.status)
    setReference(record.reference ?? '')
    setFailureReason(record.failureReason ?? '')
    setAmount(String(record.amount))
  }

  const submit = async () => {
    if (!recording) return
    setBusy(true)
    try {
      await apiSend('POST', `/api/payroll/runs/${recording.payrollRunId}/payments`, {
        employeeId: recording.employeeId,
        status,
        reference: reference.trim() || undefined,
        failureReason: failureReason.trim() || undefined,
        amount: amount ? Number(amount) : undefined,
      })
      toast.success('Payment recorded')
      setRecording(null)
      listQuery.reload()
      runQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The payment could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Payments"
        description="A finalised run is not a paid run. Every payment is recorded here with its reference and history."
        actions={
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(['pending', 'paid', 'failed', 'total'] as const).map((key) => (
            <Card key={key} className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {key === 'total' ? 'All payments' : STATUS_LABEL[key]}
              </div>
              <div className="mt-1 font-mono text-xl font-semibold">
                {formatINR(summary[key].amount, { compact: true })}
              </div>
              <div className="text-xs text-muted-foreground">{summary[key].count} employees</div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Employee payments</CardTitle>
          <CardDescription>{records.length} records</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Run</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {listQuery.loading && records.length === 0 ? (
                  Array.from({ length: 5 }).map((_, r) => (
                    <tr key={r} className="border-b border-border/50">
                      {Array.from({ length: 6 }).map((__, c) => (
                        <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : listQuery.error ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground">{listQuery.error.message}</p>
                        <Button variant="outline" size="sm" onClick={listQuery.reload}>Try again</Button>
                      </div>
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No payment records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{record.employeeName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{record.employeeId}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {record.period ?? record.payrollRunId}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[record.status]}>{STATUS_LABEL[record.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatINR(record.amount)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {record.reference ?? record.failureReason ?? '—'}
                        {record.isManual && (
                          <span className="ml-2 rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-wide">
                            manual
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {canPay && (
                            <Button variant="ghost" size="sm" onClick={() => openRecording(record)}>
                              <Wallet className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setHistoryFor(record)}>
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={recording !== null} onOpenChange={(open) => { if (!open) setRecording(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>
              {recording?.employeeName} · {recording?.payrollRunId}. This records what happened; it does not move money.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {status === 'paid' && (
              <div className="space-y-2">
                <Label htmlFor="reference">Payment reference</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UTR / transaction reference"
                />
              </div>
            )}
            {status === 'failed' && (
              <div className="space-y-2">
                <Label htmlFor="failure">Failure reason</Label>
                <Input
                  id="failure"
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  placeholder="Why did the payment fail?"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecording(null)}>Cancel</Button>
            <Button
              disabled={busy || (status === 'paid' && !reference.trim()) || (status === 'failed' && !failureReason.trim())}
              onClick={submit}
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={historyFor !== null} onOpenChange={(open) => { if (!open) setHistoryFor(null) }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Payment history</SheetTitle>
            <SheetDescription>{historyFor?.employeeName}</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 py-4">
            {historyQuery.loading && (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
            )}
            {!historyQuery.loading && (historyQuery.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
            )}
            {(historyQuery.data ?? []).map((entry, index) => {
              const status = String(entry.new_status ?? '')
              return (
                <div key={index} className="rounded-lg border border-border bg-card/50 p-3">
                  <div className="flex items-center gap-2">
                    {status === 'paid' ? (
                      <CircleCheck className="h-4 w-4 text-success" />
                    ) : status === 'failed' ? (
                      <CircleX className="h-4 w-4 text-destructive" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">
                      {entry.previous_status ? `${entry.previous_status} → ` : ''}{STATUS_LABEL[status as PaymentStatus] ?? status}
                    </span>
                  </div>
                  {entry.reference ? (
                    <div className="mt-1 pl-6 font-mono text-xs text-muted-foreground">{String(entry.reference)}</div>
                  ) : null}
                  {entry.note ? (
                    <div className="mt-1 pl-6 text-xs text-muted-foreground">{String(entry.note)}</div>
                  ) : null}
                  <div className="mt-1 pl-6 text-[11px] text-muted-foreground/70">{String(entry.changed_at ?? '')}</div>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
