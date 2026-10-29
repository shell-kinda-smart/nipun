import type { ReactNode } from 'react'
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Line, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, Users2, Wallet, Sparkles, Calculator, AlertCircle, RefreshCw, Inbox,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePageMeta } from '@/lib/usePageMeta'
import { StatCard } from '@/components/shared/StatCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import type { ApiError } from '@/lib/api'
import { formatINR, formatCompact, formatPercent, MONTHS_SHORT } from '@/lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Linear regression on the trailing payroll trend.
// Returns the fitted slope, intercept, R² and an N-step forecast.
// ─────────────────────────────────────────────────────────────────────────────
function linearRegression(y: number[]) {
  const n = y.length
  const xs = Array.from({ length: n }, (_, i) => i)
  const sumX = xs.reduce((s, x) => s + x, 0)
  const sumY = y.reduce((s, v) => s + v, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * y[i], 0)
  const sumXX = xs.reduce((s, x) => s + x * x, 0)
  const sumYY = y.reduce((s, v) => s + v * v, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  const ssTot = sumYY - (sumY * sumY) / n
  const ssRes = y.reduce((s, v, i) => s + (v - (slope * i + intercept)) ** 2, 0)
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  return { slope, intercept, rSquared }
}

function forecast(y: number[], months: number) {
  const { slope, intercept } = linearRegression(y)
  return Array.from({ length: months }, (_, i) => slope * (y.length + i) + intercept)
}

// ─────────────────────────────────────────────────────────────────────────────
// API payload — GET /api/reports/analytics
// ─────────────────────────────────────────────────────────────────────────────
interface AnalyticsPayload {
  lastGross: number
  prevGross: number
  growth: number
  averageSalary: number
  headcount: number
  activeEmployeeChange: number
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
  ctcBands: { label: string; count: number }[]
  departments: { name: string; value: number; color: string; spend: number }[]
  totalSpend: number
}

export function AnalyticsPage() {
  usePageMeta('Analytics · PayLens', 'Trends, distributions and forecasts across payroll.')
  const { data, loading, error, reload } = useApi<AnalyticsPayload>('/api/reports/analytics')

  const trend = (data?.trend ?? []).slice(-6)
  const lastTrend = trend[trend.length - 1]
  const lastGross = data?.lastGross ?? 0
  const prevGross = data?.prevGross ?? 0
  const growth =
    prevGross > 0 ? ((lastGross - prevGross) / prevGross) * 100 : data?.growth ?? 0
  const averageSalary = data?.averageSalary ?? 0
  const headcount = data?.headcount ?? 0

  const ySeries = trend.map((t) => t.gross)
  /* A regression needs at least two points — with fewer there is nothing to
     fit and the forecast is left empty. */
  const hasForecast = ySeries.length >= 2
  const { slope, rSquared } = hasForecast
    ? linearRegression(ySeries)
    : { slope: 0, rSquared: 0 }
  const predicted = hasForecast ? forecast(ySeries, 3) : []
  const nextMonth = predicted[0] ?? 0
  const nextGrowth = lastGross > 0 ? ((nextMonth - lastGross) / lastGross) * 100 : 0

  // Build a single chart series spanning history + forecast.
  const trendPlusForecast = [
    ...trend.map((t) => ({
      label: `${MONTHS_SHORT[t.month - 1]} '${String(t.year).slice(2)}`,
      actual: t.gross,
      predicted: null as number | null,
    })),
    ...predicted.map((p, i) => {
      const nextMonthNum = (lastTrend?.month ?? 0) + 1 + i
      const monthIndex = (nextMonthNum - 1) % 12
      const year = (lastTrend?.year ?? 0) + Math.floor((nextMonthNum - 1) / 12)
      return {
        label: `${MONTHS_SHORT[monthIndex]} '${String(year).slice(2)}`,
        actual: null as number | null,
        predicted: Math.round(p),
      }
    }),
  ]
  const lastActualLabel = trendPlusForecast[trend.length - 1]?.label ?? ''

  // Salary bands histogram — supplied by the API.
  const bands = (data?.ctcBands ?? []).map((b) => ({ band: b.label, count: b.count }))

  // Department spend
  const deptDist = data?.departments ?? []
  const totalSpend = data?.totalSpend ?? 0
  const spendShare = (spend: number) => (totalSpend > 0 ? (spend / totalSpend) * 100 : 0)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Trends, distributions and forecasts across your payroll."
        actions={
          <>
            <Button variant="outline" size="sm">
              Last 6 months
            </Button>
            <Button size="sm">Export report</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          label="Monthly gross"
          value={formatINR(lastGross, { compact: true })}
          delta={growth}
          trend={growth >= 0 ? 'up' : 'down'}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Avg salary"
          value={formatINR(averageSalary, { compact: true })}
          icon={<TrendingUp className="h-4 w-4" />}
          hint="per employee / month"
        />
        <StatCard
          label="Headcount"
          value={String(headcount)}
          delta={data?.activeEmployeeChange ?? 0}
          trend={(data?.activeEmployeeChange ?? 0) >= 0 ? 'up' : 'down'}
          icon={<Users2 className="h-4 w-4" />}
          hint={`across ${data?.departmentCount ?? 0} departments`}
        />
        <StatCard
          label="Forecast next month"
          value={formatINR(nextMonth, { compact: true })}
          delta={nextGrowth}
          trend="up"
          icon={<Sparkles className="h-4 w-4" />}
          hint={`${formatPercent(nextGrowth)} expected`}
        />
          </>
        )}
      </div>

      {/* Trend + forecast */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Payroll trend & forecast</CardTitle>
            <CardDescription>
              Linear regression on the last {trend.length} months · dashed line shows 3-month forecast
            </CardDescription>
          </div>
          <Badge variant="default" className="gap-1">
            <Sparkles className="h-3 w-3" />
            Forecasting
          </Badge>
        </CardHeader>
        <CardContent>
          <DataBlock
            loading={loading}
            error={error}
            isEmpty={trend.length === 0}
            onRetry={reload}
            skeleton={<Skeleton className="h-[340px] w-full" />}
          >
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendPlusForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecast-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="forecast-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" />
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
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(v: number) => (v != null ? formatINR(v, { compact: true }) : '—')}
                />
                <ReferenceLine
                  x={lastActualLabel}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="2 2"
                  label={{ value: 'Today', position: 'top', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2.5}
                  fill="url(#forecast-area)"
                  dot={{ r: 3, fill: 'hsl(var(--chart-1))' }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="url(#forecast-line)"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ r: 3, fill: 'hsl(var(--chart-2))' }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </DataBlock>
        </CardContent>
      </Card>

      {/* Two columns: salary bands + forecast insights */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Salary distribution</CardTitle>
            <CardDescription>
              Annual CTC bands across {headcount} employees
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataBlock
              loading={loading}
              error={error}
              isEmpty={bands.length === 0}
              onRetry={reload}
              skeleton={<Skeleton className="h-[260px] w-full" />}
            >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bands} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="band"
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
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            </DataBlock>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] via-card to-card">
          <CardHeader>
            <Badge variant="default" className="w-fit">
              <Calculator className="h-3 w-3" /> Forecast model
            </Badge>
            <CardTitle className="mt-2">Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DataBlock
              loading={loading}
              error={error}
              onRetry={reload}
              skeleton={
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              }
            >
            <Row label="Trend slope" value={`${formatINR(slope, { compact: true })}/mo`} />
            <Row label="R²" value={rSquared.toFixed(3)} />
            <Row
              label="Fit"
              value={rSquared > 0.9 ? 'Excellent' : rSquared > 0.7 ? 'Good' : 'Moderate'}
              valueClass={
                rSquared > 0.9 ? 'text-success' : rSquared > 0.7 ? 'text-info' : 'text-warning'
              }
            />
            <Separator />
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Forecast (next 3 months)
              </div>
              {predicted.map((p, i) => {
                const nextMonthNum = (lastTrend?.month ?? 0) + 1 + i
                const monthIndex = (nextMonthNum - 1) % 12
                const year = (lastTrend?.year ?? 0) + Math.floor((nextMonthNum - 1) / 12)
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {MONTHS_SHORT[monthIndex]} {year}
                    </span>
                    <span className="font-mono">{formatINR(p, { compact: true })}</span>
                  </div>
                )
              })}
            </div>
            </DataBlock>
          </CardContent>
        </Card>
      </div>

      {/* Department spend breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Department spend</CardTitle>
          <CardDescription>
            Monthly allocation across {deptDist.length} departments · {formatINR(totalSpend, { compact: true })} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataBlock
            loading={loading}
            error={error}
            isEmpty={deptDist.length === 0}
            onRetry={reload}
            skeleton={
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[104px] w-full rounded-lg" />
                ))}
              </div>
            }
          >
          <ul className="grid gap-3 md:grid-cols-2">
            {deptDist.map((d) => (
              <li key={d.name} className="rounded-lg border border-border bg-card/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-sm font-medium">{d.name}</span>
                  </div>
                  <span className="font-mono text-sm">{formatINR(d.spend, { compact: true })}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${spendShare(d.spend)}%`,
                      backgroundColor: d.color,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                  <span>{d.value} employees</span>
                  <span>{spendShare(d.spend).toFixed(1)}% of total</span>
                </div>
              </li>
            ))}
          </ul>
          </DataBlock>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({
  label, value, valueClass,
}: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${valueClass ?? ''}`}>{value}</span>
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
  onRetry,
  skeleton,
  children,
}: {
  loading: boolean
  error: ApiError | null
  isEmpty?: boolean
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
        description="There is no data for this period. Process a payroll run to populate it."
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
