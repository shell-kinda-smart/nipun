import { CreditCard, Download, Sparkles, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePageMeta } from '@/lib/usePageMeta'
import { useApi } from '@/hooks/useApi'
import { formatINR, formatShortDate } from '@/lib/format'

const PLAN = {
  price: '₹39',
  unit: '/employee/mo',
  cycle: 'Yearly · renews 28 Mar 2027',
  features: [
    'All 4 roles',
    'Forecasting + anomaly detection',
    'Reports center',
    'Audit log',
    'Priority support',
  ],
}

/** `GET /api/settings/billing` — plan, seats and invoices. */
interface Billing {
  plan: string
  seatsUsed: number
  seatLimit: number
  invoices: { id: string; amount: number; date: string; status: string }[]
}

/** Invoice dates arrive as plain `YYYY-MM-DD` days; parse them locally. */
function invoiceDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return value
  return formatShortDate(new Date(y, m - 1, d))
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

export function BillingSettings() {
  usePageMeta('Billing · PayLens', 'Subscription, invoices and payment method.')
  const { data: payload, loading, error, reload } = useApi<Billing | { data: Billing }>(
    '/api/settings/billing',
  )
  const data = toObject<Billing>(payload)

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-9 w-56" />
          <Skeleton className="mt-6 h-2 w-full" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-40 w-full" />
        </Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<CreditCard className="h-5 w-5" />}
          title="Could not load your billing details"
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

  const { plan, seatsUsed, seatLimit, invoices } = data

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card">
        <CardHeader>
          <Badge variant="default" className="w-fit">
            <Sparkles className="h-3 w-3" />
            Current plan
          </Badge>
          <CardTitle className="mt-2 flex items-baseline gap-2">
            <span>{plan}</span>
            <span className="font-mono text-2xl">{PLAN.price}</span>
            <span className="text-sm font-normal text-muted-foreground">{PLAN.unit}</span>
          </CardTitle>
          <CardDescription>{PLAN.cycle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Seats</span>
              <span className="font-mono">
                {seatsUsed} / {seatLimit}
              </span>
            </div>
            <Progress value={seatLimit > 0 ? (seatsUsed / seatLimit) * 100 : 0} className="mt-2 h-2" />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {PLAN.features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <Check className="h-3.5 w-3.5 text-success" />
                {f}
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="#">Upgrade plan</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="#">Manage payment method</a>
            </Button>
            <Button
              variant="ghost"
              onClick={() => toast.info('Cancellation flow coming soon')}
            >
              Cancel subscription
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Last 6 months · {seatsUsed} active employees</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              All invoices
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 font-semibold">Invoice</th>
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                  <th className="py-2 text-right font-semibold">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 last:border-0">
                    <td className="py-3 font-mono text-xs">{inv.id}</td>
                    <td className="py-3 text-sm">{invoiceDate(inv.date)}</td>
                    <td className="py-3 text-right font-mono text-sm">{formatINR(inv.amount)}</td>
                    <td className="py-3 text-right">
                      <Badge variant="success" className="text-[10px] capitalize">
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <Button variant="ghost" size="sm">
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      No invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary-ink" />
            Payment method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-14 items-center justify-center rounded-md bg-gradient-to-br from-indigo-400 to-indigo-600 font-bold text-white">
                VISA
              </div>
              <div>
                <div className="font-mono text-sm">•••• •••• •••• 4242</div>
                <div className="text-xs text-muted-foreground">Expires 12 / 2028</div>
              </div>
            </div>
            <Button variant="outline" size="sm">Update</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
