import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GrimoireRail } from '@/components/GrimoireRail'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('GrimoireRail', () => {
  it('shows starter prompts when empty', async () => {
    const user = userEvent.setup()
    let chosen = ''
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[]}
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={(p) => {
            chosen = p
          }}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    expect(screen.getByText(/library is empty/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /shortsword/i }))
    expect(chosen).toMatch(/shortsword/i)
  })

  it('shows instrumental starters in music mode', async () => {
    const user = userEvent.setup()
    let chosen = ''
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[]}
          query=""
          mode="music"
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={(p) => {
            chosen = p
          }}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /lute/i }))
    expect(chosen).toMatch(/TrackType: Music/i)
  })

  it('lists instruments on a music clip', () => {
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: Music, lute tavern theme',
              duration: 20,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'music',
              instruments: ['lute'],
            },
          ]}
          query=""
          mode="music"
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    expect(screen.getByLabelText('Instruments: lute')).toBeInTheDocument()
  })
})
