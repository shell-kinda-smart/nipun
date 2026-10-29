import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Mail, Phone, Calendar, FileText, ArrowLeft, BadgeCheck, Briefcase, Building2,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { PageLoader } from '@/components/shared/PageLoader'
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog'
import { useApi } from '@/hooks/useApi'
import { useHasPermission } from '@/store/auth'
import { formatINR, initials, formatShortDate, relativeTime } from '@/lib/format'
import { usePageMeta } from '@/lib/usePageMeta'
import { cn } from '@/lib/utils'
import type { Anomaly, Department, Employee, Payslip } from '@/data'

/** The profile endpoint adds the department, the colleagues and the salary history. */
interface EmployeeProfile extends Employee {
  department?: Department | null
  colleagues?: Employee[]
  salaryHistory?: { effectiveFrom: string; effectiveTo: string | null; basic: number; ctcAnnual: number }[]
}

/** A document as the API returns it. */
interface ApiDocument {
  id: string
  employeeId: string
  name: string
  type: string
  status: string
  issuedAt: string | null
  expiresAt: string | null
  sizeBytes: number
  createdAt: string
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 KB'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${muted ? 'text-muted-foreground' : ''}`}>
      <span className={muted ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`font-mono ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

function Stat({
  label, value, max = 22, variant,
}: { label: string; value: number; max?: number; variant: 'success' | 'destructive' | 'warning' | 'info' }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold">{value}</span>
        <Badge variant={variant} className="text-[10px]">
          {value}/{max}
        </Badge>
      </div>
    </Card>
  )
}

export function EmployeeProfilePage() {
  usePageMeta('Employee · PayLens')
  const { id: paramId } = useParams()
  const navigate = useNavigate()
  const id = paramId ?? ''
  const [editing, setEditing] = useState(false)
  const canWrite = useHasPermission('employees:write')

  const profileQuery = useApi<EmployeeProfile>(id ? `/api/employees/${id}` : null)
  const departmentsQuery = useApi<Department[]>('/api/departments')
  const departments = departmentsQuery.data ?? []
  const payslipsQuery = useApi<Payslip[]>(id ? `/api/employees/${id}/payslips` : null)
  const documentsQuery = useApi<ApiDocument[]>(
    id ? '/api/documents' : null,
    id ? { employeeId: id } : undefined,
  )
  // The anomalies endpoint wraps its list in one more `data` envelope, so both
  // shapes are accepted here.
  const anomaliesQuery = useApi<Anomaly[] | { data: Anomaly[] }>(
    id ? '/api/anomalies' : null,
    id ? { employeeId: id } : undefined,
  )

  const profile = profileQuery.data
  const emp = profile && profile.id === id ? profile : null
  const staleProfile = profile !== null && profile.id !== id

  if (profileQuery.loading || staleProfile) return <PageLoader label="Loading employee" />

  if (profileQuery.error) {
    const notFound = profileQuery.error.status === 404
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/employees')}>
          <ArrowLeft className="h-4 w-4" />
          Back to employees
        </Button>
        <Card className="p-12 text-center">
          <h2 className="text-lg font-semibold">
            {notFound ? 'Employee not found' : 'This employee could not be loaded'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {notFound ? `No employee matches ID "${id}".` : profileQuery.error.message}
          </p>
          {!notFound && (
            <Button variant="outline" size="sm" className="mt-4" onClick={profileQuery.reload}>
              Try again
            </Button>
          )}
        </Card>
      </div>
    )
  }

  if (!emp) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/employees')}>
          <ArrowLeft className="h-4 w-4" />
          Back to employees
        </Button>
        <Card className="p-12 text-center">
          <h2 className="text-lg font-semibold">Employee not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">No employee matches ID "{id}".</p>
        </Card>
      </div>
    )
  }

  const dept = emp.department ?? null
  const payslips = payslipsQuery.data ?? []
  const documents = documentsQuery.data ?? []
  const anomalies = Array.isArray(anomaliesQuery.data)
    ? anomaliesQuery.data
    : (anomaliesQuery.data?.data ?? [])
  const colleagues = (emp.colleagues ?? []).filter((c) => c.id !== emp.id)
  const tenureMonths = Math.max(
    1,
    Math.floor((Date.now() - new Date(emp.joinedAt).getTime()) / (1000 * 60 * 60 * 24 * 30)),
  )

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/employees">
          <ArrowLeft className="h-4 w-4" />
          All employees
        </Link>
      </Button>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="relative h-20 bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
        <CardContent className="-mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:gap-6">
          <Avatar className="h-24 w-24 ring-4 ring-card">
            <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${emp.avatarSeed}`} />
            <AvatarFallback className="text-3xl">{initials(emp.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{emp.name}</h2>
              <BadgeCheck className="h-5 w-5 text-success" />
            </div>
            <div className="text-sm text-muted-foreground">
              {emp.designation} · {dept?.name}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="success" className="capitalize">
                {emp.status.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="font-mono">{emp.id}</Badge>
              {emp.performanceRating && (
                <Badge variant="warning">★ {emp.performanceRating}/5</Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Message</Button>
            <Button size="sm" onClick={() => setEditing(true)} disabled={!canWrite}>
              Edit profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="taxes">Taxes</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</div>
                    <div>{emp.email}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</div>
                    <div>{emp.phone}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tenure</div>
                    <div>
                      {formatShortDate(emp.joinedAt)} · ~{tenureMonths} months
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Employment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Department</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dept?.color }} />
                    {dept?.name}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Designation</div>
                  <div>{emp.designation}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Annual CTC</div>
                  <div className="font-mono text-lg font-semibold">{formatINR(emp.ctcAnnual)}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bank details</CardTitle>
                <CardDescription>Salary credited to</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bank</div>
                  <div className="font-medium">{emp.bank.bankName}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Account</div>
                  <div className="font-mono">•••• {emp.bank.account.slice(-4)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">IFSC</div>
                  <div className="font-mono">{emp.bank.ifsc}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {dept && (
            <Card>
              <CardHeader>
                <CardTitle>Colleagues in {dept.name}</CardTitle>
                <CardDescription>
                  {colleagues.length} other people
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {colleagues.slice(0, 6).map((e) => (
                    <li key={e.id}>
                      <Link
                        to={`/employees/${e.id}`}
                        className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${e.avatarSeed}`} />
                          <AvatarFallback>{initials(e.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{e.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{e.designation}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* PAYROLL */}
        <TabsContent value="payroll" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Salary structure</CardTitle>
                <CardDescription>Monthly breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Row label="Basic" value={formatINR(emp.salary.basic)} />
                <Row label="HRA" value={formatINR(emp.salary.hra)} />
                <Row label="Special allowance" value={formatINR(emp.salary.specialAllowance)} />
                {emp.salary.travelAllowance > 0 && (
                  <Row label="Travel" value={formatINR(emp.salary.travelAllowance)} />
                )}
                <Separator />
                <Row label="PF" value={`-${formatINR(emp.salary.pf)}`} muted />
                <Row label="Professional tax" value={`-${formatINR(emp.salary.professionalTax)}`} muted />
                <Row label="TDS (estimate)" value={`-${formatINR(Math.round(emp.salary.basic * 0.1))}`} muted />
                <Separator />
                <Row
                  label="Net monthly"
                  value={formatINR(
                    emp.monthlyGross - emp.salary.pf - emp.salary.professionalTax - Math.round(emp.salary.basic * 0.1),
                  )}
                  bold
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>YTD summary</CardTitle>
                <CardDescription>Year-to-date · 2026-27</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-card/50 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      YTD earnings
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold">
                      {formatINR(emp.monthlyGross * 6)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card/50 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      YTD tax paid
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-warning">
                      {formatINR(Math.round(emp.salary.basic * 0.1 * 6))}
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  <FileText className="h-4 w-4" />
                  Download annual tax statement
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent payslips</CardTitle>
              <CardDescription>Latest month</CardDescription>
            </CardHeader>
            <CardContent>
              {payslipsQuery.loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : payslips[0] ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2">Period</th>
                        <th className="py-2 text-right">Gross</th>
                        <th className="py-2 text-right">Deductions</th>
                        <th className="py-2 text-right">Net</th>
                        <th className="py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border/50">
                        <td className="py-2.5">
                          {payslips[0].month}/{payslips[0].year}
                        </td>
                        <td className="py-2.5 text-right font-mono">{formatINR(payslips[0].gross)}</td>
                        <td className="py-2.5 text-right font-mono text-muted-foreground">
                          -{formatINR(payslips[0].totalDeductions)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold">
                          {formatINR(payslips[0].net)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge variant="success" className="text-[10px]">
                            {payslips[0].status}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payslips available yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Present" value={emp.attendance.present} variant="success" />
            <Stat label="Absent" value={emp.attendance.absent} variant="destructive" />
            <Stat label="Late" value={emp.attendance.late} variant="warning" />
            <Stat label="Leaves" value={emp.attendance.leaves} variant="info" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>This month</CardTitle>
              <CardDescription>
                22 working days · {emp.attendance.present} present · {emp.attendance.absent + emp.attendance.leaves} absent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 22 }).map((_, i) => {
                  const isAbsent = i >= emp.attendance.present
                  const isLate = !isAbsent && i % 7 === 3
                  return (
                    <div
                      key={i}
                      title={`Day ${i + 1}`}
                      className={cn(
                        'h-7 w-7 rounded text-[10px] font-mono flex items-center justify-center',
                        isAbsent
                          ? 'bg-destructive/20 text-destructive'
                          : isLate
                            ? 'bg-warning/20 text-warning'
                            : 'bg-success/20 text-success',
                      )}
                    >
                      {i + 1}
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded bg-success/60" /> Present
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded bg-warning/60" /> Late
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded bg-destructive/60" /> Absent
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAXES */}
        <TabsContent value="taxes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tax projection 2026-27</CardTitle>
              <CardDescription>Based on current monthly TDS</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border bg-card/50 p-4">
                  <div className="text-xs text-muted-foreground">Projected annual income</div>
                  <div className="mt-1 font-mono text-2xl font-bold">{formatINR(emp.ctcAnnual)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card/50 p-4">
                  <div className="text-xs text-muted-foreground">Projected tax liability</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-warning">
                    {formatINR(Math.round(emp.ctcAnnual * 0.12))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {anomalies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tax-related anomalies</CardTitle>
                <CardDescription>Auto-detected irregularities</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {anomalies.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3"
                    >
                      <Badge
                        variant={a.severity === 'critical' ? 'destructive' : 'warning'}
                        className="uppercase text-[10px]"
                      >
                        {a.severity}
                      </Badge>
                      <div className="flex-1">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.description}</div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {relativeTime(a.detectedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Onboarding & contracts</CardDescription>
            </CardHeader>
            <CardContent>
              {documentsQuery.loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents on file yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{d.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatSize(d.sizeBytes)} · uploaded {d.issuedAt ? formatShortDate(d.issuedAt) : '—'}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">View</Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EmployeeFormDialog
        open={editing}
        onOpenChange={setEditing}
        employee={emp}
        departments={departments}
        onSaved={() => profileQuery.reload()}
      />
    </div>
  )
}
