import type { ReactNode } from 'react'
import {
  Calculator, TrendingUp, FileText, ArrowUpRight, Wallet, Building2,
  AlertCircle, RefreshCw, Inbox,
} from 'lucide-react'
import {
  Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts'
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
import { formatINR, formatCompact, MONTHS_SHORT } from '@/lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// API payload — GET /api/reports/tax-center
// ─────────────────────────────────────────────────────────────────────────────
interface TaxCenterPayload {
  currentTax: number
  previousTax: number
  growth: number
  ytdTax: number
  projectedAnnual: number
  projectedAnnualChange: number
  effectiveTaxRate: number
  periodCount: number
  highestContributor: { employeeId: string; name: string; tax: number } | null
  employeeCount: number
  trend: {
    id: string
    month: number
    year: number
    label: string
    tax: number
  }[]
  departments: { name: string; color: string; value: number; tax: number }[]
  slabs: { label: string; rate: string; count: number }[]
}

export function TaxCenterPage() {
  usePageMeta('Tax Center · PayLens', 'TDS deductions, slab distribution and year-to-date projections.')
  const { data, loading, error, reload } = useApi<TaxCenterPayload>('/api/reports/tax-center')

  const currentTax = data?.currentTax ?? 0
  const previousTax = data?.previousTax ?? 0
  const growth =
    previousTax > 0 ? ((currentTax - previousTax) / previousTax) * 100 : data?.growth ?? 0
  const ytd = data?.ytdTax ?? 0
  const projectedAnnual = data?.projectedAnnual ?? 0
  const employeeCount = data?.employeeCount ?? 0

  // Monthly tax trend
  const taxTrend = (data?.trend ?? []).map((t) => ({
    label: `${MONTHS_SHORT[t.month - 1]} '${String(t.year).slice(2)}`,
    tax: t.tax,
  }))

  // Department-wise tax distribution — supplied by the API.
  const deptTax = (data?.departments ?? []).map((d) => ({
    name: d.name,
    color: d.color,
    value: d.tax,
  }))

  // Tax slabs and the employee count behind them — supplied by the API.
  const slabs = data?.slabs ?? []
  const slabShare = (count: number) => (employeeCount > 0 ? (count / employeeCount) * 100 : 0)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Insights"
        title="Tax Center"
        description="TDS deductions, slab distribution and year-to-date projections."
        actions={
          <>
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4" />
              Form 24Q
            </Button>
            <Button size="sm">
              <Calculator className="h-4 w-4" />
              Tax planner
            </Button>
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
          label="Current month TDS"
          value={formatINR(currentTax, { compact: true })}
          delta={growth}
          trend={growth >= 0 ? 'up' : 'down'}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="YTD tax"
          value={formatINR(ytd, { compact: true })}
          icon={<TrendingUp className="h-4 w-4" />}
          hint={`across ${data?.periodCount ?? 0} months`}
        />
        <StatCard
          label="Projected annual"
          value={formatINR(projectedAnnual, { compact: true })}
          delta={data?.projectedAnnualChange ?? 0}
          trend={(data?.projectedAnnualChange ?? 0) >= 0 ? 'up' : 'down'}
          icon={<Calculator className="h-4 w-4" />}
          hint="based on YTD trend"
        />
        <StatCard
          label="Avg per employee"
          value={formatINR(employeeCount > 0 ? Math.round(currentTax / employeeCount) : 0)}
          icon={<Building2 className="h-4 w-4" />}
          hint="monthly"
        />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly TDS trend</CardTitle>
            <CardDescription>Total tax deducted each month</CardDescription>
          </CardHeader>
          <CardContent>
            <DataBlock
              loading={loading}
              error={error}
              isEmpty={taxTrend.length === 0}
              onRetry={reload}
              skeleton={<Skeleton className="h-[260px] w-full" />}
            >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taxTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(v: number) => formatINR(v, { compact: true })}
                  />
                  <Bar dataKey="tax" fill="hsl(var(--chart-3))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            </DataBlock>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department distribution</CardTitle>
            <CardDescription>Tax split by department</CardDescription>
          </CardHeader>
          <CardContent>
            <DataBlock
              loading={loading}
              error={error}
              isEmpty={deptTax.length === 0}
              onRetry={reload}
              skeleton={<Skeleton className="h-[180px] w-full" />}
            >
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deptTax} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
                    {deptTax.map((d, i) => (
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
                    formatter={(v: number) => formatINR(v, { compact: true })}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 space-y-1.5">
              {deptTax.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-mono">{formatINR(d.value, { compact: true })}</span>
                </li>
              ))}
            </ul>
            </DataBlock>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tax slabs applied</CardTitle>
          <CardDescription>Distribution of employees by income slab</CardDescription>
        </CardHeader>
        <CardContent>
          <DataBlock
            loading={loading}
            error={error}
            isEmpty={slabs.length === 0}
            onRetry={reload}
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            }
          >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 font-semibold">Slab</th>
                  <th className="py-2 font-semibold">Rate</th>
                  <th className="py-2 text-right font-semibold">Employees</th>
                  <th className="py-2 text-right font-semibold">Share</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {slabs.map((s) => (
                  <tr key={s.label} className="border-b border-border/50">
                    <td className="py-3 text-sm">{s.label}</td>
                    <td className="py-3">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {s.rate}
                      </Badge>
                    </td>
                    <td className="py-3 text-right font-mono text-sm">{s.count}</td>
                    <td className="py-3 text-right font-mono text-sm text-muted-foreground">
                      {slabShare(s.count).toFixed(0)}%
                    </td>
                    <td className="py-3">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${slabShare(s.count)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </DataBlock>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-primary-ink" />
            <CardTitle>Tax insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <DataBlock
            loading={loading}
            error={error}
            onRetry={reload}
            skeleton={
              <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
                ))}
              </div>
            }
          >
          <div className="grid gap-3 md:grid-cols-3">
            <Insight
              title="Effective tax rate"
              value={`${(data?.effectiveTaxRate ?? 0).toFixed(1)}%`}
              desc="Across all employees this month"
            />
            <Insight
              title="Highest contributor"
              value={data?.highestContributor?.name ?? '—'}
              desc={
                data?.highestContributor
                  ? `${formatINR(data.highestContributor.tax, { compact: true })} this month`
                  : 'No tax recorded this month'
              }
            />
            <Insight
              title="Filing deadline"
              value="31 Jan 2027"
              desc="For FY 2026-27 returns"
            />
          </div>
          </DataBlock>
        </CardContent>
      </Card>
    </div>
  )
}

function Insight({ title, value, desc }: { title: string; value: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
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
