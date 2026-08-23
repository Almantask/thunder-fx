import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IncantationConsole } from '@/components/IncantationConsole'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CatalogEffect } from '@/lib/promptCatalog'

const props = {
  mode: 'sfx' as const,
  duration: 8,
  cfg: 1,
  negative: '',
  seed: '-1',
  ritesOpen: false,
  weaving: false,
  onMode: vi.fn(),
  onPrompt: vi.fn(),
  onDuration: vi.fn(),
  onCfg: vi.fn(),
  onNegative: vi.fn(),
  onSeed: vi.fn(),
  onRitesOpen: vi.fn(),
  onChip: vi.fn(),
  onCast: vi.fn(),
  onDispel: vi.fn(),
  onLoadModel: vi.fn(),
  onOpenCatalog: vi.fn(),
  onGenerateQueue: vi.fn(),
  onClearQueue: vi.fn(),
  onRemoveQueued: vi.fn(),
}

const queued: CatalogEffect[] = [
  {
    id: 'ui:soft-button-click',
    categoryId: 'ui',
    category: 'UI',
    title: 'Soft button click',
    prompt: 'TrackType: SFX, short UI button click',
    duration: 0.5,
    negative: 'music, speech, singing',
  },
]

describe('IncantationConsole', () => {
  it('does not allow Generate on a short prompt', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="ab" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /generate sound/i })).toBeDisabled()
  })

  it('allows Generate when the prompt is long enough', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="tavern door" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /generate sound/i })).toBeEnabled()
  })

  it('offers Sound effects and Instrumental modes', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('radio', { name: /sound effects/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: /instrumental/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('button', { name: 'TrackType: SFX' })).toBeInTheDocument()
  })

  it('switches chips and generate label in instrumental mode', async () => {
    const user = userEvent.setup()
    const onMode = vi.fn()
    render(
      <TooltipProvider>
        <IncantationConsole {...props} mode="music" prompt="lute" onMode={onMode} />
      </TooltipProvider>,
    )
    expect(screen.getByRole('radio', { name: /instrumental/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('button', { name: /generate music/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'TrackType: Music' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'TrackType: SFX' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /sound effects/i }))
    expect(onMode).toHaveBeenCalledWith('sfx')
  })

  it('shows Model ready beside Generate when the model is loaded', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="tavern door" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /model ready/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /generate sound/i })).toBeEnabled()
  })

  it('does not allow Generate until the model is loaded', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} modelLoaded={false} prompt="tavern door" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /generate sound/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^load model$/i })).toBeEnabled()
  })

  it('calls onLoadModel from Load model', async () => {
    const user = userEvent.setup()
    const onLoadModel = vi.fn()
    render(
      <TooltipProvider>
        <IncantationConsole
          {...props}
          modelLoaded={false}
          prompt="tavern door"
          onLoadModel={onLoadModel}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /^load model$/i }))
    expect(onLoadModel).toHaveBeenCalled()
  })

  it('opens the prompt catalog from Generate', async () => {
    const user = userEvent.setup()
    const onOpenCatalog = vi.fn()
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="" onOpenCatalog={onOpenCatalog} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /prompt catalog/i }))
    expect(onOpenCatalog).toHaveBeenCalled()
  })

  it('does not allow Generate queue when the queue is empty', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="tavern door" queue={[]} />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /generate queue/i })).toBeDisabled()
  })

  it('lists queued effects and can generate them', async () => {
    const user = userEvent.setup()
    const onGenerateQueue = vi.fn()
    const onRemoveQueued = vi.fn()
    render(
      <TooltipProvider>
        <IncantationConsole
          {...props}
          prompt=""
          queue={queued}
          onGenerateQueue={onGenerateQueue}
          onRemoveQueued={onRemoveQueued}
        />
      </TooltipProvider>,
    )
    expect(screen.getByText(/soft button click/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate queue/i })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /remove soft button click/i }))
    expect(onRemoveQueued).toHaveBeenCalledWith('ui:soft-button-click')
    await user.click(screen.getByRole('button', { name: /generate queue/i }))
    expect(onGenerateQueue).toHaveBeenCalled()
  })

  it('shows Loading model while weights go into VRAM', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} loadingModel prompt="tavern door" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /loading model/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /generate sound/i })).toBeDisabled()
  })

  it('lets Duration use the Medium model limit', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="tavern door" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '380')
  })
})
