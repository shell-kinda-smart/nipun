import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * PayLens brand mark.
 *
 * A gold tile split by a diagonal facet, with the dollar glyph cut into it
 * in the deep navy. The two-tone split gives the mark the folded,
 * geometric read of a real logo rather than a flat icon, and it still
 * survives at 16px.
 *
 * The geometry lives in a 36×36 box:
 *   - the tile is a 10-radius rounded square with a gold gradient
 *   - the facet is the lower-right triangle (36,13) → (24,36) → (36,36)
 *   - the glyph is the dollar sign, scaled from a 24-unit construction
 */
export function LogoMark({ className }: { className?: string }) {
  const gradientId = useId()

  return (
    <span
      className={cn(
        'relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-elev',
        className,
      )}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#EBD69E" />
            <stop offset="52%" stopColor="#D3B264" />
            <stop offset="100%" stopColor="#B8913F" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="10" fill={`url(#${gradientId})`} />
        <path d="M36 13 L24 36 H36 Z" fill="#7A581A" fillOpacity="0.42" />
        <g fill="none" stroke="#0B1A33" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23.8 8.4 H13.6 a4.6 4.6 0 0 0 0 9.2 h6.4 a4.6 4.6 0 0 1 0 9.2 H8.4" />
          <path d="M16.6 4.2 v27.6" />
        </g>
      </svg>
    </span>
  )
}

const LOCKUP = {
  sm: { mark: 'h-8 w-8 rounded-[10px]', word: 'text-sm', tag: 'text-[9px]' },
  md: { mark: 'h-9 w-9', word: 'text-[15px]', tag: 'text-[9px]' },
  lg: { mark: 'h-10 w-10', word: 'text-lg', tag: 'text-[10px]' },
} as const

/**
 * Wordmark lockup: mark + product name + category descriptor.
 *
 * "PayLens" alone reads like a name; pairing it with a descriptor under a
 * tracked-out caption is what makes it read as a product. `inverse` swaps
 * the text colours for the navy sidebar.
 */
export function BrandLockup({
  className,
  markClassName,
  size = 'md',
  inverse = false,
}: {
  className?: string
  markClassName?: string
  size?: keyof typeof LOCKUP
  inverse?: boolean
}) {
  const s = LOCKUP[size]
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={cn(s.mark, markClassName)} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-bold tracking-tight',
            s.word,
            inverse ? 'text-sidebar-foreground' : 'text-foreground',
          )}
        >
          PayLens
        </span>
        <span
          className={cn(
            'mt-1 font-semibold uppercase tracking-[0.2em]',
            s.tag,
            inverse ? 'text-sidebar-muted' : 'text-muted-foreground',
          )}
        >
          Payroll Analytics
        </span>
      </span>
    </span>
  )
}
