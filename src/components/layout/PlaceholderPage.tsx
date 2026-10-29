import type { ReactNode } from 'react'
import { Link2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Sparkles } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  eyebrow?: string
  description?: string
  icon?: ReactNode
  /** Mark a feature-phase deliverable so the user knows what to expect. */
  comingIn?: string
}

/**
 * Generic placeholder used by routes whose real content ships in a later
 * feature phase. Each route imports this and passes the right title.
 */
export function PlaceholderPage({
  title,
  eyebrow,
  description,
  icon,
  comingIn = 'a later feature phase',
}: PlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        {eyebrow && (
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary-ink">{eyebrow}</div>
        )}
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>

      <EmptyState
        icon={icon ?? <Sparkles className="h-5 w-5" />}
        title={`${title} module`}
        description={`This route is wired and reachable. The full experience ships in ${comingIn}.`}
        action={
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 text-primary-ink" />
            Phase 5 · app shell ready
          </div>
        }
      />
    </div>
  )
}