import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { UserMinus, Plus, ChevronRight, FileText } from 'lucide-react'
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
import type { Employee, TerminationRequest } from '@/data'

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
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Sent back',
  notice_issued: 'Notice issued',
  acknowledged: 'Acknowledged',
  settled: 'Settled',
  completed: 'Completed',
}

export function TerminationsPage() {
  usePageMeta('Terminations · PayLens', 'Requests to end an employment, and where each one sits.')
  const listQuery = useApi<TerminationRequest[]>('/api/terminations')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [category, setCategory] = useState('resignation')
  const [reason, setReason] = useState('')
  const [hrNotes, setHrNotes] = useState('')
  const [lastWorkingDay, setLastWorkingDay] = useState(new Date().toISOString().slice(0, 10))
  const [noticePeriodDays, setNoticePeriodDays] = useState(30)
  const [busy, setBusy] = useState(false)

  const canWrite = useHasPermission('termination:write')
  const requests = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const employeesQuery = useApi<Employee[]>(creating ? '/api/employees' : null, {
    q: search || undefined,
    perPage: 25,
  })
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data])

  const create = async () => {
    if (!employeeId || !reason.trim() || !lastWorkingDay) return
    setBusy(true)
    try {
      await apiSend('POST', '/api/terminations', {
        employeeId,
        category,
        reason: reason.trim(),
        hrNotes: hrNotes.trim() || undefined,
        lastWorkingDay,
        noticePeriodDays,
      })
      toast.success('Termination request created')
      setCreating(false)
      setEmployeeId('')
      setReason('')
      setHrNotes('')
      listQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The request could not be created.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workforce"
        title="Terminations"
        description="Submitting a request does not terminate anybody. It has to be approved, and the notice issued."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New request
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>{requests.length} records</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Last working day</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {listQuery.loading && requests.length === 0 ? (
                  Array.from({ length: 4 }).map((_, r) => (
                    <tr key={r} className="border-b border-border/50">
                      {Array.from({ length: 5 }).map((__, c) => (
                        <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : listQuery.error ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground">{listQuery.error.message}</p>
                        <Button variant="outline" size="sm" onClick={listQuery.reload}>Try again</Button>
                      </div>
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No termination request has been raised.
                    </td>
                  </tr>
                ) : (
                  requests.map((request) => (
                    <tr key={request.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link to={`/terminations/${request.id}`} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <UserMinus className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block font-medium">{request.employeeName}</span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {request.id} · {request.designation}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm capitalize">
                        {request.category.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-sm">{request.lastWorkingDay}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[request.status] ?? 'secondary'}>
                          {STATUS_LABEL[request.status] ?? request.status}
                        </Badge>
                      </td>
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

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New termination request</DialogTitle>
            <DialogDescription>
              The request is a draft. It has to be submitted and approved before anything changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="term-employee">Employee</Label>
              <Input
                id="term-employee"
                placeholder="Search by name or ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {employeesQuery.loading && <div className="p-3"><Skeleton className="h-8 w-full" /></div>}
                {!employeesQuery.loading && employees.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">No employee matches.</p>
                )}
                {employees.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEmployeeId(e.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60 ${employeeId === e.id ? 'bg-accent' : ''}`}
                  >
                    <span>{e.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{e.id}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resignation">Resignation</SelectItem>
                    <SelectItem value="termination">Termination</SelectItem>
                    <SelectItem value="retirement">Retirement</SelectItem>
                    <SelectItem value="end_of_contract">End of contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="term-notice">Notice period (days)</Label>
                <Input
                  id="term-notice"
                  type="number"
                  min={0}
                  max={365}
                  value={noticePeriodDays}
                  onChange={(e) => setNoticePeriodDays(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-lwd">Last working day</Label>
              <Input
                id="term-lwd"
                type="date"
                value={lastWorkingDay}
                onChange={(e) => setLastWorkingDay(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-reason">Reason</Label>
              <Input
                id="term-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is the employment ending?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-notes">HR notes (optional)</Label>
              <Input
                id="term-notes"
                value={hrNotes}
                onChange={(e) => setHrNotes(e.target.value)}
                placeholder="Internal notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button disabled={!employeeId || !reason.trim() || !lastWorkingDay || busy} onClick={create}>
              Create request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
