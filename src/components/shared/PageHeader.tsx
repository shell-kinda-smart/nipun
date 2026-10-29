import * as React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)} {...props}>
      <div className="space-y-1.5">
        {eyebrow && (
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary-ink">{eyebrow}</div>
        )}
        <h1 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children && <div className="mt-4 w-full">{children}</div>}
    </div>
  )
}