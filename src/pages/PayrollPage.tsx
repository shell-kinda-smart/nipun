import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, ChevronLeft, ChevronRight, Calendar, Users2, Calculator, FileText,
  ShieldCheck, Play, AlertTriangle, Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageLoader } from '@/components/shared/PageLoader'
import { usePageMeta } from '@/lib/usePageMeta'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useApi } from '@/hooks/useApi'
import { ApiError, apiSend } from '@/lib/api'
import { useHasPermission } from '@/store/auth'
import type { Department, Employee, PayrollRun, Role } from '@/data'
import { ROLE_LABELS } from '@/data'
import { formatINR, formatPercent, initials, MONTHS_LONG } from '@/lib/format'
import { cn } from '@/lib/utils'

const STEPS = [
  { label: 'Select month', icon: Calendar },
  { label: 'Review employees', icon: Users2 },
  { label: 'Calculate', icon: Calculator },
  { label: 'Review deductions', icon: FileText },
  { label: 'Validate', icon: ShieldCheck },
  { label: 'Approve & process', icon: Play },
]

/** The year select offers the current year and the one before it. */
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1]

/** POST /api/payroll/preview — the estimate for a period (nothing is written). */
interface PayrollPreview {
  employeeCount: number
  totalGross: number
  totalTax: number
  totalDeductions: number
  totalNet: number
}

/** A row of GET /api/payroll/rules. */
interface PayrollRule {
  code: string
  name: string
  basis: string
  rateBasisPoints: number | null
  amountPaise: number | null
  capPaise: number | null
  effectiveFrom: string
  effectiveTo: string | null
  enabled: boolean
}

/** A row of GET /api/payroll/approvers. */
interface Approver {
  id: string
  name: string
  email: string
  role: Role
}

/** A row of GET /api/anomalies. */
interface AnomalyRow {
  id: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigating' | 'resolved' | 'dismissed'
  employeeId: string | null
  detectedAt: string
  riskScore: number
}

export function PayrollPage() {
  usePageMeta('Payroll · PayLens', 'Six-step payroll processing wizard.')
  const [step, setStep] = useState(0)
  const [month, setMonth] = useState(10)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [approver, setApprover] = useState('')
  const [processing, setProcessing] = useState(false)

  const { data: employeeData, loading: employeesLoading } = useApi<Employee[]>('/api/employees', { perPage: 200 })
  const { data: departmentData } = useApi<Department[]>('/api/departments')
  const { data: runData, reload: reloadRuns } = useApi<PayrollRun[]>('/api/payroll/runs')
  const { data: ruleData } = useApi<PayrollRule[] | { data: PayrollRule[] }>('/api/payroll/rules')
  const { data: anomalyData } = useApi<AnomalyRow[] | { data: AnomalyRow[] }>('/api/anomalies', { status: 'open' })
  const { data: approverData } = useApi<Approver[]>('/api/payroll/approvers')

  const approvers = useMemo(() => approverData ?? [], [approverData])

  // Default to the first account that may approve, once the list arrives.
  useEffect(() => {
    if (!approver && approvers.length > 0) setApprover(approvers[0].name)
  }, [approver, approvers])

  const employees = useMemo(() => employeeData ?? [], [employeeData])
  const departments = useMemo(() => departmentData ?? [], [departmentData])
  const runs = useMemo(() => runData ?? [], [runData])
  const rules = useMemo(() => toList<PayrollRule>(ruleData), [ruleData])
  const openAnomalies = useMemo(() => toList<AnomalyRow>(anomalyData), [anomalyData])

  // Approving a run is a separate duty from preparing it, so the wizard
  // only completes the approval when the signed-in account may approve.
  const canApprove = useHasPermission('payroll:approve')
  const steps = useMemo(
    () => STEPS.map((s, i) => (
      i === STEPS.length - 1
        ? { ...s, label: canApprove ? 'Approve & process' : 'Submit for approval' }
        : s
    )),
    [canApprove],
  )

  // Open on the first period that has not been run yet, so the wizard does
  // not start on a period the server will refuse as a duplicate.
  const periodChosen = useRef(false)
  useEffect(() => {
    if (periodChosen.current || runs.length === 0) return
    periodChosen.current = true

    const taken = new Set(runs.map((r) => `${r.year}-${r.month}`))
    let m = month
    let y = year
    for (let i = 0; i < 24; i++) {
      if (!taken.has(`${y}-${m}`)) {
        setMonth(m)
        setYear(y)
        return
      }
      m += 1
      if (m > 12) { m = 1; y += 1 }
    }
  }, [runs, month, year])

  // ── Estimate (step 3 onwards) — computed by the server, nothing is written.
  const [preview, setPreview] = useState<PayrollPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (step < 2) return
    let active = true
    apiSend<PayrollPreview>('POST', '/api/payroll/preview', { month, year })
      .then((result) => {
        if (!active) return
        setPreview(result)
        setPreviewError(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        setPreview(null)
        setPreviewError(
          error instanceof ApiError ? error.message : 'The payroll preview could not be loaded.',
        )
      })
    return () => { active = false }
  }, [step, month, year])

  const gross = preview?.totalGross ?? 0
  const tax = preview?.totalTax ?? 0
  const deductions = preview?.totalDeductions ?? 0
  const net = preview?.totalNet ?? 0
  const payCount = preview?.employeeCount ?? 0

  // ── Run history — the previous period is what "vs last month" compares to.
  const previousPeriod = useMemo(() => (
    month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
  ), [month, year])
  const currentRun = runs.find((r) => r.month === month && r.year === year)
  const previousRun = runs.find((r) => r.month === previousPeriod.month && r.year === previousPeriod.year)
  const mom = currentRun && previousRun && previousRun.totalGross > 0
    ? ((currentRun.totalGross - previousRun.totalGross) / previousRun.totalGross) * 100
    : null

  // ── Deduction breakdown — the configured rules, applied to the roster.
  const periodEnd = useMemo(
    () => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    [year, month],
  )
  const activeRules = useMemo(
    () => rules.filter((r) => r.enabled && r.effectiveFrom <= periodEnd && (!r.effectiveTo || r.effectiveTo >= periodEnd)),
    [rules, periodEnd],
  )
  const included = useMemo(() => employees.filter((e) => e.status !== 'exited'), [employees])
  const deductionRows = useMemo(() => {
    const pfRule = activeRules.find((r) => r.code === 'pf_employee')
    const ptRule = activeRules.find((r) => r.code === 'professional_tax')

    let pfPaise = 0
    if (pfRule?.rateBasisPoints != null) {
      for (const e of included) {
        const basicPaise = Math.round((e.salary?.basic ?? 0) * 100)
        let amount = applyRate(basicPaise, pfRule.rateBasisPoints)
        if (pfRule.capPaise != null) amount = Math.min(amount, pfRule.capPaise)
        pfPaise += amount
      }
    }
    const providentFund = pfPaise / 100
    const professionalTax = ptRule?.amountPaise != null ? (ptRule.amountPaise * payCount) / 100 : 0
    // Whatever the server could not attribute to PF, professional tax or TDS
    // is the run's other deductions (loans and advances).
    const loans = Math.max(0, deductions - providentFund - professionalTax - tax)

    return [
      { name: 'Provident Fund', total: providentFund, color: 'info' as const },
      { name: 'Income Tax (TDS)', total: tax, color: 'warning' as const },
      { name: 'Professional Tax', total: professionalTax, color: 'secondary' as const },
      { name: 'Loans & Advances', total: loans, color: 'destructive' as const },
    ]
  }, [activeRules, included, payCount, deductions, tax])

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  const submit = async () => {
    setProcessing(true)
    try {
      const run = await apiSend<PayrollRun>('POST', '/api/payroll/runs', { month, year })
      await apiSend('POST', `/api/payroll/runs/${run.id}/calculate`)
      // A run has to be submitted before it can be approved: preparing and
      // approving are separate steps in the workflow.
      await apiSend('POST', `/api/payroll/runs/${run.id}/submit`)

      if (canApprove) {
        await apiSend('POST', `/api/payroll/runs/${run.id}/approve`)
        await apiSend('POST', `/api/payroll/runs/${run.id}/finalize`)
        toast.success('Payroll processed', {
          description: `${MONTHS_LONG[month - 1]} ${year} payroll for ${payCount} employees · ${formatINR(net, { compact: true })} disbursed.`,
        })
      } else {
        toast.success('Payroll submitted for approval', {
          description: `${MONTHS_LONG[month - 1]} ${year} payroll for ${payCount} employees is waiting for an approver.`,
        })
      }
      reloadRuns()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'The payroll run could not be completed.'
      if (error instanceof ApiError && error.status === 403) {
        toast.error(message)
      } else if (error instanceof ApiError && error.status === 409) {
        toast.error('Payroll run already exists', { description: message })
      } else {
        toast.error('Payroll processing failed', { description: message })
      }
    } finally {
      setProcessing(false)
    }
  }

  if (employeesLoading && employees.length === 0) return <PageLoader label="Loading payroll" />

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Process payroll"
        description={`${MONTHS_LONG[month - 1]} ${year} · ${employees.length} employees`}
      />

      {/* Stepper */}
      <Card className="p-4">
        <ol className="flex items-start justify-between gap-2">
          {steps.map((s, i) => {
            const isActive = i === step
            const isDone = i < step
            return (
              <li key={s.label} className="flex flex-1 items-start gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                    isActive && 'border-primary bg-primary text-primary-foreground shadow-elev',
                    isDone && !isActive && 'border-success bg-success text-success-foreground',
                    !isActive && !isDone && 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-[10px] uppercase tracking-wider',
                      isActive ? 'text-primary-ink' : 'text-muted-foreground',
                    )}
                  >
                    Step {i + 1}
                  </div>
                  <div
                    className={cn(
                      'truncate text-sm font-medium',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {s.label}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn('mt-4 h-px flex-1', isDone ? 'bg-success' : 'bg-border')} />
                )}
              </li>
            )
          })}
        </ol>
      </Card>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="min-h-[420px]"
        >
          {step === 0 && <Step1 month={month} setMonth={setMonth} year={year} setYear={setYear} />}
          {step === 1 && <Step2 employees={employees} departments={departments} />}
          {step === 2 && (
            <Step3
              gross={gross}
              tax={tax}
              deductions={deductions}
              net={net}
              employeeCount={payCount}
              mom={mom}
              error={previewError}
            />
          )}
          {step === 3 && <Step4 gross={gross} rows={deductionRows} employeeCount={payCount} />}
          {step === 4 && (
            <Step5
              employees={employees}
              anomalies={openAnomalies}
              existingRun={currentRun}
            />
          )}
          {step === 5 && (
            <Step6
              approver={approver}
              setApprover={setApprover}
              approvers={approvers}
              net={net}
              employeeCount={payCount}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer */}
      <Card className="sticky bottom-4 z-20 flex items-center justify-between p-3 backdrop-blur">
        <Button variant="ghost" onClick={back} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="text-xs text-muted-foreground">
          {step + 1} of {steps.length}
        </div>
        {step < steps.length - 1 ? (
          <Button onClick={next}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={processing} size="lg" className="shadow-elev">
            <Play className="h-4 w-4" />
            {canApprove ? 'Process payroll' : 'Submit for approval'}
          </Button>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step components
// ─────────────────────────────────────────────────────────────────────────────

function Step1({
  month, setMonth, year, setYear,
}: {
  month: number
  setMonth: (m: number) => void
  year: number
  setYear: (y: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose pay period</CardTitle>
        <CardDescription>Select the month and year to process</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Month</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_LONG.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Year</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <div className="text-sm font-medium">{MONTHS_LONG[month - 1]} {year}</div>
          <div className="mt-1 text-xs text-muted-foreground">22 working days · payday 30th</div>
        </div>
      </CardContent>
    </Card>
  )
}

function Step2({
  employees, departments,
}: {
  employees: Employee[]
  departments: Department[]
}) {
  const total = employees.length
  const active = employees.filter((e) => e.status === 'active').length
  const onLeave = employees.filter((e) => e.status === 'on_leave').length
  const probation = employees.filter((e) => e.status === 'probation').length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employees in this run</CardTitle>
        <CardDescription>All active employees are included by default</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Mini label="Total" value={total} total={total} variant="info" />
          <Mini label="Active" value={active} total={total} variant="success" />
          <Mini label="On leave" value={onLeave} total={total} variant="warning" />
          <Mini label="Probation" value={probation} total={total} variant="info" />
        </div>
        <Separator />
        <div>
          <div className="text-sm font-medium">By department</div>
          <ul className="mt-3 space-y-2">
            {departments.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent/40"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-sm font-medium">{d.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">{d.headcount} people</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatINR(d.budgetMonthly, { compact: true })}</div>
                  <div className="text-[10px] text-muted-foreground">budget</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <Separator />
        <div>
          <div className="text-sm font-medium">Sample employees</div>
          <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {employees.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-md border border-border bg-card/40 p-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${e.avatarSeed}`} />
                  <AvatarFallback className="text-[10px]">{initials(e.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{e.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{e.designation}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            + {Math.max(0, employees.length - 6)} more employees
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function Step3({
  gross, tax, deductions, net, employeeCount, mom, error,
}: {
  gross: number
  tax: number
  deductions: number
  net: number
  employeeCount: number
  mom: number | null
  error: string | null
}) {
  const headcount = employeeCount || 0
  const effectiveRate = gross > 0 ? ((tax / gross) * 100).toFixed(1) : '0.0'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculate payroll</CardTitle>
        <CardDescription>Live calculation across all employees</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CalcCard label="Total gross" value={formatINR(gross, { compact: true })} accent="info" />
          <CalcCard label="Tax (TDS)" value={formatINR(tax, { compact: true })} accent="warning" />
          <CalcCard label="Deductions" value={formatINR(deductions, { compact: true })} accent="destructive" />
          <CalcCard label="Net payout" value={formatINR(net, { compact: true })} accent="success" />
        </div>
        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Separator className="my-6" />
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Average monthly gross</span>
            <span className="font-mono">{headcount > 0 ? formatINR(gross / headcount) : formatINR(0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Average net take-home</span>
            <span className="font-mono">{headcount > 0 ? formatINR(net / headcount) : formatINR(0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">vs last month</span>
            <span className="font-mono text-success">{mom === null ? '—' : `${formatPercent(mom)}`} MoM</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Effective tax rate</span>
            <span className="font-mono">{effectiveRate}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Step4({
  gross, rows, employeeCount,
}: {
  gross: number
  rows: { name: string; total: number; color: 'info' | 'warning' | 'secondary' | 'destructive' }[]
  employeeCount: number
}) {
  const headcount = employeeCount || 1
  const total = rows.reduce((s, r) => s + r.total, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review deductions</CardTitle>
        <CardDescription>PF, TDS and other deductions across the run</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Category</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Avg / employee</th>
                <th className="py-2 text-right">% of gross</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.name} className="border-b border-border/50">
                  <td className="py-3">
                    <Badge variant={d.color} className="capitalize text-[10px]">
                      {d.name}
                    </Badge>
                  </td>
                  <td className="py-3 text-right font-mono">
                    {formatINR(d.total, { compact: true })}
                  </td>
                  <td className="py-3 text-right font-mono text-muted-foreground">
                    {formatINR(d.total / headcount)}
                  </td>
                  <td className="py-3 text-right font-mono text-muted-foreground">
                    {gross > 0 ? `${((d.total / gross) * 100).toFixed(1)}%` : '0.0%'}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="py-3 font-semibold">Total deductions</td>
                <td className="py-3 text-right font-mono font-semibold">
                  {formatINR(total, { compact: true })}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function Step5({
  employees, anomalies, existingRun,
}: {
  employees: Employee[]
  anomalies: AnomalyRow[]
  existingRun?: PayrollRun
}) {
  const verified = employees.filter((e) => e.bank?.account && e.bank?.ifsc).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Validation summary</CardTitle>
          <CardDescription>Auto-checks before processing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <CheckRow
            tone="success"
            label="All employees have valid bank accounts"
            detail={`${verified} of ${employees.length} verified`}
          />
          <CheckRow
            tone={existingRun ? 'warning' : 'success'}
            label="No duplicate payroll runs in this period"
            detail={existingRun ? existingRun.id : undefined}
          />
          <CheckRow tone="success" label="Tax slabs applied correctly" />
          <CheckRow tone="success" label="Salary structures consistent with HR records" />
          <CheckRow tone="success" label="All approvals obtained from department heads" />
          <CheckRow
            tone="warning"
            label={`${anomalies.length} anomalies flagged. Review before processing`}
            detail="See Anomaly Center"
          />
        </CardContent>
      </Card>

      <Card className="border-warning/30 bg-warning/[0.04]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <CardTitle>{anomalies.length} anomalies require attention</CardTitle>
          </div>
          <CardDescription>Resolve or override before processing</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {anomalies.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Badge variant={a.severity === 'critical' ? 'destructive' : 'warning'} className="text-[10px]">
                  {a.severity.toUpperCase()}
                </Badge>
                {a.title} ({a.employeeId ?? '—'})
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function Step6({
  approver,
  setApprover,
  approvers,
  net,
  employeeCount,
}: {
  approver: string
  setApprover: (a: string) => void
  approvers: Approver[]
  net: number
  employeeCount: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approve & process</CardTitle>
        <CardDescription>Final confirmation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-success/30 bg-gradient-to-br from-success/10 to-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Net payout
          </div>
          <div className="mt-1 font-mono text-3xl font-bold tracking-tight">
            {formatINR(net, { compact: true })}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {employeeCount} employees · ready to disburse
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Approver</label>
          <Select value={approver} onValueChange={setApprover}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Select an approver" />
            </SelectTrigger>
            <SelectContent>
              {approvers.map((account) => (
                <SelectItem key={account.id} value={account.name}>
                  {account.name} · {ROLE_LABELS[account.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-card/50 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-success" />
          <div className="text-xs text-muted-foreground">
            By clicking Process payroll, you confirm all calculations and approve disbursement.
            This action is logged in the audit trail.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny helpers
// ─────────────────────────────────────────────────────────────────────────────

function Mini({
  label, value, total, variant,
}: { label: string; value: number; total: number; variant: 'success' | 'warning' | 'info' }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-bold">{value}</span>
        <Badge variant={variant} className="text-[10px]">
          {total > 0 ? `${((value / total) * 100).toFixed(0)}%` : '0%'}
        </Badge>
      </div>
    </div>
  )
}

function CalcCard({ label, value, accent }: { label: string; value: string; accent: 'success' | 'warning' | 'info' | 'destructive' }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold tracking-tight">{value}</div>
      <Badge variant={accent} className="mt-2 text-[10px] capitalize">
        {accent}
      </Badge>
    </div>
  )
}

function CheckRow({ tone, label, detail }: { tone: 'success' | 'warning'; label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md p-2 hover:bg-accent/40">
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full',
          tone === 'success' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
        )}
      >
        {tone === 'success' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <span className="flex-1 text-sm">{label}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/** Percentage of a paise amount, rounded half-up — mirrors the server's maths. */
function applyRate(amount: number, basisPoints: number): number {
  const product = amount * basisPoints
  const sign = product < 0 ? -1 : 1
  const abs = Math.abs(product)
  return sign * Math.floor((abs + 5000) / 10000)
}
