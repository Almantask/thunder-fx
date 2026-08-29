import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '@/components/CommandPalette'
import { TooltipProvider } from '@/components/ui/tooltip'

const props = {
  open: true,
  onOpenChange: vi.fn(),
  onCast: vi.fn(),
  onExportWav: vi.fn(),
  onExportOgg: vi.fn(),
  onFocusPrompt: vi.fn(),
  onOpenLogs: vi.fn(),
  onOpenLibrary: vi.fn(),
  onOpenGenerate: vi.fn(),
  onOpenSettings: vi.fn(),
}

describe('CommandPalette', () => {
  it('offers Error log in the command menu', async () => {
    const user = userEvent.setup()
    const onOpenLogs = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette {...props} onOpenLogs={onOpenLogs} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /error log/i }))
    expect(onOpenLogs).toHaveBeenCalled()
  })

  it('offers Settings in the command menu', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette {...props} onOpenSettings={onOpenSettings} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /^settings$/i }))
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('offers Library and Generate tab commands', async () => {
    const user = userEvent.setup()
    const onOpenLibrary = vi.fn()
    const onOpenGenerate = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette
          {...props}
          onOpenLibrary={onOpenLibrary}
          onOpenGenerate={onOpenGenerate}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /^library$/i }))
    expect(onOpenLibrary).toHaveBeenCalled()
    await user.click(screen.getByRole('option', { name: /^generate$/i }))
    expect(onOpenGenerate).toHaveBeenCalled()
  })

  it('offers Load model', async () => {
    const user = userEvent.setup()
    const onLoadModel = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette {...props} onLoadModel={onLoadModel} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /load model/i }))
    expect(onLoadModel).toHaveBeenCalled()
  })

  it('offers Ambience mode', async () => {
    const user = userEvent.setup()
    const onAmbience = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette {...props} onAmbience={onAmbience} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /ambience mode/i }))
    expect(onAmbience).toHaveBeenCalled()
  })

  it('offers Instrumental mode', async () => {
    const user = userEvent.setup()
    const onInstrumental = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette {...props} onInstrumental={onInstrumental} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /instrumental/i }))
    expect(onInstrumental).toHaveBeenCalled()
  })

  it('offers Browse prompts', async () => {
    const user = userEvent.setup()
    const onPromptCatalog = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette {...props} onPromptCatalog={onPromptCatalog} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /browse prompts/i }))
    expect(onPromptCatalog).toHaveBeenCalled()
  })

  it('offers Unload model', async () => {
    const user = userEvent.setup()
    const onUnloadModel = vi.fn()
    render(
      <TooltipProvider>
        <CommandPalette {...props} onUnloadModel={onUnloadModel} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('option', { name: /unload model/i }))
    expect(onUnloadModel).toHaveBeenCalled()
  })
})
