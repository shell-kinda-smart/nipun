import {
  Calculator, FileText, Download, TrendingUp, Wallet, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageMeta } from '@/lib/usePageMeta'
import { EmptyState } from '@/components/shared/EmptyState'
import { useApi } from '@/hooks/useApi'
import { formatINR } from '@/lib/format'

/** The signed-in employee's tax summary, as returned by `GET /api/me/tax`. */
interface MeTax {
  annualIncome: number
  taxable: number
  projectedTax: number
  ytd: number
  ytdTax: number
  slabs: { label: string; rate: string; count: number }[]
  disclaimer: string
}

/**
 * Every answer arrives in a `{ "data": … }` envelope. Some endpoints wrap the
 * payload a second time, so the inner object is unwrapped when it is there.
 */
function toObject<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const inner = (payload as { data?: unknown }).data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner as T
  return payload as T
}

export function MyTaxPage() {
  usePageMeta('My tax info · PayLens', 'Personal tax deductions, projections and certificates.')
  const { data: payload, loading, error, reload } = useApi<MeTax | { data: MeTax }>('/api/me/tax')
  const tax = toObject<MeTax>(payload)

  const download = (label: string) => {
    toast.success(`${label} downloaded`)
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="My account"
          title="My Tax Info"
          description="Tax deductions, projections and downloadable certificates for FY 2026-27."
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-8 w-32" />
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-6 h-24 w-full" />
          </Card>
          <Card className="p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-6 h-32 w-full" />
          </Card>
        </div>
      </div>
    )
  }

  if (error || !tax) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="My account"
          title="My Tax Info"
          description="Tax deductions, projections and downloadable certificates for FY 2026-27."
        />
        <EmptyState
          icon={<Calculator className="h-5 w-5" />}
          title="Could not load your tax information"
          description={error?.message}
          action={
            <Button variant="outline" size="sm" onClick={reload}>
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  const { annualIncome, taxable, projectedTax, ytdTax, slabs } = tax
  const paidPercent = projectedTax > 0 ? Math.min(100, (ytdTax / projectedTax) * 100) : 0
  const remaining = Math.max(0, projectedTax - ytdTax)
  const monthsLeft = 6

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My account"
        title="My Tax Info"
        description="Tax deductions, projections and downloadable certificates for FY 2026-27."
      />

      <p className="text-xs text-muted-foreground">{tax.disclaimer}</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Annual CTC"
          value={formatINR(annualIncome, { compact: true })}
          icon={<Wallet className="h-4 w-4" />}
          hint="FY 2026-27"
        />
        <StatCard
          label="Taxable income"
          value={formatINR(taxable, { compact: true })}
          icon={<Receipt className="h-4 w-4" />}
          hint="taxable income"
        />
        <StatCard
          label="Projected tax"
          value={formatINR(projectedTax, { compact: true })}
          icon={<Calculator className="h-4 w-4" />}
          hint="projected liability"
        />
        <StatCard
          label="YTD paid"
          value={formatINR(ytdTax, { compact: true })}
          icon={<TrendingUp className="h-4 w-4" />}
          hint="year to date"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tax progress</CardTitle>
            <CardDescription>
              You've paid {paidPercent.toFixed(0)}% of your projected liability
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-mono">{formatINR(ytdTax)} / {formatINR(projectedTax)}</span>
              </div>
              <Progress value={paidPercent} className="mt-2 h-2" />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Remaining
                </div>
                <div className="mt-1 font-mono text-xl font-bold">{formatINR(remaining)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Over {monthsLeft} months
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Monthly avg
                </div>
                <div className="mt-1 font-mono text-xl font-bold">{formatINR(Math.round(remaining / monthsLeft))}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">TDS going forward</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax slabs</CardTitle>
            <CardDescription>FY 2026-27</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {slabs.map((s) => {
                const isActive =
                  (s.label === '0 – 5L' && annualIncome <= 500_000) ||
                  (s.label === '5 – 10L' && annualIncome > 500_000 && annualIncome <= 1_000_000) ||
                  (s.label === '10 – 20L' && annualIncome > 1_000_000 && annualIncome <= 2_000_000) ||
                  (s.label === '20L+' && annualIncome > 2_000_000)
                return (
                  <li
                    key={s.label}
                    className={`flex items-center justify-between rounded-md border p-2 text-sm ${
                      isActive ? 'border-primary bg-primary/10' : 'border-border bg-card/30'
                    }`}
                  >
                    <span>
                      {s.label}
                      <span className="ml-1 text-[10px] text-muted-foreground">{s.count} on slab</span>
                    </span>
                    <Badge variant={isActive ? 'default' : 'secondary'} className="font-mono text-[10px]">
                      {s.rate}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tax certificates</CardTitle>
          <CardDescription>Download official documents for filing</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {[
              { label: 'Form 16 (TDS Certificate)', desc: 'Annual certificate from employer', available: false },
              { label: 'Form 26ASQ', desc: 'Tax credit statement (will be available 31 May 2027)' },
              { label: 'Salary slips YTD', desc: '6 monthly payslips bundled into one PDF' },
              { label: 'Investment declaration', desc: 'For FY 2027-28' },
            ].map((doc) => (
              <li key={doc.label} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{doc.label}</div>
                    <div className="text-xs text-muted-foreground">{doc.desc}</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={doc.available === false}
                  onClick={() => download(doc.label)}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
