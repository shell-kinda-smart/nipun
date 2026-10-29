import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatINR, formatNumber, formatPercent } from '@/lib/format'
import { Sparkline } from './Sparkline'
import { AnimatedNumber } from './AnimatedNumber'

interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  label: string
  /** Display string (when no numeric animation desired). */
  value?: string
  /** When provided, the value counts up from 0 with eased animation. */
  numericValue?: number
  /** How `numericValue` is rendered: a full INR amount, the short INR form,
   *  or a grouped integer. */
  numericFormat?: 'compact' | 'full' | 'currency'
  delta?: number
  trend?: 'up' | 'down' | 'flat'
  icon?: React.ReactNode
  spark?: number[]
  hint?: string
}

/**
 * Formatters for the numeric variants:
 *   currency — a full INR amount (₹48,98,505)
 *   compact  — the short INR form (₹48.99L)
 *   full     — a grouped integer for headcounts and other counts (42)
 */
const NUMERIC_FORMATS = {
  compact: (n: number) => formatINR(n, { compact: true }),
  currency: (n: number) => formatINR(n),
  full: (n: number) => formatNumber(n),
} as const

export function StatCard({
  label,
  value,
  numericValue,
  numericFormat = 'compact',
  delta,
  trend = 'flat',
  icon,
  spark,
  hint,
  className,
  ...props
}: StatCardProps) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  const trendVariant =
    trend === 'up' ? 'success' : trend === 'down' ? 'destructive' : 'secondary'

  const formatValue = NUMERIC_FORMATS[numericFormat]
  /* Length of the finished string — drives the reserved width and the
     fluid type size (see `.stat-value` in index.css). */
  const valueLength = (numericValue !== undefined ? formatValue(numericValue) : value ?? '').length

  return (
    <Card className={cn('hover-lift relative overflow-hidden p-5', className)} {...props}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
      <div
        className="stat-value-row mt-3 flex flex-wrap items-baseline gap-2"
        /* Room the delta badge needs on the value's line. */
        style={delta !== undefined ? ({ '--stat-badge-space': '5.5rem' } as React.CSSProperties) : undefined}
      >
        {numericValue !== undefined ? (
          <span
            className="stat-value whitespace-nowrap font-mono text-2xl font-semibold tracking-tight md:text-3xl"
            /* Reserve the finished width so the count-up doesn't reflow the
               row (and shove the delta badge around) while it runs. */
            style={
              {
                '--stat-value-len': valueLength,
                minWidth: `${valueLength}ch`,
              } as React.CSSProperties
            }
          >
            <AnimatedNumber value={numericValue} format={formatValue} />
          </span>
        ) : (
          <span
            className="stat-value whitespace-nowrap font-mono text-2xl font-semibold tracking-tight md:text-3xl"
            style={{ '--stat-value-len': valueLength } as React.CSSProperties}
          >
            {value}
          </span>
        )}
        {delta !== undefined && (
          <Badge variant={trendVariant} className="shrink-0 gap-1">
            <TrendIcon className="h-3 w-3" />
            {formatPercent(delta)}
          </Badge>
        )}
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
      {spark && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 opacity-80">
          <Sparkline values={spark} height={40} />
        </div>
      )}
    </Card>
  )
}
