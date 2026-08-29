import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Altar } from '@/components/Altar'
import { TooltipProvider } from '@/components/ui/tooltip'

const props = {
  hasClip: true,
  weaving: false,
  playing: false,
  looping: false,
  trimStart: 0.2,
  trimEnd: 1.5,
  duration: 8,
  sampleRate: 44100 as const,
  bitDepth: 16 as const,
  mono: false,
  seamlessLoop: false,
  crossfadeSec: 1,
  onPlay: vi.fn(),
  onStop: vi.fn(),
  onLoop: vi.fn(),
  onTrimStart: vi.fn(),
  onTrimEnd: vi.fn(),
  onAutoTrim: vi.fn(),
  onSampleRate: vi.fn(),
  onBitDepth: vi.fn(),
  onMono: vi.fn(),
  onSeamlessLoop: vi.fn(),
  onCrossfadeSec: vi.fn(),
  onPreviewLoop: vi.fn(),
  onExportWav: vi.fn(),
  onExportFormat: vi.fn(),
}

describe('Altar', () => {
  it('offers auto-trim, 48 kHz, 24-bit, and mono export controls', async () => {
    const user = userEvent.setup()
    const onAutoTrim = vi.fn()
    const onSampleRate = vi.fn()
    const onBitDepth = vi.fn()
    const onMono = vi.fn()
    render(
      <TooltipProvider>
        <Altar
          {...props}
          onAutoTrim={onAutoTrim}
          onSampleRate={onSampleRate}
          onBitDepth={onBitDepth}
          onMono={onMono}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /auto-trim silence/i }))
    expect(onAutoTrim).toHaveBeenCalled()
    await user.selectOptions(screen.getByLabelText(/sample rate/i), '48000')
    expect(onSampleRate).toHaveBeenCalledWith(48000)
    await user.selectOptions(screen.getByLabelText(/bit depth/i), '24')
    expect(onBitDepth).toHaveBeenCalledWith(24)
    await user.click(screen.getByLabelText(/mono downmix/i))
    expect(onMono).toHaveBeenCalledWith(true)
  })

  it('hides seamless loop options completely for sound fx mode', () => {
    render(
      <TooltipProvider>
        <Altar {...props} mode="sfx" seamlessLoop={true} />
      </TooltipProvider>,
    )
    expect(screen.queryByRole('checkbox', { name: /seamless loop/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/crossfade seconds/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview seamless loop/i })).not.toBeInTheDocument()
  })

  it('shows a seamless loop crossfade when the toggle is on in ambience mode', () => {
    render(
      <TooltipProvider>
        <Altar {...props} mode="ambience" seamlessLoop />
      </TooltipProvider>,
    )
    expect(screen.getByRole('checkbox', { name: /seamless loop/i })).toBeChecked()
    expect(screen.getByLabelText(/crossfade seconds/i)).toBeInTheDocument()
  })

  it('shows a seamless loop crossfade when the toggle is on in music mode', async () => {
    const user = userEvent.setup()
    const onPreviewLoop = vi.fn()
    render(
      <TooltipProvider>
        <Altar {...props} mode="music" seamlessLoop onPreviewLoop={onPreviewLoop} />
      </TooltipProvider>,
    )
    expect(screen.getByRole('checkbox', { name: /seamless loop/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/crossfade seconds/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /preview seamless loop/i }))
    expect(onPreviewLoop).toHaveBeenCalled()
  })

  it('lists FLAC and MP3 under more formats', async () => {
    const user = userEvent.setup()
    const onExportFormat = vi.fn()
    render(
      <TooltipProvider>
        <Altar {...props} onExportFormat={onExportFormat} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /more formats/i }))
    await user.click(screen.getByRole('menuitem', { name: /export flac/i }))
    expect(onExportFormat).toHaveBeenCalledWith('flac')
  })
})