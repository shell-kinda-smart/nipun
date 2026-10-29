import { Loader2 } from 'lucide-react'

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary-ink" />
        <p className="text-sm text-muted-foreground">{label}…</p>
      </div>
    </div>
  )
}