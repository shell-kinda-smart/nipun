import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { useCurrentUser } from '@/store/auth'
import { NAV_BY_ROLE } from '@/lib/nav'

export function Breadcrumbs() {
  const { pathname } = useLocation()
  const user = useCurrentUser()
  if (!user) return null

  const segments = pathname.split('/').filter(Boolean)
  const navItems = NAV_BY_ROLE[user.role].flatMap((g) => g.items)

  const crumbs: { label: string; to: string }[] = [{ label: 'Home', to: '/' }]
  let acc = ''
  for (const seg of segments) {
    acc += `/${seg}`
    const match = navItems.find((i) => i.to === acc)
    crumbs.push(match ? { label: match.label, to: match.to } : { label: seg, to: acc })
  }

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link to="/" className="flex items-center gap-1 hover:text-foreground" aria-label="Home">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.slice(1).map((c, i) => {
        const isLast = i === crumbs.length - 2
        return (
          <span key={c.to} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 opacity-60" />
            {isLast ? (
              <span className="font-medium text-foreground">{c.label}</span>
            ) : (
              <Link to={c.to} className="hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}