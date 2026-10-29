import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart3, Shield, Sparkles, Receipt, Building2, Users2, ArrowRight,
  AlertTriangle, Command, Wallet, Layers, TrendingUp, FileText, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageMeta } from '@/lib/usePageMeta'

interface FeatureGroup {
  eyebrow: string
  title: string
  description: string
  features: { icon: typeof BarChart3; title: string; body: string }[]
}

const GROUPS: FeatureGroup[] = [
  {
    eyebrow: 'Analytics',
    title: 'See the full picture, in real time.',
    description: 'Every dashboard surfaces live data, no manual refresh required.',
    features: [
      { icon: BarChart3, title: 'Payroll trend + forecast', body: 'Linear-regression forecast with confidence bands and R².' },
      { icon: Layers, title: 'Department distribution', body: 'Donut chart of headcount and spend by team.' },
      { icon: TrendingUp, title: 'Salary bands', body: 'Histogram of CTC bands from <₹5L to >₹50L.' },
      { icon: Sparkles, title: 'Predictive forecasting', body: '3-month payroll projection with confidence interval.' },
    ],
  },
  {
    eyebrow: 'Compliance',
    title: 'Catch problems before payroll runs.',
    description: 'Anomaly detection + audit log keeps the books clean.',
    features: [
      { icon: AlertTriangle, title: 'Anomaly detection', body: 'Auto-flag duplicate payments, salary spikes, bank mismatches.' },
      { icon: Shield, title: 'Audit log', body: 'Every action tracked: who, what, when, from where.' },
      { icon: FileText, title: 'Reports center', body: '7 templates · filter · preview · CSV/JSON/TXT export.' },
      { icon: Clock, title: 'Multi-session', body: 'Track every device that touches your account.' },
    ],
  },
  {
    eyebrow: 'Experience',
    title: 'Built for teams that move fast.',
    description: 'A modern shell with the keyboard shortcuts and polish you’d expect.',
    features: [
      { icon: Command, title: 'Command palette', body: 'Press Ctrl+K anywhere. Navigate, search employees, run actions.' },
      { icon: Users2, title: 'Role-based shells', body: 'Admin, HR, Finance and Employee. Each with their own sidebar.' },
      { icon: Wallet, title: 'Payroll wizard', body: 'Six guided steps from month to approval.' },
      { icon: Receipt, title: 'Payslip designer', body: 'Branded payslip with print stylesheet and download.' },
    ],
  },
]

export function FeaturesPage() {
  usePageMeta('Features · PayLens', 'Everything PayLens does, grouped by area.')
  return (
    <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-20">
      <div className="text-center">
        <Badge variant="default" className="mb-3">Features</Badge>
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
          Built for serious payroll teams.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          A focused platform. Forecasting, anomaly detection, role-based access, payroll
          processing, reports, audit. Every feature ties back to a real workflow.
        </p>
      </div>

      <div className="mt-20 space-y-24">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary-ink">
                {g.eyebrow}
              </div>
              <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight md:text-3xl">
                {g.title}
              </h2>
              <p className="mt-3 text-muted-foreground">{g.description}</p>
            </div>

            <div className="mt-10 grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
              {g.features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="h-full"
                >
                  <div className="flex h-full flex-col rounded-xl surface-white p-5 shadow-soft transition-all hover:shadow-premium">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                      <f.icon className="h-4 w-4" />
                    </div>
                    <h3 className="mt-4 font-semibold">{f.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-20 text-center">
        <Button size="lg" asChild>
          <Link to="/login">
            Try the demo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}