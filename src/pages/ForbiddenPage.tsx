import { Link } from 'react-router-dom'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePageMeta } from '@/lib/usePageMeta'

export function ForbiddenPage() {
  usePageMeta('Access denied · PayLens')
  return (
    <div className="surface-white flex min-h-[60vh] items-center justify-center rounded-2xl p-8 shadow-soft">
      <EmptyState
        icon={<ShieldOff className="h-5 w-5" />}
        title="Access denied"
        description="You don't have permission to view this page. Try switching roles via the top-right avatar menu or contact your administrator."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4" />
              Go back
            </Button>
            <Button asChild>
              <Link to="/">Home</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}