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
})
