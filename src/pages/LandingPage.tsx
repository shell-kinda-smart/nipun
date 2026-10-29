import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart3, Shield, Sparkles, ArrowRight, Check, Building2, Receipt,
  Users2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageMeta } from '@/lib/usePageMeta'

const features = [
  { icon: BarChart3, title: 'Workforce analytics', body: 'Real-time headcount, payroll trends, and department distribution in one unified view.' },
  { icon: Shield, title: 'Role-based access', body: 'Admin, HR, Finance and Employee. Each with its own sidebar, permissions, and views.' },
  { icon: Sparkles, title: 'Forecasting and anomaly detection', body: 'Predict next month payroll and auto-flag unusual salary spikes, duplicate payments, overtime.' },
  { icon: Receipt, title: 'Payroll processing wizard', body: 'Six guided steps: select month, review employees, calculate, validate, approve.' },
  { icon: Building2, title: 'Department cost insights', body: 'See exactly where payroll spend lands across teams, with growth trends and headcount ratios.' },
  { icon: Users2, title: 'Employee 360 profile', body: 'Overview, payroll, attendance calendar, taxes, and documents on one scrollable profile page.' },
]

const STAT_VALUES = [
  { label: 'Roles supported', value: '4' },
  { label: 'Payroll phases', value: '6' },
  { label: 'Anomaly types tracked', value: '8' },
  { label: 'Months of demo data', value: '6' },
]

const CHECKS = ['No signup', '4 demo roles', 'Keyboard-first', 'Dark by default']

export function LandingPage() {
  usePageMeta(
    'PayLens · Payroll analytics, refined.',
    'Role-based dashboards, payroll processing wizard, anomaly detection and forecasting for HR and Finance teams.',
  )

  return (
    <div className="relative">
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 text-center md:pt-28 md:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-brand-soft px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-primary-ink backdrop-blur"
        >
          <Sparkles className="h-3.5 w-3.5" />
          V2 · Now with predictive forecasting
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mx-auto mt-8 max-w-4xl text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl"
        >
          Payroll analytics,{' '}
          <span className="text-primary-ink">refined.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground"
        >
          Forecasting, anomaly detection, role-based dashboards and a 6-step payroll processing wizard.
          Built for teams that take compensation seriously.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Button size="lg" asChild>
            <Link to="/login">
              Try the demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/features">
              See all features
            </Link>
          </Button>
        </motion.div>

        <p className="mt-4 text-xs text-muted-foreground">
          One-click sign-in. 4 demo roles. No signup required.
        </p>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
          {STAT_VALUES.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.05 }}
              className="surface-white rounded-xl p-4 shadow-soft"
            >
              <div className="font-mono text-2xl font-bold tracking-tight md:text-3xl">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="default" className="mb-3">Platform</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
            Everything payroll needs. Nothing it doesn't.
          </h2>
          <p className="mt-3 text-muted-foreground">
            One platform for processing, forecasting, compliance and analytics. No sprawl.
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="h-full"
            >
              <div className="group surface-white flex h-full flex-col rounded-xl p-5 shadow-soft transition-all hover:shadow-premium">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-ink transition-transform group-hover:scale-110">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-5xl px-6 py-20 text-center">
        <div className="glass-strong shadow-premium rounded-3xl p-10 md:p-14">
          <Badge variant="default" className="mx-auto mb-4 w-fit">Ready to start</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight md:text-5xl">
            See your payroll story, clearly.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Click below to drop into the demo. Use the role switcher in the topbar to preview each
            dashboard for admin, HR, finance and employee.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/login">
                Launch demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">View pricing</Link>
            </Button>
          </div>
          <ul className="mx-auto mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {CHECKS.map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-success" /> {c}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}