/**
 * Number, currency, date and string formatters used across the platform.
 * Defaults are India-friendly (INR / en-IN) since the spec uses ₹; all
 * functions are pure and tree-shakeable.
 */

const LAKH = 100_000
const CRORE = 10_000_000

// Intl formatters are expensive to construct and the stat cards re-format on
// every animation frame while counting up, so they are built once and reused.
const inrFormatters = new Map<number, Intl.NumberFormat>()
const plainFormatter = new Intl.NumberFormat('en-IN')

function inrFormatter(decimals: number) {
  let f = inrFormatters.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: decimals,
    })
    inrFormatters.set(decimals, f)
  }
  return f
}

export function formatINR(amount: number, opts?: { compact?: boolean; decimals?: number }) {
  const decimals = opts?.decimals ?? 0
  if (opts?.compact) {
    const abs = Math.abs(amount)
    if (abs >= CRORE) return `₹${(amount / CRORE).toFixed(2)}Cr`
    if (abs >= LAKH) return `₹${(amount / LAKH).toFixed(2)}L`
    if (abs >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`
    return `₹${amount.toFixed(decimals)}`
  }
  return inrFormatter(decimals).format(amount)
}

export function formatCompact(n: number, fractionDigits = 1) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

export function formatNumber(n: number) {
  return plainFormatter.format(n)
}

export function formatPercent(n: number, decimals = 1) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(decimals)}%`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('')
}

export function formatMonthYear(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatShortDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatTime(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function relativeTime(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return formatShortDate(d)
}

// Re-export month lists so consumers don't need to know they live in
// `@/data/constants`. Keeps the data layer behind one stable surface.
export { MONTHS_SHORT, MONTHS_LONG } from '@/data/constants'