import { Link, useLocation } from 'react-router-dom'
import { Compass, ArrowLeft, Search, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePageMeta } from '@/lib/usePageMeta'

export function NotFoundPage() {
  usePageMeta('Page not found · PayLens')
  const location = useLocation()

  return (
    <div className="surface-white flex min-h-[80vh] items-center justify-center rounded-2xl p-8 shadow-soft">
      <EmptyState
        icon={<Compass className="h-5 w-5" />}
        title="We couldn't find that page"
        description={`The page ${location.pathname} doesn't exist or has been moved. Try searching or heading back home.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4" />
              Go back
            </Button>
            <Button asChild>
              <Link to="/">
                <Home className="h-4 w-4" />
                Home
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/employees">
                <Search className="h-4 w-4" />
                Browse employees
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}