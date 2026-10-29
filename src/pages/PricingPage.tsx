import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ArrowRight, Sparkles, Building2, Rocket, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { usePageMeta } from '@/lib/usePageMeta'

interface Tier {
  id: string
  name: string
  icon: typeof Building2
  blurb: string
  monthly: number
  yearly: number
  features: string[]
  cta: string
  highlight?: boolean
}

const TIERS: Tier[] = [
  {
    id: 'starter',
    name: 'Starter',
    icon: Briefcase,
    blurb: 'For small teams getting payroll on rails.',
    monthly: 19,
    yearly: 15,
    features: [
      'Up to 25 employees',
      'Payroll processing wizard',
      'Payslip designer + PDF',
      'Email support',
      '1 role (Admin)',
    ],
    cta: 'Start free',
  },
  {
    id: 'growth',
    name: 'Growth',
    icon: Building2,
    blurb: 'For growing companies that need real analytics.',
    monthly: 49,
    yearly: 39,
    features: [
      'Up to 250 employees',
      'All 4 roles (Admin / HR / Finance / Employee)',
      'Forecasting + anomaly detection',
      'Reports center · PDF / CSV / Excel',
      'Audit log + multi-session',
      'Priority support',
    ],
    cta: 'Try the demo',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    icon: Rocket,
    blurb: 'For multi-entity operations and compliance.',
    monthly: 0,
    yearly: 0,
    features: [
      'Unlimited employees',
      'Multi-entity + multi-currency',
      'Custom approval chains',
      'SSO + SCIM provisioning',
      'Dedicated success manager',
      'On-prem option',
    ],
    cta: 'Contact sales',
  },
]

export function PricingPage() {
  usePageMeta('Pricing · PayLens', 'Simple, transparent pricing for teams of every size.')
  const [yearly, setYearly] = useState(true)

  return (
    <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-20">
      <div className="text-center">
        <Badge variant="default" className="mb-3">Pricing</Badge>
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          No hidden fees. No per-feature gates. Pay for what you scale.
        </p>

        {/* Toggle */}
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 p-1">
          <button
            onClick={() => setYearly(false)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              !yearly ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setYearly(true)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              yearly ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Yearly
            <Badge variant="success" className="ml-2 text-[10px]">-20%</Badge>
          </button>
        </div>
      </div>

      <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
        {TIERS.map((tier, i) => (
          <motion.div
            key={tier.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="flex h-full flex-col"
          >
            <Card
              className={cn(
                'relative flex h-full flex-col overflow-visible p-6 transition-all surface-white shadow-soft hover:shadow-premium',
                tier.highlight
                  ? 'border-primary/40 text-card-foreground shadow-premium'
                  : 'bg-card/40',
              )}
              style={
                tier.highlight
                  ? {
                      background:
                        'linear-gradient(135deg, hsl(268 60% 48% / 0.10), hsl(290 70% 92% / 0.12))',
                    }
                  : undefined
              }
            >
              {tier.highlight && (
                <Badge
                  variant="default"
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 border-0 bg-brand text-white shadow-premium"
                >
                  <Sparkles className="h-3 w-3" /> Most popular
                </Badge>
              )}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    tier.highlight ? 'bg-primary/20 text-primary-ink' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <tier.icon className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-bold">{tier.name}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{tier.blurb}</p>

              <div className="mt-6">
                {tier.monthly === 0 ? (
                  <div className="font-mono text-3xl font-bold tracking-tight">Custom</div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-4xl font-bold tracking-tight">
                      ₹{yearly ? tier.yearly : tier.monthly}
                    </span>
                    <span className="text-sm text-muted-foreground">/employee/mo</span>
                  </div>
                )}
                {tier.monthly !== 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {yearly ? 'billed annually' : 'billed monthly'}
                  </p>
                )}
              </div>

              <ul className="mt-6 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-auto w-full pt-6"
                variant={tier.highlight ? 'default' : 'outline'}
                asChild
              >
                <Link to="/login">
                  {tier.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 text-center text-xs text-muted-foreground">
        All plans include unlimited payslips, audit log retention, and SOC2 / GDPR compliance.
      </div>
    </div>
  )
}