import { Minus, Square, X } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { KeepTab, WeavePhase } from '@/lib/types'
import { isTauri } from '@/lib/utils'

type TitlebarProps = {
  engineLabel: string
  weaving: boolean
  loadingModel?: boolean
  weavePhase?: WeavePhase
  tab: KeepTab
  onTabChange: (tab: KeepTab) => void
}

export function Titlebar({
  engineLabel,
  weaving,
  loadingModel = false,
  weavePhase,
  tab,
  onTabChange,
}: TitlebarProps) {
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
      <div className="flex min-w-0 items-center gap-3">
        <Hint label="Thunder FX: a local studio for sound effects and instrumental music. Generates on this machine with Stable Audio 3 Medium.">
          <span className="font-display text-sm tracking-[0.2em] text-cream">THUNDER FX</span>
        </Hint>
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as KeepTab)}
          className="titlebar-no-drag"
        >
          <TabsList>
            <Hint asChild side="bottom" label="Saved sounds. Open a clip to load it in Generate.">
              <TabsTrigger value="library">Library</TabsTrigger>
            </Hint>
            <Hint
              asChild
              side="bottom"
              label={
                weaving
                  ? 'The model is generating. This tab is for generate, trim, and export.'
                  : loadingModel
                    ? 'The model is loading into VRAM. Generate starts after this finishes.'
                    : 'Generate, preview, trim, and export.'
              }
            >
              <TabsTrigger value="generate">Generate</TabsTrigger>
            </Hint>
            <Hint asChild side="bottom" label="Library folder, export folder, token, and the error log.">
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </Hint>
          </TabsList>
        </Tabs>
      </div>
      <div className="titlebar-no-drag flex items-center gap-2">
        <Hint
          side="bottom"
          label={
            loadingModel
              ? 'The model is loading into VRAM. This is not generating a clip.'
              : weaving
                ? weavePhase === 'writing'
                  ? 'Saving the WAV file.'
                  : 'Generating this clip. Eight steps, fp32, unchunked unless CUDA runs out of memory.'
                : engineLabel === 'model not loaded'
                  ? 'Medium is not in VRAM yet. Click Load model, then Generate.'
                  : engineLabel === 'mock' || engineLabel.includes('mock')
                    ? 'Mock engine: no CUDA Medium. The desktop app uses the real engine when the venv is installed.'
                    : `Engine device: ${engineLabel}. Ready to generate locally.`
          }
        >
          <Badge className={weaving || loadingModel ? 'ember-pulse border-amber text-amber' : ''}>
            {loadingModel ? 'loading model' : weaving ? 'generating' : engineLabel}
          </Badge>
        </Hint>
        {native ? (
          <div className="ml-2 flex">
            <Hint side="bottom" label="Minimize the window.">
              <Button type="button" variant="ghost" size="icon" aria-label="Minimize window" onClick={() => void withWindow('minimize')}>
                <Minus />
              </Button>
            </Hint>
            <Hint side="bottom" label="Maximize or restore the window.">
              <Button type="button" variant="ghost" size="icon" aria-label="Maximize window" onClick={() => void withWindow('toggleMaximize')}>
                <Square />
              </Button>
            </Hint>
            <Hint side="bottom" label="Close Thunder FX. An in-progress generation will stop.">
              <Button type="button" variant="ghost" size="icon" aria-label="Close window" onClick={() => void withWindow('close')}>
                <X />
              </Button>
            </Hint>
          </div>
        ) : null}
      </div>
    </header>
  )
}
