import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface AnimatedNumberProps {
  /** Final value to count up to. */
  value: number
  /** Animation duration in ms. Default 1200. */
  duration?: number
  /** When the animation should start. */
  start?: 'mount' | 'inView'
  /** Format the numeric value for display (e.g. to currency). */
  format?: (n: number) => string
  className?: string
  /** Suffix shown after the number, e.g. "%". */
  suffix?: string
  /** Decimal places to round to. */
  decimals?: number
}

/**
 * Counts up from 0 to `value` with ease-out cubic timing. Uses
 * requestAnimationFrame so it stays smooth even during heavy renders.
 * Honors `prefers-reduced-motion` — falls back to the final value.
 */
export function AnimatedNumber({
  value,
  duration = 1200,
  start = 'mount',
  format,
  className,
  suffix,
  decimals = 0,
}: AnimatedNumberProps) {
  const [current, setCurrent] = useState(0)
  const [shouldRun, setShouldRun] = useState(start === 'mount')

  useEffect(() => {
    if (!shouldRun) return
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setCurrent(value)
      return
    }
    let raf = 0
    let startTime: number | null = null
    const step = (ts: number) => {
      if (startTime === null) startTime = ts
      const t = Math.min((ts - startTime) / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setCurrent(value * eased)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, shouldRun])

  const formatted = format
    ? format(current)
    : current.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })

  return (
    <span className={cn('tabular-nums', className)}>
      {formatted}
      {suffix}
    </span>
  )
}

/** Imperative trigger so callers can start on demand (e.g. on view). */
export function useCountTrigger(start: boolean): void {
  const [, setShouldRun] = useState(false)
  useEffect(() => {
    if (start) setShouldRun(true)
  }, [start])
}