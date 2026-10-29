import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MOBILE_NAV_BY_ROLE } from '@/lib/nav'
import { useCurrentUser } from '@/store/auth'
import { cn } from '@/lib/utils'
import { useSummary } from '@/store/summary'

export function MobileNav() {
  const user = useCurrentUser()
  const summary = useSummary()
  const { pathname } = useLocation()
  if (!user) return null
  const items = MOBILE_NAV_BY_ROLE[user.role]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md lg:hidden">
      <ul className="grid grid-cols-4 px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
          const isAlerts = item.label === 'Alerts'
          const badge = isAlerts ? summary.unreadNotifications + summary.openAnomalies : null
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-primary-ink' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-active"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">
                  <item.icon className="h-5 w-5" />
                  {badge && badge > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}