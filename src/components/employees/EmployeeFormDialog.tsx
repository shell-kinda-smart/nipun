import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { ApiError, apiSend } from '@/lib/api'
import { formatINR } from '@/lib/format'
import type { Department, Employee } from '@/data'

/**
 * Create or edit an employee.
 *
 * One form for both jobs: creating sends `POST /api/employees`, editing
 * sends `PATCH /api/employees/{id}`. Compensation is only part of the
 * create form — a salary change is a new version of the employee's pay
 * structure, not an edit of the record, so it is made through the
 * compensation endpoint rather than this one.
 */

interface EmployeeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The employee being edited. Omit it to create a new one. */
  employee?: Employee | null
  departments: Department[]
  /** Called after the record has been saved. */
  onSaved?: (employee: Employee) => void
}

interface FormState {
  firstName: string
  lastName: string
  email: string
  phone: string
  departmentId: string
  designation: string
  status: string
  employmentType: string
  joinedAt: string
  performanceRating: string
  basic: string
  hra: string
  specialAllowance: string
  travelAllowance: string
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  departmentId: '',
  designation: '',
  status: 'active',
  employmentType: 'full_time',
  joinedAt: new Date().toISOString().slice(0, 10),
  performanceRating: '3',
  basic: '',
  hra: '',
  specialAllowance: '',
  travelAllowance: '',
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return { first: parts[0] ?? '', last: '' }
  }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export function EmployeeFormDialog({
  open, onOpenChange, employee, departments, onSaved,
}: EmployeeFormDialogProps) {
  const editing = Boolean(employee)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [busy, setBusy] = useState(false)

  // Reset the form whenever the dialog opens, so it never shows the
  // previous record's values.
  useEffect(() => {
    if (!open) return
    if (employee) {
      const { first, last } = splitName(employee.name)
      setForm({
        firstName: first,
        lastName: last,
        email: employee.email,
        phone: employee.phone ?? '',
        departmentId: employee.departmentId,
        designation: employee.designation,
        status: employee.status,
        employmentType: 'full_time',
        joinedAt: employee.joinedAt,
        performanceRating: String(employee.performanceRating ?? 3),
        basic: String(employee.salary?.basic ?? ''),
        hra: String(employee.salary?.hra ?? ''),
        specialAllowance: String(employee.salary?.specialAllowance ?? ''),
        travelAllowance: String(employee.salary?.travelAllowance ?? ''),
      })
    } else {
      setForm({ ...EMPTY, departmentId: departments[0]?.id ?? '' })
    }
  }, [open, employee, departments])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  // The annual figure follows the monthly components, so the two can never
  // disagree on the form.
  const annualCtc = useMemo(() => {
    const monthly = ['basic', 'hra', 'specialAllowance', 'travelAllowance']
      .reduce((sum, key) => sum + (Number(form[key as keyof FormState]) || 0), 0)
    return monthly * 12
  }, [form])

  const invalid =
    !form.firstName.trim() ||
    !form.lastName.trim() ||
    !form.email.trim() ||
    !form.departmentId ||
    !form.designation.trim() ||
    !form.joinedAt ||
    (!editing && !Number(form.basic))

  const save = async () => {
    if (invalid) return
    setBusy(true)
    try {
      const saved = editing
        ? await apiSend<Employee>('PATCH', `/api/employees/${employee!.id}`, {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || undefined,
            departmentId: form.departmentId,
            designation: form.designation.trim(),
            status: form.status,
            employmentType: form.employmentType,
            joinedAt: form.joinedAt,
            performanceRating: Number(form.performanceRating) || undefined,
          })
        : await apiSend<Employee>('POST', '/api/employees', {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || undefined,
            departmentId: form.departmentId,
            designation: form.designation.trim(),
            status: form.status,
            employmentType: form.employmentType,
            joinedAt: form.joinedAt,
            performanceRating: Number(form.performanceRating) || undefined,
            basic: Number(form.basic) || 0,
            hra: Number(form.hra) || 0,
            specialAllowance: Number(form.specialAllowance) || 0,
            travelAllowance: Number(form.travelAllowance) || 0,
            ctcAnnual: annualCtc,
          })

      toast.success(editing ? 'Employee updated' : 'Employee added', {
        description: `${form.firstName.trim()} ${form.lastName.trim()} · ${form.designation.trim()}`,
      })
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'The employee could not be saved.'
      toast.error(message, {
        description: error instanceof ApiError
          ? Object.values(error.fieldErrors).flat()[0]
          : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit employee' : 'Add employee'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the record. A salary change is made separately, because it is a new version of the pay structure.'
              : 'The new employee is added to the directory and to the next payroll run.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="emp-first">First name</Label>
              <Input
                id="emp-first"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                placeholder="Aarav"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-last">Last name</Label>
              <Input
                id="emp-last"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                placeholder="Sharma"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="emp-email">Email</Label>
              <Input
                id="emp-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="aarav.sharma@paylens.co"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-phone">Phone</Label>
              <Input
                id="emp-phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={form.departmentId} onValueChange={(v) => set('departmentId', v)}>
                <SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-designation">Designation</Label>
              <Input
                id="emp-designation"
                value={form.designation}
                onChange={(e) => set('designation', e.target.value)}
                placeholder="SDE II"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On leave</SelectItem>
                  <SelectItem value="probation">Probation</SelectItem>
                  <SelectItem value="exited">Exited</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Employment type</Label>
              <Select value={form.employmentType} onValueChange={(v) => set('employmentType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full time</SelectItem>
                  <SelectItem value="part_time">Part time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-rating">Performance rating</Label>
              <Input
                id="emp-rating"
                type="number"
                min={1}
                max={5}
                value={form.performanceRating}
                onChange={(e) => set('performanceRating', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emp-joined">Date of joining</Label>
            <Input
              id="emp-joined"
              type="date"
              value={form.joinedAt}
              onChange={(e) => set('joinedAt', e.target.value)}
            />
          </div>

          {!editing && (
            <>
              <div className="rounded-lg border border-border p-3">
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Monthly pay
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="emp-basic">Basic</Label>
                    <Input
                      id="emp-basic"
                      type="number"
                      min={0}
                      value={form.basic}
                      onChange={(e) => set('basic', e.target.value)}
                      placeholder="50000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emp-hra">HRA</Label>
                    <Input
                      id="emp-hra"
                      type="number"
                      min={0}
                      value={form.hra}
                      onChange={(e) => set('hra', e.target.value)}
                      placeholder="25000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emp-special">Special allowance</Label>
                    <Input
                      id="emp-special"
                      type="number"
                      min={0}
                      value={form.specialAllowance}
                      onChange={(e) => set('specialAllowance', e.target.value)}
                      placeholder="20000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emp-travel">Travel allowance</Label>
                    <Input
                      id="emp-travel"
                      type="number"
                      min={0}
                      value={form.travelAllowance}
                      onChange={(e) => set('travelAllowance', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Annual cost to company: {formatINR(annualCtc)}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || invalid}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
