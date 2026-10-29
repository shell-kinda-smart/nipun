import { Outlet, Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BrandLockup, LogoMark } from '@/components/shared/Brand'
import { Button } from '@/components/ui/button'

export function PublicShell() {
  return (
    <div className="relative min-h-screen overflow-hidden gradient-radial">
      <div className="absolute inset-0 grid-bg opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_60%)]" />

      <header className="glass-strong sticky top-0 z-20 border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <BrandLockup size="md" />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link to="/features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Features
            </Link>
            <Link to="/pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </Link>
            <Link to="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Button size="sm">
              <Link to="/login" className="flex items-center gap-1">
                Get started
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </nav>

          <Button asChild size="sm" className="md:hidden">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="relative">
        <Outlet />
      </main>

      <footer className="surface-white relative mt-20 border-t border-border/60 backdrop-blur">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <LogoMark className="h-7 w-7 rounded-[9px]" />
              <span className="font-bold">PayLens</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Payroll analytics, refined.</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Product</h4>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li><Link to="/features" className="transition-colors hover:text-foreground">Features</Link></li>
              <li><Link to="/pricing" className="transition-colors hover:text-foreground">Pricing</Link></li>
              <li><Link to="/login" className="transition-colors hover:text-foreground">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Demo accounts</h4>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li>Admin · Arjun Mehta</li>
              <li>HR · Sneha Iyer</li>
              <li>Finance · Vikram Khanna</li>
              <li>Employee · Sample</li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Legal</h4>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li><Link to="/privacy" className="transition-colors hover:text-foreground">Privacy policy</Link></li>
              <li><Link to="/terms" className="transition-colors hover:text-foreground">Terms and conditions</Link></li>
              <li><a href="mailto:hello@paylens.co" className="transition-colors hover:text-foreground">hello@paylens.co</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60 px-6 py-4 text-center text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} PayLens · Made with care in Bangalore
        </div>
      </footer>
    </div>
  )
}