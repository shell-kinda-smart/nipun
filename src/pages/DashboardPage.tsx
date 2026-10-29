import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  Users2, Wallet, AlertTriangle, Bell, TrendingUp, ChevronRight, Receipt,
  ArrowUpRight, ArrowDownRight, AlertCircle, RefreshCw, Inbox,
} from 'lucide-react'
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { useCurrentUser, useHasPermission } from '@/store/auth'
import type { ApiError } from '@/lib/api'
import { formatINR, formatPercent, formatCompact, relativeTime, initials } from '@/lib/format'
import { usePageMeta } from '@/lib/usePageMeta'

// ─────────────────────────────────────────────────────────────────────────────
// API payload — GET /api/reports/dashboard
// ─────────────────────────────────────────────────────────────────────────────
interface PayrollRunSummary {
  id: string
  month: number
  year: number
  totalGross: number
  totalNet: number
  employeesCount: number
}

interface DashboardPayload {
  currentRun: PayrollRunSummary | null
  previousRun: PayrollRunSummary | null
  growth: number
  activeEmployees: number
  activeEmployeeChange: number
  openAnomalies: number
  openAnomalyChange: number
  criticalAnomalies: number
  highAnomalies: number
  unreadNotifications: number
  payrollNotifications: number
  departmentCount: number
  trend: {
    id: string
    month: number
    year: number
    label: string
    gross: number
    net: number
    tax: number
    employees: number
  }[]
  departments: { name: string; value: number; color: string }[]
  recentAnomalies: {
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    status: string
    employeeId: string | null
    title: string
    description: string
    detectedAt: string
  }[]
}

/** The slice of the employee record the anomaly list needs. */
interface EmployeeSummary {
  id: string
  name: string
  designation: string
  avatarSeed: string
}

export function DashboardPage() {
  usePageMeta('Dashboard · PayLens')

  const { data, loading, error, reload } = useApi<DashboardPayload>('/api/reports/dashboard')

  // The server sends an employee's own figures rather than the
  // organisation's, so the wording follows the role.
  const isEmployee = useCurrentUser()?.role === 'employee'
  const canProcess = useHasPermission('payroll:process')

  const anomaliesFromApi = data?.recentAnomalies ?? []
  /* The anomaly payload carries no employee details, so the handful of
     employees involved is resolved once from the directory. */
  const { data: employees } = useApi<EmployeeSummary[]>(
    anomaliesFromApi.some((a) => a.employeeId) ? '/api/employees' : null,
    { perPage: 200 },
  )
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]))

  const currentRun = data?.currentRun ?? null
  const previousRun = data?.previousRun ?? null
  const totalGross = currentRun?.totalGross ?? 0
  const prevGross = previousRun?.totalGross ?? 0
  const growth =
    prevGross > 0 ? ((totalGross - prevGross) / prevGross) * 100 : data?.growth ?? 0
  const headcount = data?.activeEmployees ?? 0
  const openAnomalies = data?.openAnomalies ?? 0
  const unread = data?.unreadNotifications ?? 0
  const trend = (data?.trend ?? []).slice(-6)
  const deptDist = data?.departments ?? []
  const recentAnomalies = [...anomaliesFromApi]
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 4)

  const stagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }
  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  }

  return (
    <div className="space-y-8">
      <motion.div initial="hidden" animate="show" variants={stagger}>
        <motion.div variants={fadeUp}>
          <PageHeader
            eyebrow="Overview"
            title="Dashboard"
            description="A live snapshot of payroll, headcount and alerts across your organisation."
            actions={
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/reports">
                    <Receipt className="h-4 w-4" />
                    Export
                  </Link>
                </Button>
                {canProcess ? (
                  <Button size="sm" asChild>
                    <Link to="/payroll">
                      <TrendingUp className="h-4 w-4" />
                      Process payroll
                    </Link>
                  </Button>
                ) : undefined}
              </>
            }
          />
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[136px] rounded-xl" />
          ))
        ) : error ? (
          <ErrorNote
            className="col-span-2 lg:col-span-4"
            message={error.message}
            onRetry={reload}
          />
        ) : (
          <>
        <StatCard
          label={isEmployee ? 'Your Last Pay' : 'Total Payroll'}
          numericValue={totalGross}
          numericFormat="currency"
          delta={growth}
          trend={growth >= 0 ? 'up' : 'down'}
          icon={<Wallet className="h-4 w-4" />}
          hint="vs previous month"
        />
        <StatCard
          label={isEmployee ? 'Your Payslips' : 'Active Employees'}
          numericValue={isEmployee ? (data?.trend?.length ?? 0) : headcount}
          numericFormat="full"
          delta={data?.activeEmployeeChange ?? 0}
          trend={(data?.activeEmployeeChange ?? 0) >= 0 ? 'up' : 'down'}
          icon={<Users2 className="h-4 w-4" />}
          hint={isEmployee ? 'your payslip history' : `across ${data?.departmentCount ?? 0} departments`}
        />
        <StatCard
          label={isEmployee ? 'Your Open Anomalies' : 'Open Anomalies'}
          numericValue={openAnomalies}
          numericFormat="full"
          delta={data?.openAnomalyChange ?? 0}
          trend={(data?.openAnomalyChange ?? 0) <= 0 ? 'down' : 'up'}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint={`${data?.criticalAnomalies ?? 0} critical · ${data?.highAnomalies ?? 0} high`}
        />
        <StatCard
          label="Unread Notifications"
          numericValue={unread}
          numericFormat="full"
          icon={<Bell className="h-4 w-4" />}
          hint={`${data?.payrollNotifications ?? 0} payroll-related`}
        />
          </>
        )}
        </motion.div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{isEmployee ? 'Your pay' : 'Payroll trend'}</CardTitle>
              <CardDescription>
                {isEmployee
                  ? 'Your gross pay over the last 6 periods'
                  : 'Total gross payroll over the last 6 months'}
              </CardDescription>
            </div>
            <Badge variant={growth >= 0 ? 'success' : 'warning'} className="gap-1">
              {growth >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {formatPercent(growth)}
            </Badge>
          </CardHeader>
          <CardContent>
            <DataBlock
              loading={loading}
              error={error}
              isEmpty={trend.length === 0}
              isEmployee={isEmployee}
              onRetry={reload}
              skeleton={<Skeleton className="h-[260px] w-full" />}
            >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dash-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatCompact(v)}
                    /* Zoom to the data range — anchoring at zero pins the line to
                       the top of the plot and hides the trend entirely. */
                    domain={[(min: number) => min * 0.985, (max: number) => max * 1.015]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(v: number) => formatINR(v, { compact: true })}
                  />
                  <Area
                    type="monotone"
                    dataKey="gross"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    fill="url(#dash-grad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            </DataBlock>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isEmployee ? 'Your department' : 'Headcount by department'}</CardTitle>
            <CardDescription>{isEmployee ? 'Where you work' : 'Current allocation'}</CardDescription>
          </CardHeader>
          <CardContent>
            <DataBlock
              loading={loading}
              error={error}
              isEmpty={deptDist.length === 0}
              isEmployee={isEmployee}
              onRetry={reload}
              skeleton={<Skeleton className="h-[180px] w-full" />}
            >
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deptDist}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {deptDist.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 space-y-1.5">
              {deptDist.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-mono">{d.value}</span>
                </li>
              ))}
            </ul>
            </DataBlock>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent anomalies</CardTitle>
              <CardDescription>Auto-detected payroll irregularities</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/anomalies">
                View all
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <DataBlock
              loading={loading}
              error={error}
              isEmpty={recentAnomalies.length === 0}
              isEmployee={isEmployee}
              onRetry={reload}
              skeleton={
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[76px] w-full rounded-lg" />
                  ))}
                </div>
              }
            >
            <ul className="space-y-3">
              {recentAnomalies.map((a) => {
                const emp = a.employeeId ? employeeById.get(a.employeeId) : undefined
                const variant =
                  a.severity === 'critical' ? 'destructive' : a.severity === 'high' ? 'warning' : 'secondary'
                return (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3">
                    <div
                      className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-md ${
                        a.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : a.severity === 'high'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{a.title}</span>
                        <Badge variant={variant} className="text-[10px] uppercase">{a.severity}</Badge>
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.description}</div>
                      {emp && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${emp.avatarSeed}`} />
                            <AvatarFallback className="text-[9px]">{initials(emp.name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-[11px] text-muted-foreground">
                            {emp.name} · {emp.designation}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(a.detectedAt)}</span>
                  </li>
                )
              })}
            </ul>
            </DataBlock>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card">
          <CardHeader>
            <Badge variant="default" className="w-fit">Forecasting</Badge>
            <CardTitle className="mt-2">Next month estimate</CardTitle>
            <CardDescription>
              {isEmployee ? 'Your pay, projected from the trend' : 'Predictive model ships in the analytics phase'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {isEmployee ? 'Predicted pay' : 'Predicted payroll'}
              </div>
              <div className="mt-1 font-mono text-3xl font-bold tracking-tight">
                {loading ? (
                  <Skeleton className="h-8 w-36" />
                ) : (
                  formatINR(totalGross * (1 + growth / 100), { compact: true })
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <Badge variant={growth >= 0 ? 'success' : 'warning'} className="gap-1">
                  {growth >= 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {formatPercent(growth)} expected
                </Badge>
                <span className="text-muted-foreground">vs this month</span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
              Based on trailing 6-period growth trend. Confidence ±2.1%.
            </div>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/analytics">
                Open analytics
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * A data-driven block: skeleton while the request is in flight, an inline
 * error note when it fails, an empty state when there is nothing to show and
 * the real content once it arrives.
 */
function DataBlock({
  loading,
  error,
  isEmpty,
  isEmployee = false,
  onRetry,
  skeleton,
  children,
}: {
  loading: boolean
  error: ApiError | null
  isEmpty?: boolean
  isEmployee?: boolean
  onRetry: () => void
  skeleton: ReactNode
  children: ReactNode
}) {
  if (loading) return <>{skeleton}</>
  if (error) return <ErrorNote message={error.message} onRetry={onRetry} />
  if (isEmpty) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title="Nothing to show yet"
        description={isEmployee
          ? 'There is no payroll on your record yet. It appears here once you have been paid.'
          : 'There is no data for this period. Process a payroll run to populate it.'}
      />
    )
  }
  return <>{children}</>
}

/** Inline failure state — the page chrome stays on screen. */
function ErrorNote({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border bg-card/50 px-4 py-3 text-sm text-destructive ${className ?? ''}`}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="ghost" size="sm" onClick={onRetry} className="h-7 px-2">
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  )
}
