/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TakesGrid } from '@/components/TakesGrid'
import { TooltipProvider } from '@/components/ui/tooltip'
import { generateMockSfxWav } from '@/lib/wav'
import type { Clip } from '@/lib/types'

function clip(id: string, seed: number): Clip {
  return {
    id,
    prompt: 'TrackType: SFX, steel sword',
    duration: 1,
    seed,
    createdAt: new Date().toISOString(),
    cfg: 4,
    negative: '',
    mode: 'sfx',
  }
}

describe('TakesGrid', () => {
  it('plays one take and keeps selected clips', async () => {
    const user = userEvent.setup()
    const onKeep = vi.fn()
    const onDiscard = vi.fn()
    const wav = generateMockSfxWav(1, 3)
    render(
      <TooltipProvider>
        <TakesGrid
          open
          takes={[
            { clip: clip('a', 11), wav },
            { clip: clip('b', 12), wav },
            { clip: clip('c', 13), wav },
            { clip: clip('d', 14), wav },
          ]}
          onOpenChange={vi.fn()}
          onKeep={onKeep}
          onDiscard={onDiscard}
        />
      </TooltipProvider>,
    )
    expect(screen.getByRole('list', { name: /generation takes/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /keep/i }).length).toBeGreaterThanOrEqual(4)
    await user.click(screen.getByRole('button', { name: /play take 2/i }))
    await user.click(screen.getAllByRole('button', { name: /^keep$/i })[1]!)
    await user.click(screen.getByRole('button', { name: /keep selected/i }))
    expect(onKeep).toHaveBeenCalledWith(['b'])
  })
})
