import { useEffect, useState } from 'react'
import { Search, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RoleSwitcher } from '@/components/auth/RoleSwitcher'
import { NotificationsPopover } from './NotificationsPopover'
import { useCommandPalette } from '@/store/command'

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const openPalette = useCommandPalette((s) => s.toggle)
  const [shortcut, setShortcut] = useState('Ctrl+K')

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut('⌘K')
  }, [])

  return (
    <header className="glass-strong sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 px-4 backdrop-blur-md md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <button
        onClick={() => openPalette()}
        className="flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-soft transition-colors hover:bg-accent/40 hover:text-foreground md:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 text-left md:block">Search anything…</span>
        <span className="flex-1 text-left md:hidden">Search</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline-flex">
          {shortcut}
        </kbd>
      </button>

      <div className="flex items-center gap-1 md:gap-2">
        <NotificationsPopover />
        <RoleSwitcher />
      </div>
    </header>
  )
}