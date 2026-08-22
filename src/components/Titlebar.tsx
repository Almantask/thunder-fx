import { Minus, Square, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isTauri } from '@/lib/utils'

type TitlebarProps = {
  engineLabel: string
  weaving: boolean
  onOpenKeep: () => void
}

export function Titlebar({ engineLabel, weaving, onOpenKeep }: TitlebarProps) {
  const native = isTauri()

  async function withWindow(action: 'minimize' | 'toggleMaximize' | 'close') {
    if (!native) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (action === 'minimize') await win.minimize()
    if (action === 'toggleMaximize') await win.toggleMaximize()
    if (action === 'close') await win.close()
  }

  return (
    <header className="titlebar-drag flex h-11 items-center justify-between border-b border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather px-3">
      <div className="flex items-center gap-3">
        <span className="font-display text-sm tracking-[0.2em] text-cream">THUNDER FX</span>
        <span className="text-xs text-muted">The Keep</span>
      </div>
      <div className="titlebar-no-drag flex items-center gap-2">
        <Badge className={weaving ? 'ember-pulse border-amber text-amber' : ''}>
          {weaving ? 'weaving' : engineLabel}
        </Badge>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenKeep}>
          Keep
        </Button>
        {native ? (
          <div className="ml-2 flex">
            <Button type="button" variant="ghost" size="icon" aria-label="Minimize window" onClick={() => void withWindow('minimize')}>
              <Minus />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Maximize window" onClick={() => void withWindow('toggleMaximize')}>
              <Square />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Close window" onClick={() => void withWindow('close')}>
              <X />
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
