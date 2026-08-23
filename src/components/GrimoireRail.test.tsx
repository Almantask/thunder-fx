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

  it('lists instruments on a music clip', async () => {
    const user = userEvent.setup()
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
    expect(screen.getByRole('button', { name: /main theme/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /main theme/i }))
    const levelBtn = screen.getByRole('button', { name: /level/i })
    expect(levelBtn).toBeInTheDocument()
    await user.click(levelBtn)
    expect(screen.getByLabelText('Instruments: lute')).toBeInTheDocument()
    expect(screen.queryByLabelText('Music clip')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Sound effect clip')).not.toBeInTheDocument()
  })

  it('limits instrument tags to top 3 and displays BPM if present', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt:
                'TrackType: Music, epic fantasy theme, French horn melody, cello swells, harp arpeggios, taiko drums, 110 BPM',
              duration: 20,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'music',
              instruments: ['french horn', 'cello', 'harp', 'taiko'],
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
    await user.click(screen.getByRole('button', { name: /main theme/i }))
    const levelBtn = screen.getByRole('button', { name: /level/i })
    await user.click(levelBtn)
    expect(screen.getByLabelText('Instruments: french horn, cello, harp')).toBeInTheDocument()
    expect(screen.getByText(/110 BPM/)).toBeInTheDocument()
    expect(screen.queryByText(/taiko/)).not.toBeInTheDocument()
  })

  it('lists a prompt name instead of the full prompt', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt:
                'TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay',
              duration: 1.5,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
            },
          ]}
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /combat/i }))
    expect(screen.getByText('Steel shortsword leaving a leather scabbard')).toBeInTheDocument()
    expect(screen.queryByText(/TrackType: SFX/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/close mic, dry studio/i)).not.toBeInTheDocument()
  })

  it('disables the Play visible sounds button when empty', () => {
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: Music, tavern flute',
              duration: 10,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'music',
            },
          ]}
          mode="sfx"
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /play visible sounds/i })).toBeDisabled()
  })

  it('allows playing and pausing visible sounds', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, tavern door',
              duration: 1.5,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
            },
            {
              id: '2',
              prompt: 'TrackType: SFX, sword swing',
              duration: 1.0,
              seed: 2,
              createdAt: new Date().toISOString(),
              cfg: 2,
              negative: '',
            },
          ]}
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    const playVisibleBtn = screen.getByRole('button', { name: /play visible sounds/i })
    expect(playVisibleBtn).not.toBeDisabled()

    // Click Play visible sounds
    await user.click(playVisibleBtn)
    expect(screen.getByRole('button', { name: /pause visible sounds/i })).toBeInTheDocument()

    // Click Pause visible sounds
    await user.click(screen.getByRole('button', { name: /pause visible sounds/i }))
    expect(screen.getByRole('button', { name: /play visible sounds/i })).toBeInTheDocument()
  })

  it('allows playing and pausing an individual clip', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, oak interior door',
              duration: 1.5,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
            },
          ]}
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    // Category is collapsed by default
    expect(screen.queryByRole('button', { name: 'Play sound' })).not.toBeInTheDocument()

    // Expand category
    await user.click(screen.getByRole('button', { name: /doors/i }))
    const clipPlayBtn = screen.getByRole('button', { name: 'Play sound' })
    await user.click(clipPlayBtn)
    expect(screen.getByRole('button', { name: 'Pause sound' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause visible sounds/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause sound' }))
    expect(screen.getByRole('button', { name: 'Play sound' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play visible sounds/i })).toBeInTheDocument()
  })

  it('collapses categories by default and toggles expand/collapse on click', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, oak interior door',
              duration: 2,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
            },
            {
              id: '2',
              prompt: 'TrackType: SFX, steel sword draw',
              duration: 1.5,
              seed: 2,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
            },
          ]}
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    const doorsCategoryBtn = screen.getByRole('button', { name: /doors/i })
    const combatCategoryBtn = screen.getByRole('button', { name: /combat/i })
    expect(doorsCategoryBtn).toHaveAttribute('aria-expanded', 'false')
    expect(combatCategoryBtn).toHaveAttribute('aria-expanded', 'false')

    // Click Doors to expand
    await user.click(doorsCategoryBtn)
    expect(doorsCategoryBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Oak interior door')).toBeInTheDocument()
    expect(combatCategoryBtn).toHaveAttribute('aria-expanded', 'false')

    // Click Doors again to collapse
    await user.click(doorsCategoryBtn)
    expect(doorsCategoryBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches between Sounds and Ambiences browsing modes', async () => {
    const user = userEvent.setup()
    let modeState = 'sfx'
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, oak interior door',
              duration: 2,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'sfx',
            },
            {
              id: '2',
              prompt: 'TrackType: Music, peaceful forest lute',
              duration: 20,
              seed: 2,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'music',
            },
          ]}
          mode="sfx"
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
          onModeChange={(m) => {
            modeState = m
          }}
        />
      </TooltipProvider>,
    )
    const soundsRadio = screen.getByRole('radio', { name: /sounds/i })
    const ambiencesRadio = screen.getByRole('radio', { name: /ambiences/i })
    expect(soundsRadio).toHaveAttribute('aria-checked', 'true')
    expect(ambiencesRadio).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /doors/i })).toBeInTheDocument()

    // Switch to Ambiences mode
    await user.click(ambiencesRadio)
    expect(modeState).toBe('music')
    expect(ambiencesRadio).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /forest/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /doors/i })).not.toBeInTheDocument()
  })

  it('auto-expands matching categories when searching', async () => {
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, oak interior door',
              duration: 2,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
            },
          ]}
          query="door"
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: /doors/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Oak interior door')).toBeInTheDocument()
  })

  it('organizes ambiences into expandable category and intensity levels', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: Music, ancient ruins ambient (I), looping-friendly, steady texture with no ending',
              duration: 90,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'music',
            },
            {
              id: '2',
              prompt: 'TrackType: Music, ancient discovery theme (II), orchestral',
              duration: 60,
              seed: 2,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'music',
            },
            {
              id: '3',
              prompt: 'TrackType: Music, epic temple orchestral (III), colossal',
              duration: 45,
              seed: 3,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'music',
            },
          ]}
          mode="music"
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )

    // Category accordion exists and is collapsed by default
    const catBtn = screen.getByRole('button', { name: /ancient discovery/i })
    expect(catBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /level i/i })).not.toBeInTheDocument()

    // Expand category -> intensity level accordions appear
    await user.click(catBtn)
    expect(catBtn).toHaveAttribute('aria-expanded', 'true')
    const level1Btn = screen.getByRole('button', { name: /level i —/i })
    const level2Btn = screen.getByRole('button', { name: /level ii —/i })
    const level3Btn = screen.getByRole('button', { name: /level iii —/i })
    expect(level1Btn).toHaveAttribute('aria-expanded', 'false')
    expect(level2Btn).toHaveAttribute('aria-expanded', 'false')
    expect(level3Btn).toHaveAttribute('aria-expanded', 'false')

    // Track cards are not visible yet
    expect(screen.queryByText(/Ancient ruins ambient/i)).not.toBeInTheDocument()

    // Expand Level I -> Level I track appears
    await user.click(level1Btn)
    expect(level1Btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Ancient ruins ambient/i)).toBeInTheDocument()
    expect(screen.queryByText(/Ancient discovery theme/i)).not.toBeInTheDocument()

    // Expand Level II -> Level II track appears
    await user.click(level2Btn)
    expect(level2Btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Ancient discovery theme/i)).toBeInTheDocument()
  })
})
