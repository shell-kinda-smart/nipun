import { Component, ReactNode } from 'react'
import { AlertOctagon, RefreshCw, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Top-level error boundary. Catches uncaught render errors and shows a
 * recovery UI instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ hasError: false, error: undefined })

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <Card className="max-w-md p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertOctagon className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred while rendering this view.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={this.reset}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
              <Button asChild>
                <Link to="/">
                  <Home className="h-4 w-4" />
                  Home
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}