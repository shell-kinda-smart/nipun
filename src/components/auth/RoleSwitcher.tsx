import { useState } from 'react'
import {
  ChevronsUpDown,
  Check,
  LogOut,
  Shield,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAuthStore, useCurrentUser } from '@/store/auth'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/data'
import { initials } from '@/lib/format'
import { useApi } from '@/hooks/useApi'
import type { Role } from '@/data'

interface DemoAccount {
  id: string
  name: string
  email: string
  role: Role
  avatarSeed: string
}

/**
 * The account menu in the topbar.
 *
 * Switching role is a demo affordance: it asks the server to sign in as the
 * seeded account for that role. It is only offered while the backend runs in
 * demo mode — the endpoint does not exist otherwise.
 */
export function RoleSwitcher() {
  const switchRole = useAuthStore((s) => s.switchRole)
  const signOut = useAuthStore((s) => s.signOut)
  const demoMode = useAuthStore((s) => s.demoMode)
  const current = useCurrentUser()
  const [busy, setBusy] = useState(false)

  const { data: demoAccounts } = useApi<DemoAccount[]>(demoMode ? '/api/auth/demo-users' : null)

  if (!current) return null

  const onSwitch = async (role: Role) => {
    setBusy(true)
    try {
      await switchRole(role)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 px-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${current.avatarSeed}`} />
            <AvatarFallback>{initials(current.name)}</AvatarFallback>
          </Avatar>
          <div className="hidden text-left md:block">
            <div className="text-xs font-medium leading-tight">{current.name}</div>
            <div className="text-[10px] text-muted-foreground">{ROLE_LABELS[current.role]}</div>
          </div>
          <ChevronsUpDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Signed in as</span>
          <span className="font-medium text-foreground">{current.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">{current.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {demoAccounts && demoAccounts.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              Switch demo role
            </DropdownMenuLabel>
            {demoAccounts.map((account) => {
              const active = current.role === account.role
              return (
                <DropdownMenuItem
                  key={account.id}
                  disabled={busy}
                  onSelect={() => onSwitch(account.role)}
                  className="items-start gap-3"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${account.avatarSeed}`} />
                    <AvatarFallback>{initials(account.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{ROLE_LABELS[account.role]}</span>
                      {active && <Check className="h-3 w-3 text-success" />}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{account.name}</div>
                    <div className="text-[10px] text-muted-foreground/80">{ROLE_DESCRIPTIONS[account.role]}</div>
                  </div>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => signOut()} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
