import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, CircleCheck, CircleX, Clock, RotateCcw } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import type { JobRun } from '@/data'

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary' | 'info'> = {
  success: 'success',
  failed: 'destructive',
  running: 'info',
  skipped: 'secondary',
}

export function JobsPage() {
  usePageMeta('Background jobs · PayLens', 'Every scheduled execution, why it failed and whether it can run again.')
  const [status, setStatus] = useState<'all' | 'failed' | 'success'>('all')
  const runsQuery = useApi<JobRun[]>('/api/jobs', {
    status: status === 'all' ? undefined : status,
    limit: 50,
  })
  const [retrying, setRetrying] = useState<JobRun | null>(null)
  const [busy, setBusy] = useState(false)

  const canRetry = useHasPermission('jobs:retry')
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data])

  const retry = async () => {
    if (!retrying) return
    setBusy(true)
    try {
      await apiSend('POST', `/api/jobs/${retrying.id}/retry`)
      toast.success('Job retried')
      setRetrying(null)
      runsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The job could not be retried.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Background jobs"
        description="Scheduled work is logged here. A failed job is only retried when retrying it can still succeed."
        actions={
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              <SelectItem value="success">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Executions</CardTitle>
          <CardDescription>{runs.length} runs</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Job</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Attempt</th>
                  <th className="px-4 py-3 font-semibold">Started</th>
                  <th className="px-4 py-3 font-semibold">Detail</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {runsQuery.loading && runs.length === 0 ? (
                  Array.from({ length: 4 }).map((_, r) => (
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
                      No background job has run yet.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{run.jobName ?? run.kind}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {run.kind} · triggered by {run.triggeredBy}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[run.status] ?? 'secondary'}>{run.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {run.attempt} of {run.maxAttempts}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {run.startedAt}
                        {run.durationMs !== null && run.durationMs !== undefined && (
                          <div>{run.durationMs} ms</div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-sm">
                        {run.lastError ? (
                          <div className="flex items-start gap-2 text-xs text-destructive">
                            <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{run.lastError}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CircleCheck className="h-3.5 w-3.5 text-success" />
                            Completed
                          </div>
                        )}
                        {run.retryable && run.nextRetryAt && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            next attempt {run.nextRetryAt}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {run.status === 'failed' && canRetry && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!run.retryable || run.attempt >= run.maxAttempts}
                            onClick={() => setRetrying(run)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Retry
                          </Button>
                        )}
                        {run.status === 'failed' && !run.retryable && (
                          <span className="text-[11px] text-muted-foreground">Not retryable</span>
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

      <Dialog open={retrying !== null} onOpenChange={(open) => { if (!open) setRetrying(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry this job</DialogTitle>
            <DialogDescription>
              {retrying?.jobName ?? retrying?.kind} will run again. A job that has reached its attempt limit is
              not retried.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetrying(null)}>Cancel</Button>
            <Button disabled={busy} onClick={retry}>
              <RefreshCw className="h-4 w-4" />
              Retry now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
