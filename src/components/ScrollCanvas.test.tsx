/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScrollCanvas } from '@/components/ScrollCanvas'
import { TooltipProvider } from '@/components/ui/tooltip'
import { generateMockSfxWav } from '@/lib/wav'

const base = {
  weaving: false,
  rite: 0,
  totalRites: 8,
  elapsedMs: 0,
  duration: 8,
  trimStart: 0,
  trimEnd: 8,
  playhead: 0,
  onTrim: vi.fn(),
  onSeek: vi.fn(),
}

describe('ScrollCanvas', () => {
  it('names the bar Model load progress while the model loads', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas {...base} weaving={false} loadingModel rite={0} phase="loading" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('progressbar', { name: /model load progress/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/loading model/i)
    expect(screen.queryByRole('progressbar', { name: /generation progress/i })).not.toBeInTheDocument()
  })

  it('shows a loading bar while weaving', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas {...base} weaving rite={1} phase="weaving" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/step 1 of 8/i)
  })

  it('shows remaining time while generating', async () => {
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          weaving
          rite={4}
          phase="weaving"
          elapsedMs={20_000}
          historicalEstimateMs={40_000}
        />
      </TooltipProvider>,
    )
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/~0:20 remaining/)
    })
  })

  it('preserves continuous elapsed time when startedAt is provided across tab changes', async () => {
    const startedAt = Date.now() - 15_000
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          weaving
          rite={2}
          phase="weaving"
          startedAt={startedAt}
          elapsedMs={15_000}
        />
      </TooltipProvider>,
    )
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/0:15\.\d elapsed/i)
    })
  })

  it('hides the loading bar when the waveform is idle', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas {...base} weaving={false} rite={0} />
      </TooltipProvider>,
    )
    expect(screen.queryByRole('progressbar', { name: /generation progress/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: /model load progress/i })).not.toBeInTheDocument()
  })

  it('allows clicking to seek multiple times', () => {
    const onSeek = vi.fn()
    const mockWav = generateMockSfxWav(1.0, 1)
    render(
      <TooltipProvider>
        <ScrollCanvas {...base} wav={mockWav} duration={10} onSeek={onSeek} />
      </TooltipProvider>,
    )
    const slider = screen.getByRole('slider', { name: /waveform/i })

    // First seek click
    slider.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 500 }),
    )
    slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))

    // Second seek click
    slider.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 200 }),
    )
    slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))

    // Third seek click
    slider.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 700 }),
    )
    slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))

    expect(onSeek).toHaveBeenCalledTimes(3)
  })

  it('renders during weaving with completedSubcategoryCount passed', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          weaving
          rite={2}
          phase="weaving"
          completedSubcategoryCount={2}
        />
      </TooltipProvider>,
    )
    expect(screen.getByRole('progressbar', { name: /generation progress/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/step 2 of 8/i)
  })

  it('renders empty label when model is not loaded and no wav is present', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          modelLoaded={false}
          emptyLabel="Describe a sound, then click Generate."
        />
      </TooltipProvider>,
    )
    expect(screen.getByText('Describe a sound, then click Generate.')).toBeInTheDocument()
  })

  it('hides empty label and presents resting canvas when model is loaded without wav', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          modelLoaded={true}
          emptyLabel="Describe a sound, then click Generate."
        />
      </TooltipProvider>,
    )
    expect(screen.queryByText('Describe a sound, then click Generate.')).not.toBeInTheDocument()
  })

  it('triggers goblin interaction on click when resting without wav', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          modelLoaded={true}
          duration={10}
        />
      </TooltipProvider>,
    )
    const slider = screen.getByRole('slider', { name: /waveform/i })

    // Simulate clicking goblin in slot 0
    slider.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 192, clientY: 200 }),
    )
    slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
  })

  it('seeks waveform when model is loaded and wav is present', () => {
    const onSeek = vi.fn()
    const mockWav = generateMockSfxWav(1.0, 1)
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          wav={mockWav}
          modelLoaded={true}
          duration={10}
          onSeek={onSeek}
        />
      </TooltipProvider>,
    )
    const slider = screen.getByRole('slider', { name: /waveform/i })

    slider.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 100 }),
    )
    slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))

    expect(onSeek).toHaveBeenCalled()
  })

  it('shows the seed used alongside the clip length', () => {
    const mockWav = generateMockSfxWav(1.0, 1)
    render(
      <TooltipProvider>
        <ScrollCanvas {...base} wav={mockWav} duration={10} seed={492817} />
      </TooltipProvider>,
    )
    expect(screen.getByText(/seed 492817/i)).toBeInTheDocument()
  })

  it('does not show a seed when no clip is loaded', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas {...base} seed={492817} />
      </TooltipProvider>,
    )
    expect(screen.queryByText(/seed/i)).not.toBeInTheDocument()
  })

  it('does not restart the animation loop when the playhead moves', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { rerender } = render(
      <TooltipProvider>
        <ScrollCanvas {...base} weaving rite={1} phase="weaving" />
      </TooltipProvider>,
    )
    const cancelsAfterMount = cancel.mock.calls.length
    rerender(
      <TooltipProvider>
        <ScrollCanvas {...base} weaving rite={1} phase="weaving" playhead={1.5} elapsedMs={500} />
      </TooltipProvider>,
    )
    expect(cancel.mock.calls.length).toBe(cancelsAfterMount)
    cancel.mockRestore()
  })

  it('hides goblin crew and displays waveform when individual wav is loaded', () => {
    const mockWav = generateMockSfxWav(1.0, 1)
    render(
      <TooltipProvider>
        <ScrollCanvas
          {...base}
          wav={mockWav}
          modelLoaded={true}
          duration={10}
          emptyLabel="Describe a sound, then click Generate."
        />
      </TooltipProvider>,
    )
    expect(screen.queryByText('Describe a sound, then click Generate.')).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /waveform/i })).toBeInTheDocument()
  })
})
