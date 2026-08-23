import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScrollCanvas } from '@/components/ScrollCanvas'
import { TooltipProvider } from '@/components/ui/tooltip'

const base = {
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

  it('hides the loading bar when the waveform is idle', () => {
    render(
      <TooltipProvider>
        <ScrollCanvas {...base} weaving={false} rite={0} />
      </TooltipProvider>,
    )
    expect(screen.queryByRole('progressbar', { name: /generation progress/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: /model load progress/i })).not.toBeInTheDocument()
  })
})
