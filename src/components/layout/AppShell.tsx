import { useState } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileNav } from './MobileNav'
import { CommandPalette } from '@/components/command/CommandPalette'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useCurrentUser } from '@/store/auth'
import { useSummary } from '@/store/summary'
import { NAV_BY_ROLE } from '@/lib/nav'
import { BrandLockup } from '@/components/shared/Brand'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = useCurrentUser()
  const summary = useSummary()
  const { pathname } = useLocation()
  if (!user) return null
  const groups = NAV_BY_ROLE[user.role]

  return (
    <div className="relative flex min-h-screen">
      <Sidebar />

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Primary navigation for {user.role} role</SheetDescription>
          <div className="flex h-14 items-center gap-2 border-b border-border px-5">
            <Link to="/" className="flex items-center gap-2" aria-label="PayLens home">
              <BrandLockup size="sm" />
            </Link>
          </div>
          <ScrollArea className="h-[calc(100vh-3.5rem)]">
            <nav className="space-y-5 px-3 py-4">
              {groups.map((group, gi) => (
                <div key={gi}>
                  {group.title && (
                    <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {group.title}
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
                            )
                          }
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.label}</span>
                          {item.badge === 'notifications' && summary.unreadNotifications > 0 && (
                            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                              {summary.unreadNotifications}
                            </Badge>
                          )}
                          {item.badge === 'anomalies' && summary.openAnomalies > 0 && (
                            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                              {summary.openAnomalies}
                            </Badge>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </ScrollArea>
          <Separator />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 hidden md:block">
              <Breadcrumbs />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <MobileNav />
      </div>

      {/* Global ⌘K command palette */}
      <CommandPalette />
    </div>
  )
}