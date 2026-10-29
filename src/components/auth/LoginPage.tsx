import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Mail, Lock, Eye, EyeOff, Shield, BarChart3, Sparkles, ChevronRight, AlertCircle, Loader2,
} from 'lucide-react'
import { BrandLockup } from '@/components/shared/Brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/auth'
import { ROLE_LABELS } from '@/data'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { useApi } from '@/hooks/useApi'
import type { Role } from '@/data'

const features = [
  { icon: BarChart3, title: 'Workforce analytics', body: 'Real-time headcount, payroll trends and department distribution.' },
  { icon: Shield, title: 'Role-based access', body: 'Admin, HR, Finance and Employee. Each with its own sidebar.' },
  { icon: Sparkles, title: 'Forecasting & anomaly detection', body: 'Predictive payroll and automated flagging of unusual changes.' },
]

interface DemoAccount {
  id: string
  name: string
  email: string
  role: Role
  avatarSeed: string
}

// RFC-5322 lite — sufficient for UI hint, not for security.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const signIn = useAuthStore((s) => s.signIn)
  const switchRole = useAuthStore((s) => s.switchRole)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demoError, setDemoError] = useState<string | null>(null)

  // The demo accounts come from the server; the endpoint only exists while
  // it runs in demo mode.
  const { data: demoAccounts } = useApi<DemoAccount[]>('/api/auth/demo-users')

  const emailValid = useMemo(() => email === '' || EMAIL_RE.test(email), [email])
  const canSubmit = emailValid && email.length > 0 && password.length > 0 && !submitting

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await signIn(email.trim(), password, remember)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Sign-in failed. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const onDemoSignIn = async (role: Role) => {
    setDemoError(null)
    try {
      await switchRole(role)
    } catch (err) {
      setDemoError(
        err instanceof ApiError ? err.message : 'That demo account is not available.',
      )
    }
  }

  const accountsByRole = new Map((demoAccounts ?? []).map((a) => [a.role, a]))

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — hidden on small screens */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card/40 p-10 lg:flex">
        <div className="absolute inset-0 gradient-radial opacity-80" />
        <div className="absolute inset-0 grid-bg opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

        <div className="flex items-center gap-2">
          <BrandLockup size="lg" />
        </div>

        <div className="relative space-y-8">
          <div>
            <Badge variant="default" className="mb-4">Payroll analytics, elevated</Badge>
            <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              <span className="text-primary-foreground/90">Run payroll</span> with the precision of an enterprise platform.
            </h2>            <p className="mt-4 max-w-md text-muted-foreground">
              Forecasting, anomaly detection, role-based dashboards and a payroll processing wizard.
              Built for teams that take compensation seriously.
            </p>
          </div>

          <ul className="space-y-4">
            {features.map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex gap-3"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                  <f.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.body}</div>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">© 2026 PayLens Technologies Pvt. Ltd.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-strong w-full max-w-md rounded-2xl p-8 shadow-premium"
        >
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <BrandLockup size="md" />
            </Link>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your account to continue
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@paylens.co"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn('pl-9', !emailValid && 'border-destructive focus-visible:ring-destructive')}
                  autoComplete="email"
                  aria-invalid={!emailValid}
                  required
                />
              </div>
              {!emailValid && (
                <p className="text-xs text-destructive">Please enter a valid email address.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary-ink hover:underline"
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(c) => setRemember(Boolean(c))}
              />
              <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
                Remember me for 30 days
              </Label>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {demoAccounts && demoAccounts.length > 0 && (
            <>
              <div className="my-8 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                Demo accounts · one click
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => onDemoSignIn(account.role)}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3 text-left transition-all hover:border-primary/40 hover:bg-accent',
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${account.avatarSeed}`} />
                      <AvatarFallback>{initials(account.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{ROLE_LABELS[account.role]}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{account.name}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary-ink" />
                  </button>
                ))}
              </div>

              {demoError && (
                <p className="mt-3 text-center text-xs text-destructive">{demoError}</p>
              )}
            </>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in you agree to our{' '}
            <span className="text-primary-ink">Terms</span> and{' '}
            <span className="text-primary-ink">Privacy Policy</span>.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
