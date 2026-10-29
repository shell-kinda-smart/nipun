import { NavLink, Outlet } from 'react-router-dom'
import {
  User as UserIcon, MonitorSmartphone, Palette, Bell, Shield, CreditCard,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface SubNavItem {
  to: string
  label: string
  icon: LucideIcon
}

const SUB_NAV: SubNavItem[] = [
  { to: '/settings/profile', label: 'Profile', icon: UserIcon },
  { to: '/settings/sessions', label: 'Sessions', icon: MonitorSmartphone },
  { to: '/settings/appearance', label: 'Appearance', icon: Palette },
  { to: '/settings/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings/security', label: 'Security', icon: Shield },
  { to: '/settings/billing', label: 'Billing', icon: CreditCard },
]

export function SettingsLayout() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Settings"
        description="Manage your profile, sessions, appearance and security."
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <Card className="p-2 lg:sticky lg:top-20 lg:h-fit">
          <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
            {SUB_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </Card>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}