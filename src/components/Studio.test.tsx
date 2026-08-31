/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Studio } from '@/components/Studio'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GENERATE_MODES } from '@/lib/generateMode'
import { TIMING_STORAGE_KEY } from '@/lib/timing'


function renderStudio() {
  return render(
    <TooltipProvider>
      <Studio />
    </TooltipProvider>,
  )
}

describe('Studio', () => {
  it('opens on Generate with the prompt console', () => {
    renderStudio()
    expect(screen.getByRole('tab', { name: 'Generate' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /generate sound/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unload model/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Search library')).not.toBeInTheDocument()
  })

  it('shows the library on Library and hides Generate', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.click(screen.getByRole('tab', { name: 'Library' }))
    expect(screen.getByLabelText('Search library')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate sound/i })).not.toBeInTheDocument()
  })

  it('shows the library folder and error log on Settings', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByLabelText(/generated sounds folder/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /error log/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate sound/i })).not.toBeInTheDocument()
  })

  it('shows a loading bar while generating and then returns control', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'tavern door')
    await user.click(screen.getByRole('button', { name: /generate sound/i }))
    expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /generate sound/i }, { timeout: 15000 }),
    ).toBeInTheDocument()
  }, 15000)

  it('switches to instrumental mode and generates a music clip', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.click(screen.getByRole('radio', { name: /instrumental/i }))
    expect(screen.getByRole('radio', { name: /instrumental/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue('TrackType: Music')
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByLabelText(/negative prompt/i)).toHaveValue(
      GENERATE_MODES.music.defaultNegative,
    )

    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), ', lute tavern theme')
    await user.click(screen.getByRole('button', { name: /generate music/i }))
    expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /generate music/i }, { timeout: 15000 }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Library' }))
    await user.click(screen.getByRole('button', { name: /main theme/i }))
    await user.click(screen.getByRole('button', { name: /level/i }))
    expect(screen.getByText(/lute tavern theme/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Music clip')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Instruments: lute')).toBeInTheDocument()
  }, 15000)

  it('turns on generate seamless loop for instrumental and loops preview after generate', async () => {
    const user = userEvent.setup()
    renderStudio()
    expect(screen.queryByRole('checkbox', { name: /generate seamless loop/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /instrumental/i }))
    expect(screen.getByRole('checkbox', { name: /generate seamless loop/i })).toBeChecked()
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), ', lute tavern theme')
    await user.click(screen.getByRole('button', { name: /generate music/i }))
    expect(
      await screen.findByRole('button', { name: /generate music/i }, { timeout: 15000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /loop trim preview/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }, 15000)

  it('switches to ambience mode with loop on and a music-avoiding negative', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.click(screen.getByRole('radio', { name: /^ambience$/i }))
    expect(screen.getByRole('radio', { name: /^ambience$/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue('TrackType: SFX')
    expect(screen.getByRole('checkbox', { name: /generate seamless loop/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByLabelText(/negative prompt/i)).toHaveValue(
      GENERATE_MODES.ambience.defaultNegative,
    )
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), ', heavy rain, steady bed')
    await user.click(screen.getByRole('button', { name: /generate ambience/i }))
    expect(
      await screen.findByRole('button', { name: /generate ambience/i }, { timeout: 15000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /loop trim preview/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }, 15000)

  it('shows a generate time estimate from past clips', () => {
    localStorage.setItem(
      TIMING_STORAGE_KEY,
      JSON.stringify({ loads: [], generates: [{ seconds: 8, elapsedMs: 40_000 }] }),
    )
    renderStudio()
    expect(screen.getByText('~0:40')).toBeInTheDocument()
  })

  it('shows remaining time while a generate runs', async () => {
    localStorage.setItem(
      TIMING_STORAGE_KEY,
      JSON.stringify({ loads: [], generates: [{ seconds: 8, elapsedMs: 40_000 }] }),
    )
    const user = userEvent.setup()
    renderStudio()
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'tavern door')
    await user.click(screen.getByRole('button', { name: /generate sound/i }))
    expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/~0:\d{2} remaining/)
    expect(
      await screen.findByRole('button', { name: /generate sound/i }, { timeout: 15000 }),
    ).toBeInTheDocument()
  }, 15000)

  it(
    'loads a catalog prompt into a queue and generates it',
    async () => {
      const user = userEvent.setup()
      renderStudio()
      await user.click(screen.getByRole('button', { name: /browse prompts/i }))
      expect(screen.getByRole('dialog', { name: /browse prompts/i })).toBeInTheDocument()
      await user.click(screen.getByRole('option', { name: /^combat/i }))
      await user.click(screen.getByRole('checkbox', { name: /steel sword draw/i }))
      await user.click(screen.getByRole('button', { name: /add selected/i }))
      await user.keyboard('{Escape}')
      expect(screen.getByText(/steel sword draw/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /generate queue/i }))
      expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
      expect(
        await screen.findByRole('button', { name: /generate sound/i }, { timeout: 15000 }),
      ).toBeInTheDocument()
      await user.click(screen.getByRole('tab', { name: 'Library' }))
      await user.click(screen.getByRole('button', { name: /combat/i }))
      await user.click(screen.getByRole('button', { name: /sword/i }))
      expect(screen.getByText(/steel shortsword/i)).toBeInTheDocument()
      expect(screen.queryByText(/TrackType: SFX/i)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /steel shortsword/i }))
      expect((screen.getByRole('textbox', { name: 'Prompt' }) as HTMLTextAreaElement).value).toMatch(
        /TrackType: SFX, steel shortsword/i,
      )
    },
    15000,
  )

  it('restores persisted queue from local storage and allows generating it', async () => {
    localStorage.setItem(
      'thunder-fx.queue',
      JSON.stringify([
        {
          id: 'fx:doors:heavy-gate',
          categoryId: 'fx:doors',
          category: 'Doors',
          title: 'Heavy iron gate',
          prompt: 'TrackType: SFX, heavy dungeon iron gate',
          duration: 3,
          negative: '',
        },
      ]),
    )
    const user = userEvent.setup()
    renderStudio()
    expect(screen.getByText(/heavy iron gate/i)).toBeInTheDocument()
    expect(screen.getByText(/saved/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /generate queue/i }))
    expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /generate sound/i }, { timeout: 15000 }),
    ).toBeInTheDocument()
  }, 15000)

  it('displays waveform after single track generation, but keeps waveform unset after queue generation', async () => {
    const user = userEvent.setup()
    renderStudio()

    // 1. Initial state: model is loaded in mock, no track active, play button disabled
    const playBtn = screen.getByRole('button', { name: /play trimmed clip/i })
    expect(playBtn).toBeDisabled()

    // 2. Single generate (1 track)
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'single sword strike')
    await user.click(screen.getByRole('button', { name: /generate sound/i }))
    expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    await screen.findByRole('button', { name: /generate sound/i }, { timeout: 15000 })

    // Single track generated: waveform is loaded, play button is now enabled
    expect(playBtn).toBeEnabled()

    // 3. Now run a queue generation
    await user.click(screen.getByRole('button', { name: /browse prompts/i }))
    await user.click(screen.getByRole('option', { name: /^combat/i }))
    await user.click(screen.getByRole('checkbox', { name: /steel sword draw/i }))
    await user.click(screen.getByRole('button', { name: /add selected/i }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /generate queue/i }))
    expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    await screen.findByRole('button', { name: /generate sound/i }, { timeout: 15000 })

    // Queue finished: waveform is NOT displayed, play button is disabled
    expect(playBtn).toBeDisabled()

    // 4. Playing an individual track from library loads the waveform
    await user.click(screen.getByRole('tab', { name: 'Library' }))
    await user.click(screen.getByRole('button', { name: /combat/i }))
    await user.click(screen.getByRole('button', { name: /sword/i }))
    await user.click(screen.getByRole('button', { name: /steel shortsword/i }))

    // Returned to Generate tab: waveform is loaded for the individual track, play button is enabled
    expect(screen.getByRole('tab', { name: 'Generate' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /play trimmed clip/i })).toBeEnabled()
  }, 15000)

  it('shows the seed used once a single track finishes generating', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'tavern door')
    await user.click(screen.getByRole('button', { name: /generate sound/i }))
    await screen.findByRole('button', { name: /generate sound/i }, { timeout: 15000 })
    expect(screen.getByText(/seed \d+/i)).toBeInTheDocument()
  }, 15000)

  it(
    'lets a prompt be queued while one is generating, then continues automatically',
    async () => {
      const user = userEvent.setup()
      renderStudio()
      await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'tavern door')
      await user.click(screen.getByRole('button', { name: /generate sound/i }))
      expect(await screen.findByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()

      // "Generate 4 takes" is replaced by "Queue next" while busy.
      expect(screen.queryByRole('button', { name: /generate 4 takes/i })).not.toBeInTheDocument()
      const queueNext = await screen.findByRole('button', { name: /queue next/i })
      await user.click(queueNext)
      expect(await screen.findByText(/queue · 1/i)).toBeInTheDocument()

      // The running generate finishes, then the queued prompt runs and drains the queue,
      // all without another click.
      expect(
        await screen.findByRole('button', { name: /generate sound/i }, { timeout: 20000 }),
      ).toBeInTheDocument()
      expect(screen.queryByText(/queue · 1/i)).not.toBeInTheDocument()
    },
    20000,
  )

  it('allows unloading the model', async () => {
    const user = userEvent.setup()
    renderStudio()
    const unloadBtn = screen.getByRole('button', { name: /unload model/i })
    expect(unloadBtn).toBeInTheDocument()
    await user.click(unloadBtn)
    expect(await screen.findByRole('button', { name: /^load model$/i })).toBeInTheDocument()
  })
})

