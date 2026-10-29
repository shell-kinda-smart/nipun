import { useId } from 'react'
import { cn } from '@/lib/utils'

interface SparklineProps {
  values: number[]
  className?: string
  stroke?: string
  /** Solid fill colour. When omitted a vertical gradient is derived from `stroke`. */
  fill?: string
  height?: number
}

/**
 * Inline SVG sparkline with a soft area fill.
 * Used by StatCard and dashboard tiles.
 *
 * The fill is a vertical gradient rather than a flat slab: a flat fill under a
 * rising series renders as a hard-edged wedge that reads as a stray slash
 * across the card, which is especially obvious against the gold brand colour.
 */
export function Sparkline({
  values,
  className,
  stroke = 'hsl(var(--primary))',
  fill,
  height = 60,
}: SparklineProps) {
  const gradientId = useId()
  if (values.length < 2) return null
  const dataMax = Math.max(...values)
  const dataMin = Math.min(...values)
  const range = dataMax - dataMin || 1
  const step = 100 / (values.length - 1)
  const points = values
    .map((v, i) => {
      const x = i * step
      const y = 100 - ((v - dataMin) / range) * 100
      return `${x},${y}`
    })
    .join(' ')
  const areaPoints = `0,100 ${points} 100,100`

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn('w-full', className)} style={{ height }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={fill ?? `url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeOpacity="0.7"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
