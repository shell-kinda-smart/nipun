import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PauseCircle, PlayCircle, Search, UserMinus } from 'lucide-react'
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
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { useApi } from '@/hooks/useApi'
import { apiSend } from '@/lib/api'
import { useHasPermission } from '@/store/auth'
import type { Employee, EmployeeHold } from '@/data'

interface HoldRow extends EmployeeHold {
  employee_name: string
  designation?: string
  department_name?: string
}

const STATUS_VARIANT: Record<string, 'success' | 'secondary'> = {
  active: 'secondary',
  released: 'success',
}

export function EmployeeHoldsPage() {
  usePageMeta('Holds · PayLens', 'Employees on hold, and the hold that keeps them out of a payroll run.')
  const holdsQuery = useApi<HoldRow[]>('/api/holds')
  const [placing, setPlacing] = useState(false)
  const [search, setSearch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState('temporary')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [effectiveTo, setEffectiveTo] = useState('')
  const [busy, setBusy] = useState(false)

  const canHold = useHasPermission('employees:hold')
  const employeesQuery = useApi<Employee[]>(
    placing ? '/api/employees' : null,
    { q: search || undefined, perPage: 25 },
  )

  const holds = useMemo(() => holdsQuery.data ?? [], [holdsQuery.data])
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data])

  const place = async () => {
    if (!employeeId || !reason.trim()) return
    setBusy(true)
    try {
      await apiSend('POST', `/api/employees/${employeeId}/holds`, {
        reason: reason.trim(),
        category,
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
      })
      toast.success('Employee placed on hold')
      setPlacing(false)
      setEmployeeId('')
      setReason('')
      setEffectiveTo('')
      holdsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The hold could not be placed.')
    } finally {
      setBusy(false)
    }
  }

  const release = async (hold: HoldRow) => {
    try {
      await apiSend('POST', `/api/holds/${hold.id}/release`)
      toast.success('Hold released')
      holdsQuery.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The hold could not be released.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workforce"
        title="Holds"
        description="A hold keeps an employee out of payroll for the period it covers. Excluding someone from a single run is done on the run itself."
        actions={
          canHold ? (
            <Button size="sm" onClick={() => setPlacing(true)}>
              <UserMinus className="h-4 w-4" />
              Place a hold
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>All holds</CardTitle>
          <CardDescription>{holds.length} recorded</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {holdsQuery.loading && holds.length === 0 ? (
                  Array.from({ length: 4 }).map((_, r) => (
                    <tr key={r} className="border-b border-border/50">
                      {Array.from({ length: 5 }).map((__, c) => (
                        <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : holdsQuery.error ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-muted-foreground">{holdsQuery.error.message}</p>
                        <Button variant="outline" size="sm" onClick={holdsQuery.reload}>Try again</Button>
                      </div>
                    </td>
                  </tr>
                ) : holds.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No employee is on hold.
                    </td>
                  </tr>
                ) : (
                  holds.map((hold) => (
                    <tr key={hold.id} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{hold.employee_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{hold.employee_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{hold.reason}</div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{hold.category}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {hold.effective_from}
                        {hold.effective_to ? ` → ${hold.effective_to}` : ' → open'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[hold.status] ?? 'secondary'}>{hold.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hold.status === 'active' && canHold && (
                          <Button variant="outline" size="sm" onClick={() => release(hold)}>
                            <PlayCircle className="h-4 w-4" />
                            Release
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

      <Dialog open={placing} onOpenChange={setPlacing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place an employee on hold</DialogTitle>
            <DialogDescription>
              The employee is excluded from payroll while the hold is in force.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hold-employee">Employee</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="hold-employee"
                  className="pl-9"
                  placeholder="Search by name or ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {employeesQuery.loading && (
                  <div className="p-3"><Skeleton className="h-8 w-full" /></div>
                )}
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
            <div className="space-y-2">
              <Label htmlFor="hold-reason">Reason</Label>
              <Input
                id="hold-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this employee on hold?"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="temporary">Temporary</SelectItem>
                    <SelectItem value="disciplinary">Disciplinary</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="documentation">Documentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hold-from">Effective from</Label>
                <Input
                  id="hold-from"
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hold-to">Effective to (optional)</Label>
              <Input
                id="hold-to"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlacing(false)}>Cancel</Button>
            <Button disabled={!employeeId || !reason.trim() || busy} onClick={place}>
              <PauseCircle className="h-4 w-4" />
              Place hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
