import { BadgeCheck, Mail, Phone, Calendar, FileText, User as UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useApi } from '@/hooks/useApi'
import { apiDownload } from '@/lib/api'
import { formatINR, initials, formatShortDate } from '@/lib/format'
import { usePageMeta } from '@/lib/usePageMeta'
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
  month: number
  year: number
  earnings: ApiPayslipLine[]
  deductions: ApiPayslipLine[]
  gross: number
  totalDeductions: number
  net: number
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

/**
 * The API returns MySQL datetimes ("YYYY-MM-DD HH:MM:SS", UTC). Safari's
 * Date parser rejects that form, so they are normalised to ISO first.
 */
function apiDate(value: string): string {
  if (!value) return value
  if (!value.includes(' ')) return value
  const iso = value.replace(' ', 'T')
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${muted ? 'text-muted-foreground' : ''}`}>
      <span className={muted ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`font-mono ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

export function MyProfilePage() {
  usePageMeta('My Profile · PayLens')
  const {
    data: empPayload,
    loading: empLoading,
    error: empError,
    reload: reloadEmp,
  } = useApi<MeEmployee | { data: MeEmployee }>('/api/me/profile')
  const {
    data: payslipsPayload,
    loading: payslipsLoading,
    error: payslipsError,
    reload: reloadPayslips,
  } = useApi<ApiPayslip[] | { data: ApiPayslip[] }>('/api/me/payslips')

  const emp = toObject<MeEmployee>(empPayload)
  const dept = emp?.department?.name
  const recent = toList<ApiPayslip>(payslipsPayload)[0]

  const download = async () => {
    if (!recent) return
    try {
      await apiDownload(`/api/payslips/${recent.id}/csv`, `PayLens_payslip_${recent.id}.csv`)
      toast.success('Payslip downloaded')
    } catch {
      toast.error('The payslip could not be downloaded.')
    }
  }

  if (empLoading) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="My account"
          title="Profile"
          description="Your personal information, salary structure and recent payslip."
        />
        <Card className="overflow-hidden p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </Card>
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-4 h-24 w-full" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (empError) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="My account"
          title="Profile"
          description="Your personal information, salary structure and recent payslip."
        />
        <EmptyState
          icon={<UserIcon className="h-5 w-5" />}
          title="Could not load your profile"
          description={empError.message}
          action={
            <Button variant="outline" size="sm" onClick={reloadEmp}>
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
        description="Sign in to see your profile."
        icon={<UserIcon className="h-5 w-5" />}
      />
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My account"
        title="Profile"
        description="Your personal information, salary structure and recent payslip."
        actions={<Button variant="outline" size="sm">Edit profile</Button>}
      />

      <Card className="overflow-hidden">
        <div className="relative h-20 bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
        <CardContent className="-mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:gap-6">
          <Avatar className="h-20 w-20 ring-4 ring-card">
            <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${emp.avatarSeed}`} />
            <AvatarFallback className="text-2xl">{initials(emp.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{emp.name}</h2>
              <BadgeCheck className="h-4 w-4 text-success" />
            </div>
            <div className="text-sm text-muted-foreground">{emp.designation} · {dept}</div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="success">{emp.status.replace('_', ' ')}</Badge>
              <Badge variant="outline">{emp.id}</Badge>
              {emp.performanceRating && <Badge variant="warning">★ {emp.performanceRating}/5</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>How we reach you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</div>
                <a href={`mailto:${emp.email}`} className="transition-colors hover:text-primary-ink hover:underline">
                  {emp.email}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</div>
                <a href={`tel:${emp.phone.replace(/\s/g, '')}`} className="font-mono transition-colors hover:text-primary-ink hover:underline">
                  {emp.phone}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Joined</div>
                <div>{formatShortDate(emp.joinedAt)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Salary structure</CardTitle>
            <CardDescription>Current CTC · {formatINR(emp.ctcAnnual, { compact: true })}/yr</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Basic" value={formatINR(emp.salary.basic)} />
            <Row label="HRA" value={formatINR(emp.salary.hra)} />
            <Row label="Special allowance" value={formatINR(emp.salary.specialAllowance)} />
            {emp.salary.travelAllowance > 0 && (
              <Row label="Travel" value={formatINR(emp.salary.travelAllowance)} />
            )}
            <Separator />
            <Row label="PF (deduction)" value={`-${formatINR(emp.salary.pf)}`} muted />
            <Row label="Professional tax" value={`-${formatINR(emp.salary.professionalTax)}`} muted />
            <Separator />
            <Row label="Monthly gross" value={formatINR(emp.monthlyGross)} bold />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bank details</CardTitle>
            <CardDescription>Salary is credited to</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bank</div>
              <div className="font-medium">{emp.bank.bankName}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Account</div>
              <div className="font-mono">•••• •••• {emp.bank.account.slice(-4)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">IFSC</div>
              <div className="font-mono">{emp.bank.ifsc}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {payslipsError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{payslipsError.message}</p>
            <Button variant="outline" size="sm" onClick={reloadPayslips}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : payslipsLoading ? (
        <Card className="p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-24 w-full" />
        </Card>
      ) : recent ? (
        <Card>
          <CardHeader>
            <CardTitle>Latest payslip</CardTitle>
            <CardDescription>
              {formatShortDate(apiDate(recent.generatedAt))} · Net {formatINR(recent.net)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-primary-ink">Earnings</div>
                <ul className="mt-2 space-y-1.5">
                  {recent.earnings.map((e, i) => (
                    <li key={`${e.kind}-${i}`} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{e.label}</span>
                      <span className="font-mono">{formatINR(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-primary-ink">Deductions</div>
                <ul className="mt-2 space-y-1.5">
                  {recent.deductions.map((d, i) => (
                    <li key={`${d.kind}-${i}`} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{d.label}</span>
                      <span className="font-mono">-{formatINR(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Net salary</div>
                <div className="font-mono text-2xl font-bold tracking-tight">{formatINR(recent.net)}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => { void download() }}>
                <FileText className="h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
