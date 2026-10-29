import { NavLink, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronsUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BrandLockup } from '@/components/shared/Brand'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useCurrentUser } from '@/store/auth'
import { useSummary } from '@/store/summary'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/data'
import { NAV_BY_ROLE } from '@/lib/nav'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const user = useCurrentUser()
  const summary = useSummary()
  if (!user) return null
  const groups = NAV_BY_ROLE[user.role]

  const liveBadge = (kind: 'notifications' | 'anomalies') =>
    kind === 'notifications' ? summary.unreadNotifications : summary.openAnomalies

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
        <Link to="/" className="flex items-center gap-2" aria-label="PayLens home">
          <BrandLockup size="sm" inverse />
        </Link>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-5">
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">
                  {group.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-foreground'
                            : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span
                              layoutId="sidebar-active"
                              className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            />
                          )}
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && liveBadge(item.badge) > 0 && (
                            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                              {liveBadge(item.badge)}
                            </Badge>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />
      {/* Role card */}
      <div className="px-3 py-3">
        <button className="flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-left transition-colors hover:bg-sidebar-accent">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-indigo-400 to-indigo-600 text-white">
            <span className="text-xs font-semibold">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-sidebar-foreground">{user.name}</div>
            <div className="truncate text-[10px] text-sidebar-muted">{ROLE_LABELS[user.role]}</div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 text-sidebar-muted" />
        </button>
        <p className="mt-2 px-1 text-[10px] leading-relaxed text-sidebar-muted/80">
          {ROLE_DESCRIPTIONS[user.role]}
        </p>
      </div>
    </aside>
  )
}