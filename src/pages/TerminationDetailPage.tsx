import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Send, Check, X, FileText, Calculator, Wallet, Plus, ShieldCheck,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import type { Settlement, TerminationRequest } from '@/data'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'secondary' | 'destructive' | 'default'> = {
  draft: 'secondary',
  submitted: 'default',
  approved: 'info',
  rejected: 'destructive',
  notice_issued: 'warning',
  acknowledged: 'info',
  settled: 'success',
  completed: 'success',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for approval',
  approved: 'Approved',
  rejected: 'Sent back',
  notice_issued: 'Notice issued',
  acknowledged: 'Acknowledged',
  settled: 'Settled',
  completed: 'Completed',
}

export function TerminationDetailPage() {
  const { id } = useParams<{ id: string }>()
  usePageMeta('Termination request · PayLens', 'Every step of a termination, and what it needs next.')
  const requestQuery = useApi<TerminationRequest>(id ? `/api/terminations/${id}` : null)
  const [reasonFor, setReasonFor] = useState<null | 'reject'>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [letter, setLetter] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [itemLabel, setItemLabel] = useState('')
  const [itemAmount, setItemAmount] = useState('')
  const [itemKind, setItemKind] = useState<'earning' | 'deduction'>('earning')

  const canWrite = useHasPermission('termination:write')
  const canApprove = useHasPermission('termination:approve')
  const canSettle = useHasPermission('settlement:read')
  const canApproveSettlement = useHasPermission('settlement:approve')

  const request = requestQuery.data
  const settlement = request?.settlement ?? null

  const act = async (path: string, label: string, body?: unknown) => {
    if (!id) return
    setBusy(true)
    try {
      await apiSend('POST', path, body)
      toast.success(label)
      requestQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const calculateSettlement = async () => {
    if (!id) return
    setBusy(true)
    try {
      await apiSend('POST', '/api/settlements/calculate', { terminationRequestId: id })
      toast.success('Settlement calculated')
      requestQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The settlement could not be calculated.')
    } finally {
      setBusy(false)
    }
  }

  const addItem = async () => {
    if (!settlement || !itemLabel.trim()) return
    setBusy(true)
    try {
      await apiSend('POST', `/api/settlements/${settlement.id}/items`, {
        code: itemLabel.trim().toLowerCase().replace(/\s+/g, '_'),
        label: itemLabel.trim(),
        kind: itemKind,
        amount: Number(itemAmount || 0),
      })
      toast.success('Component added')
      setAddingItem(false)
      setItemLabel('')
      setItemAmount('')
      requestQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The component could not be added.')
    } finally {
      setBusy(false)
    }
  }

  if (requestQuery.loading && !request) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (requestQuery.error || !request) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Workforce" title="Termination request" />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {requestQuery.error?.message ?? 'This request could not be found.'}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={requestQuery.reload}>
            Try again
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workforce"
        title={request.employeeName}
        description={`${request.id} · ${request.designation} · ${request.departmentName}`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/terminations">
              <ArrowLeft className="h-4 w-4" />
              All requests
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Request
              <Badge variant={STATUS_VARIANT[request.status] ?? 'secondary'}>
                {STATUS_LABEL[request.status] ?? request.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              {request.category.replace('_', ' ')} · last working day {request.lastWorkingDay} ·{' '}
              {request.noticePeriodDays}-day notice period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reason</div>
              <p className="mt-1 text-sm">{request.reason}</p>
            </div>
            {request.hrNotes && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">HR notes</div>
                <p className="mt-1 text-sm text-muted-foreground">{request.hrNotes}</p>
              </div>
            )}
            {request.rejectionReason && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="font-medium text-destructive">Sent back</div>
                <div className="mt-0.5 text-muted-foreground">{request.rejectionReason}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {request.status === 'draft' && canWrite && (
                <Button size="sm" disabled={busy} onClick={() => act(`/api/terminations/${request.id}/submit`, 'Submitted for approval')}>
                  <Send className="h-4 w-4" />
                  Submit for approval
                </Button>
              )}
              {request.status === 'submitted' && canApprove && (
                <>
                  <Button size="sm" disabled={busy} onClick={() => act(`/api/terminations/${request.id}/approve`, 'Request approved')}>
                    <Check className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setReasonFor('reject')}>
                    <X className="h-4 w-4" />
                    Send back
                  </Button>
                </>
              )}
              {request.status === 'approved' && canApprove && (
                <Button size="sm" disabled={busy} onClick={() => act(`/api/terminations/${request.id}/issue-notice`, 'Notice issued')}>
                  <FileText className="h-4 w-4" />
                  Issue the notice
                </Button>
              )}
              {request.status === 'acknowledged' && canSettle && !settlement && (
                <Button size="sm" disabled={busy} onClick={calculateSettlement}>
                  <Calculator className="h-4 w-4" />
                  Calculate the settlement
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Official notice</CardTitle>
            <CardDescription>
              {request.letters.length > 0
                ? `${request.letters.length} version${request.letters.length === 1 ? '' : 's'} issued`
                : 'Not issued yet'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {request.letters.length === 0 && (
              <p className="text-sm text-muted-foreground">
                The notice is written only after the request is approved.
              </p>
            )}
            {request.letters.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLetter(l.contentHtml)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2 text-left transition-colors hover:bg-accent/60"
              >
                <span>
                  <span className="block text-sm font-medium">{l.reference}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Version {l.version}
                    {l.supersededAt ? ' · superseded' : ' · current'}
                  </span>
                </span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            {request.acknowledgedAt && (
              <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-xs">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                <span>
                  The employee acknowledged receipt on {request.acknowledgedAt}. Acknowledgement confirms
                  receipt only.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {settlement && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              Final settlement
              <Badge variant={settlement.status === 'finalized' ? 'success' : 'secondary'}>
                {settlement.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              Every component says where it came from. A manual component is one an authorised person
              entered.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full">
                <tbody>
                  {settlement.items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2">
                        <div className="text-sm">{item.label}</div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {item.source}
                          {item.note ? ` · ${item.note}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm">
                        {item.kind === 'earning' ? '+' : '−'}
                        {formatINR(item.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-accent/30">
                    <td className="px-3 py-2 text-sm font-semibold">Net payable</td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-semibold">
                      {formatINR(settlement.netPayable)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              {settlement.status === 'draft' && canSettle && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setAddingItem(true)}>
                  <Plus className="h-4 w-4" />
                  Add a component
                </Button>
              )}
              {settlement.status === 'draft' && canApproveSettlement && (
                <Button size="sm" disabled={busy} onClick={() => act(`/api/settlements/${settlement.id}/approve`, 'Settlement approved')}>
                  <Check className="h-4 w-4" />
                  Approve the settlement
                </Button>
              )}
              {settlement.status === 'approved' && canApproveSettlement && (
                <Button size="sm" disabled={busy} onClick={() => act(`/api/settlements/${settlement.id}/finalize`, 'Settlement finalised')}>
                  <ShieldCheck className="h-4 w-4" />
                  Finalise and complete the offboarding
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Sheet open={letter !== null} onOpenChange={(open) => { if (!open) setLetter(null) }}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Official notice</SheetTitle>
            <SheetDescription>This is the document as it was issued.</SheetDescription>
          </SheetHeader>
          <div
            className="prose prose-sm max-w-none py-4"
            dangerouslySetInnerHTML={{ __html: letter ?? '' }}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={reasonFor !== null} onOpenChange={(open) => { if (!open) setReasonFor(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this request back</DialogTitle>
            <DialogDescription>The requester sees the reason and can revise it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="term-reject">Reason</Label>
            <Input
              id="term-reject"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What has to change?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReasonFor(null); setReason('') }}>Cancel</Button>
            <Button
              disabled={!reason.trim() || busy}
              onClick={() => act(`/api/terminations/${request.id}/reject`, 'Request sent back', { reason: reason.trim() })}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addingItem} onOpenChange={setAddingItem}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a settlement component</DialogTitle>
            <DialogDescription>
              For components the application does not hold the data for — leave encashment, notice
              recovery, arrears.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-label">Label</Label>
              <Input
                id="item-label"
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
                placeholder="Leave encashment"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="item-kind">Type</Label>
                <select
                  id="item-kind"
                  value={itemKind}
                  onChange={(e) => setItemKind(e.target.value as 'earning' | 'deduction')}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-amount">Amount</Label>
                <Input
                  id="item-amount"
                  type="number"
                  value={itemAmount}
                  onChange={(e) => setItemAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingItem(false)}>Cancel</Button>
            <Button disabled={!itemLabel.trim() || busy} onClick={addItem}>Add component</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
