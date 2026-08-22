import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IncantationConsole } from '@/components/IncantationConsole'
import { TooltipProvider } from '@/components/ui/tooltip'

const props = {
  duration: 8,
  cfg: 1,
  negative: '',
  seed: '-1',
  ritesOpen: false,
  weaving: false,
  onPrompt: vi.fn(),
  onDuration: vi.fn(),
  onCfg: vi.fn(),
  onNegative: vi.fn(),
  onSeed: vi.fn(),
  onRitesOpen: vi.fn(),
  onChip: vi.fn(),
  onCast: vi.fn(),
  onDispel: vi.fn(),
}

describe('IncantationConsole', () => {
  it('does not allow Cast on a short incantation', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="ab" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /cast, generate sound/i })).toBeDisabled()
  })

  it('allows Cast when the incantation is long enough', () => {
    render(
      <TooltipProvider>
        <IncantationConsole {...props} prompt="tavern door" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /cast, generate sound/i })).toBeEnabled()
  })
})
