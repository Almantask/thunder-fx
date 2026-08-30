import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GrimoireRail } from '@/components/GrimoireRail'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Clip } from '@/lib/types'

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

  it('shows ambience starters in ambience mode', async () => {
    const user = userEvent.setup()
    let chosen = ''
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[]}
          query=""
          mode="ambience"
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={(p) => {
            chosen = p
          }}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /forest birdsong/i }))
    expect(chosen).toMatch(/TrackType: SFX/i)
    expect(chosen).toMatch(/steady bed/i)
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

  it('shows the seed used to generate each clip', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, steel shortsword leaving a leather scabbard',
              duration: 1.5,
              seed: 837462951,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'sfx',
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
    await user.click(screen.getByRole('button', { name: /sword/i }))
    expect(screen.getByText(/seed 837462951/i)).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /sword/i }))
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

    // Expand category -> subcategory appears
    await user.click(screen.getByRole('button', { name: /doors/i }))
    // Expand subcategory -> track play button appears
    await user.click(screen.getByRole('button', { name: /wood/i }))
    const clipPlayBtn = screen.getByRole('button', { name: 'Play sound' })
    await user.click(clipPlayBtn)
    expect(screen.getByRole('button', { name: 'Pause sound' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause visible sounds/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause sound' }))
    expect(screen.getByRole('button', { name: 'Play sound' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play visible sounds/i })).toBeInTheDocument()
  })

  it('allows playing multiple FX sounds simultaneously without stopping previously started ones', async () => {
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
            {
              id: '2',
              prompt: 'TrackType: SFX, steel shortsword',
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

    // Expand Doors category and Wood subcategory
    await user.click(screen.getByRole('button', { name: /doors/i }))
    await user.click(screen.getByRole('button', { name: /wood/i }))

    // Expand Combat category and Sword subcategory
    await user.click(screen.getByRole('button', { name: /combat/i }))
    await user.click(screen.getByRole('button', { name: /sword/i }))

    const playButtons = screen.getAllByRole('button', { name: 'Play sound' })
    expect(playButtons).toHaveLength(2)

    // Click play on first FX sound
    await user.click(playButtons[0]!)
    expect(screen.getAllByRole('button', { name: 'Pause sound' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Play sound' })).toHaveLength(1)

    // Click play on second FX sound without first one stopping
    const remainingPlayBtn = screen.getByRole('button', { name: 'Play sound' })
    await user.click(remainingPlayBtn)

    // Both FX sounds are now playing concurrently!
    const pauseButtons = screen.getAllByRole('button', { name: 'Pause sound' })
    expect(pauseButtons).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Play sound' })).not.toBeInTheDocument()

    // Pausing one leaves the other playing
    await user.click(pauseButtons[0]!)
    expect(screen.getAllByRole('button', { name: 'Pause sound' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Play sound' })).toHaveLength(1)
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
    expect(screen.getByRole('button', { name: /wood/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /wood/i }))
    expect(screen.getByText('Oak interior door')).toBeInTheDocument()
    expect(combatCategoryBtn).toHaveAttribute('aria-expanded', 'false')

    // Click Doors again to collapse
    await user.click(doorsCategoryBtn)
    expect(doorsCategoryBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches between Sounds, Ambience, and Instrumental browsing modes', async () => {
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
            {
              id: '3',
              prompt: 'TrackType: SFX, heavy rain, steady bed',
              duration: 30,
              seed: 3,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'ambience',
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
    const ambienceRadio = screen.getByRole('radio', { name: /^ambience/i })
    const instrumentalRadio = screen.getByRole('radio', { name: /instrumental/i })
    expect(soundsRadio).toHaveAttribute('aria-checked', 'true')
    expect(ambienceRadio).toHaveAttribute('aria-checked', 'false')
    expect(instrumentalRadio).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /doors/i })).toBeInTheDocument()

    await user.click(instrumentalRadio)
    expect(modeState).toBe('music')
    expect(instrumentalRadio).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /forest/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /doors/i })).not.toBeInTheDocument()

    await user.click(ambienceRadio)
    expect(modeState).toBe('ambience')
    expect(ambienceRadio).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /rain/i })).toBeInTheDocument()
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

  it('organizes FX sounds into expandable category and subcategory levels', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay',
              duration: 1.5,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'sfx',
            },
            {
              id: '2',
              prompt: 'TrackType: SFX, wooden bowstring snap and arrow leaving the rest, close mic, dry studio, fast decay',
              duration: 1,
              seed: 2,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'sfx',
            },
            {
              id: '3',
              prompt: 'TrackType: SFX, 12-gauge shotgun blast, close mic, wooden barn interior, short boom, fast decay',
              duration: 2,
              seed: 3,
              createdAt: new Date().toISOString(),
              cfg: 1,
              negative: '',
              mode: 'sfx',
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

    // Category accordion exists and is collapsed by default
    const combatCatBtn = screen.getByRole('button', { name: /combat/i })
    expect(combatCatBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /sword/i })).not.toBeInTheDocument()

    // Expand Combat category -> subcategory accordions appear
    await user.click(combatCatBtn)
    expect(combatCatBtn).toHaveAttribute('aria-expanded', 'true')
    const swordBtn = screen.getByRole('button', { name: /sword/i })
    const bowBtn = screen.getByRole('button', { name: /bow & arrow/i })
    const firearmsBtn = screen.getByRole('button', { name: /firearms/i })
    expect(swordBtn).toHaveAttribute('aria-expanded', 'false')
    expect(bowBtn).toHaveAttribute('aria-expanded', 'false')
    expect(firearmsBtn).toHaveAttribute('aria-expanded', 'false')

    // Track cards are not visible yet
    expect(screen.queryByText(/Steel shortsword leaving a leather scabbard/i)).not.toBeInTheDocument()

    // Expand Sword -> Sword track appears
    await user.click(swordBtn)
    expect(swordBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Steel shortsword leaving a leather scabbard/i)).toBeInTheDocument()
    expect(screen.queryByText(/Wooden bowstring snap/i)).not.toBeInTheDocument()

    // Expand Bow & Arrow -> Bow track appears
    await user.click(bowBtn)
    expect(bowBtn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Wooden bowstring snap/i)).toBeInTheDocument()
  })

  it('displays all clips across categories without pagination and reveals them on expansion', async () => {
    const user = userEvent.setup()
    const clips = Array.from({ length: 30 }, (_, i) => ({
      id: `clip-${i + 1}`,
      prompt: `TrackType: SFX, steel shortsword clash number ${i + 1}, close mic, fast decay`,
      duration: 1.5,
      seed: 100 + i,
      createdAt: `2026-08-23T12:${String(i).padStart(2, '0')}:00.000Z`,
      cfg: 3,
      negative: '',
      mode: 'sfx' as const,
      category: 'Combat',
      subcategory: 'Sword',
    }))

    render(
      <TooltipProvider>
        <GrimoireRail
          clips={clips}
          mode="sfx"
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )

    // No pagination controls should appear
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Showing 1–24/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Per page:/i)).not.toBeInTheDocument()

    // Combat category button shows total 30 sounds
    const combatBtn = screen.getByRole('button', { name: /combat/i })
    expect(combatBtn).toBeInTheDocument()
    expect(screen.getByText(/30 sounds/i)).toBeInTheDocument()

    // Expand Combat category
    await user.click(combatBtn)
    const swordBtn = screen.getByRole('button', { name: /sword/i })
    expect(swordBtn).toBeInTheDocument()

    // Expand Sword subcategory
    await user.click(swordBtn)

    // Verify clips are loaded and rendered
    const promptNames = screen.getAllByText(/steel shortsword clash/i)
    expect(promptNames.length).toBe(30)
  })

  it('renders proper human-readable names for clips with UUID prompts', async () => {
    const user = userEvent.setup()
    const uuidClips: Clip[] = [
      {
        id: '67de8afe-9708-4034-8f23-8c4391694f47',
        prompt: '67de8afe-9708-4034-8f23-8c4391694f47',
        duration: 2,
        seed: 1,
        createdAt: '2026-01-01T00:00:00Z',
        cfg: 3,
        negative: '',
        mode: 'sfx',
        category: 'Combat',
        subcategory: 'Sword',
      },
      {
        id: 'd8d577c4-8847-4f12-9c32-9a0021b38f99',
        prompt: 'd8d577c4-8847-4f12-9c32-9a0021b38f99',
        duration: 3,
        seed: 2,
        createdAt: '2026-01-01T00:01:00Z',
        cfg: 3,
        negative: '',
        mode: 'sfx',
        category: 'General',
        subcategory: 'General',
      },
    ]

    render(
      <TooltipProvider>
        <GrimoireRail
          clips={uuidClips}
          mode="sfx"
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )

    // Expand Combat -> Sword
    const combatBtn = screen.getByRole('button', { name: /combat/i })
    await user.click(combatBtn)
    const swordBtn = screen.getByRole('button', { name: /sword/i })
    await user.click(swordBtn)

    // The UUID prompt should be rendered as "Sword Sound", not the raw UUID
    expect(screen.getByText('Sword Sound')).toBeInTheDocument()
    expect(screen.queryByText(/67de8afe/i)).not.toBeInTheDocument()

    // Expand General category
    const generalCatBtn = screen.getByRole('button', { name: /general 1 sound/i })
    await user.click(generalCatBtn)

    // Expand General subcategory
    const generalSubBtn = screen.getAllByRole('button', { name: /general/i }).find((b) => b !== generalCatBtn)
    if (generalSubBtn) {
      await user.click(generalSubBtn)
    }

    // The generic UUID prompt should be rendered as "Sound Effect", not the raw UUID
    expect(screen.getByText('Sound Effect')).toBeInTheDocument()
    expect(screen.queryByText(/d8d577c4/i)).not.toBeInTheDocument()
  })

  it('lets you select visible clips and open export pack', async () => {
    const user = userEvent.setup()
    const onExportPack = vi.fn()
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[
            {
              id: '1',
              prompt: 'TrackType: SFX, steel shortsword leaving a leather scabbard',
              duration: 2,
              seed: 1,
              createdAt: new Date().toISOString(),
              cfg: 4,
              negative: '',
              mode: 'sfx',
              category: 'Combat',
              subcategory: 'Sword',
            },
          ]}
          query="shortsword"
          mode="sfx"
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={() => undefined}
          onDelete={() => undefined}
          onExportPack={onExportPack}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('checkbox', { name: /select steel shortsword/i }))
    await user.click(screen.getByRole('button', { name: /export pack/i }))
    expect(screen.getByLabelText(/naming template/i)).toHaveValue('{type}_{category}_{name}_{index}')
    await user.click(screen.getByRole('button', { name: /^export$/i }))
    expect(onExportPack).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ['1'],
        zip: true,
        format: 'wav',
      }),
    )
  })
})

