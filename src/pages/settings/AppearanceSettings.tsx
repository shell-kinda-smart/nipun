import { useEffect, useState } from 'react'
import { Palette } from 'lucide-react'
import { toast } from 'sonner'
import { usePageMeta } from '@/lib/usePageMeta'
import {
  applyTheme,
  getStoredTheme,
  setTheme,
  watchSystemTheme,
  type Theme,
} from '@/lib/theme'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function AppearanceSettings() {
  usePageMeta('Appearance · PayLens', 'Choose how PayLens looks.')
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const stored = getStoredTheme()
    setThemeState(stored)
    applyTheme(stored)

    // While the mode is 'system', keep following the OS as it changes.
    return watchSystemTheme(() => {
      if (getStoredTheme() === 'system') applyTheme('system')
    })
  }, [])

  const changeTheme = (t: Theme) => {
    setThemeState(t)
    setTheme(t)
    toast.success(t === 'system' ? 'Following system theme' : `Switched to ${t} mode`)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary-ink" />
          <CardTitle>Appearance</CardTitle>
        </div>
        <CardDescription>Choose how PayLens looks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <ThemeTile
            label="Light"
            desc="Classic clean"
            active={theme === 'light'}
            onClick={() => changeTheme('light')}
            preview="bg-white border-border"
          />
          <ThemeTile
            label="Dark"
            desc="Easier on the eyes"
            active={theme === 'dark'}
            onClick={() => changeTheme('dark')}
            preview="bg-[#060E1F] border-[#1F2D47]"
          />
          <ThemeTile
            label="System"
            desc="Match your device"
            active={theme === 'system'}
            onClick={() => changeTheme('system')}
            preview="bg-gradient-to-br from-white to-[#060E1F] border-border"
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-sm font-medium">Brand</div>
          <p className="text-xs text-muted-foreground">
            PayLens ships with deep navy and gold as the brand identity. Custom accent
            palettes are available on the Enterprise plan.
          </p>
          <div className="flex gap-2">
            {[
              { name: 'Navy', swatch: 'bg-[#132C5C]' },
              { name: 'Gold', swatch: 'bg-[#C9A54E]', active: true },
              { name: 'Soft gold', swatch: 'bg-[#F7EFDC]' },
              { name: 'Azure', swatch: 'bg-[#2E7EB8]' },
              { name: 'Slate', swatch: 'bg-[#5A6272]' },
            ].map((c) => (
              <button
                key={c.name}
                onClick={() => toast.info(`${c.name} accent ships with Enterprise`)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                  c.active ? 'border-foreground scale-110' : 'border-transparent opacity-70 hover:opacity-100',
                )}
                title={c.name}
              >
                <span className={cn('h-6 w-6 rounded-full', c.swatch)} />
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ThemeTile({
  label, desc, active, onClick, preview,
}: { label: string; desc: string; active: boolean; onClick: () => void; preview: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group rounded-lg border-2 p-3 text-left transition-all',
        active ? 'border-primary shadow-glow' : 'border-border hover:border-primary/40',
      )}
    >
      <div className={cn('h-16 w-full rounded-md border', preview)}>
        <div className="m-2 h-2 w-1/2 rounded bg-current opacity-20" />
        <div className="mx-2 h-1.5 w-3/4 rounded bg-current opacity-10" />
      </div>
      <div className="mt-3 font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  )
}
