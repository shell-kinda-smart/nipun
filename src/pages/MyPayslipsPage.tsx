import { useState } from 'react'
import { Download, FileText, ChevronRight, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { LogoMark } from '@/components/shared/Brand'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { apiDownload } from '@/lib/api'
import { formatINR, formatShortDate, MONTHS_LONG } from '@/lib/format'
import { usePageMeta } from '@/lib/usePageMeta'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import type { Employee } from '@/data'

/** A payslip line as the API returns it (the amount is also given in paise). */
interface ApiPayslipLine {
  kind: string
  label: string
  amount: number
  amountPaise: number
}

/** A payslip as returned by `GET /api/me/payslips`. */
interface ApiPayslip {
  id: string
  payrollRunId: string
  employeeId: string
  employeeName: string
  designation: string
  departmentId: string
  departmentName: string
  month: number
  year: number
  earnings: ApiPayslipLine[]
  deductions: ApiPayslipLine[]
  gross: number
  grossPaise: number
  totalDeductions: number
  totalDeductionsPaise: number
  net: number
  netPaise: number
  tax: number
  taxPaise: number
  workingDays: number
  daysPresent: number
  status: string
  generatedAt: string
}

/** The signed-in employee's own record, as returned by `GET /api/me/profile`. */
interface MeEmployee extends Omit<Employee, 'performanceRating'> {
  performanceRating: number | null
  department?: { id: string; name: string } | null
}

/**
 * Every answer arrives in a `{ "data": … }` envelope. Some endpoints wrap the
 * payload a second time, so the inner value is unwrapped when it is there.
 */
function toObject<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const inner = (payload as { data?: unknown }).data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner as T
  return payload as T
}

function toList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const inner = (payload as { data?: unknown }).data
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}

export function MyPayslipsPage() {
  usePageMeta('My payslips · PayLens', 'View, download and print your salary slips.')
  const {
    data: empPayload,
    loading: empLoading,
    error: empError,
    reload: reloadEmp,
  } = useApi<MeEmployee | { data: MeEmployee }>('/api/me/profile')
  const {
    data: payslipsPayload,
    loading,
    error,
    reload,
  } = useApi<ApiPayslip[] | { data: ApiPayslip[] }>('/api/me/payslips')

  const emp = toObject<MeEmployee>(empPayload)
  const list = toList<ApiPayslip>(payslipsPayload)

  const [selectedId, setSelectedId] = useState<string>('')

  const selected = list.find((p) => p.id === selectedId) ?? list[0]
  const activeId = selected?.id ?? ''
  const dept = emp?.department?.name ?? selected?.departmentName ?? null

  const download = async () => {
    if (!selected) return
    const filename = `PayLens_${MONTHS_LONG[selected.month - 1]}_${selected.year}.csv`
    try {
      await apiDownload(`/api/payslips/${selected.id}/csv`, filename)
      toast.success('Payslip downloaded', { description: filename })
    } catch {
      toast.error('The payslip could not be downloaded.')
    }
  }
  const print = () => {
    toast.info('Opening print dialog')
    if (typeof window !== 'undefined') window.print()
  }

  if (empLoading || loading) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="My account"
          title="My Payslips"
          description="View and download your salary slips."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-9 w-full" />
            <Skeleton className="mt-2 h-9 w-full" />
            <Skeleton className="mt-2 h-9 w-full" />
          </Card>
          <Card className="p-8 lg:col-span-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="mt-6 h-40 w-full" />
          </Card>
        </div>
      </div>
    )
  }

  if (empError || error) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="My account"
          title="My Payslips"
          description="View and download your salary slips."
        />
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Could not load your payslips"
          description={(empError ?? error)?.message}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                reloadEmp()
                reload()
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  if (!emp) {
    return (
      <EmptyState
        title="No employee data"
        description="Sign in to see your payslips."
        icon={<FileText className="h-5 w-5" />}
      />
    )
  }

  if (!selected) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="My account"
          title="My Payslips"
          description="View and download your salary slips."
          actions={
            <>
              <Button variant="outline" onClick={print}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button onClick={() => { void download() }} disabled>
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </>
          }
        />
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No payslips yet"
          description="Payslips appear here as soon as a payroll run is finalised for you."
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My account"
        title="My Payslips"
        description="View and download your salary slips."
        actions={
          <>
            <Button variant="outline" onClick={print}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button onClick={() => { void download() }}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <div className="border-b border-border p-3">
            <h3 className="text-sm font-semibold">Past payslips</h3>
            <p className="text-xs text-muted-foreground">{list.length} months available</p>
          </div>
          <ul className="divide-y divide-border">
            {list.map((p) => (
              <li
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-accent/40',
                  p.id === activeId && 'bg-accent/60',
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {MONTHS_LONG[p.month - 1]} {p.year}
                  </div>
                  <div className="text-xs text-muted-foreground">Net {formatINR(p.net)}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden lg:col-span-2 p-0">
          <PayslipPreview emp={emp} dept={dept} payslip={selected} />
        </Card>
      </div>
    </div>
  )
}

function PayslipPreview({
  emp, dept, payslip,
}: { emp: MeEmployee; dept: string | null; payslip: ApiPayslip }) {
  return (
    <div className="bg-card">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="h-12 w-12 rounded-xl" />
            <div>
              <div className="text-xl font-bold tracking-tight">PayLens Technologies Pvt. Ltd.</div>
              <div className="text-xs text-muted-foreground">
                3rd Floor, Indiranagar · Bangalore 560001
              </div>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Payslip
            </Badge>
            <div className="mt-1 text-lg font-bold">
              {MONTHS_LONG[payslip.month - 1]} {payslip.year}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-6 p-8">
        {/* Employee info */}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Field label="Employee">
            <div className="font-medium">{emp.name}</div>
            <div className="text-xs text-muted-foreground">
              {emp.designation} · {emp.id}
            </div>
          </Field>
          <Field label="Department">
            <div className="font-medium">{dept}</div>
            <div className="text-xs text-muted-foreground">Joined {formatShortDate(emp.joinedAt)}</div>
          </Field>
          <Field label="Bank">
            <div className="font-medium">{emp.bank.bankName}</div>
            <div className="font-mono text-xs">•••• {emp.bank.account.slice(-4)}</div>
          </Field>
          <Field label="Attendance">
            <div className="font-medium">
              {payslip.daysPresent} / {payslip.workingDays} present
            </div>
            <div className="text-xs text-muted-foreground">{payslip.workingDays} working days</div>
          </Field>
        </div>

        <Separator />

        {/* Earnings + Deductions */}
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-success">
              Earnings
            </div>
            <ul className="mt-3 space-y-2">
              {payslip.earnings.map((e, i) => (
                <li key={`${e.kind}-${i}`} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{e.label}</span>
                  <span className="font-mono">{formatINR(e.amount)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="font-medium">Gross earnings</span>
                <span className="font-mono font-semibold">{formatINR(payslip.gross)}</span>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-destructive">
              Deductions
            </div>
            <ul className="mt-3 space-y-2">
              {payslip.deductions.map((d, i) => (
                <li key={`${d.kind}-${i}`} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-mono">-{formatINR(d.amount)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="font-medium">Total deductions</span>
                <span className="font-mono font-semibold">
                  -{formatINR(payslip.totalDeductions)}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <Separator />

        {/* Net salary */}
        <div className="flex items-center justify-between rounded-lg border-2 border-primary/30 bg-primary/[0.06] p-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-primary-ink">
              Net salary payable
            </div>
            <div className="mt-1 font-mono text-3xl font-bold tracking-tight">
              {formatINR(payslip.net)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">In words</div>
            <div className="text-xs italic">Rupees {numberToWords(payslip.net)} only</div>
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground">
          This is a system-generated payslip. No signature required. For queries, contact{' '}
          <span className="text-primary-ink">hr@paylens.co</span>.
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function numberToWords(n: number): string {
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)} Lakh`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} Thousand`
  return String(n)
}
