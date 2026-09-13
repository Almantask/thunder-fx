/**
 * @vitest-environment jsdom
 */
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
  format: 'wav' as const,
  sampleRate: 44100 as const,
  bitDepth: 16 as const,
  mono: false,
  bitrateKbps: 128,
  vorbisQuality: 6,
  onPlay: vi.fn(),
  onStop: vi.fn(),
  onLoop: vi.fn(),
  onTrimStart: vi.fn(),
  onTrimEnd: vi.fn(),
  onAutoTrim: vi.fn(),
  onFormat: vi.fn(),
  onSampleRate: vi.fn(),
  onBitDepth: vi.fn(),
  onBitrateKbps: vi.fn(),
  onVorbisQuality: vi.fn(),
  onMono: vi.fn(),
  onExport: vi.fn(),
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
    expect(screen.getByRole('option', { name: /24-bit container \(16-bit content\)/i })).toBeInTheDocument()
    await user.click(screen.getByLabelText(/mono downmix/i))
    expect(onMono).toHaveBeenCalledWith(true)
  })

  it('keeps seamless loop out of the export panel', () => {
    render(
      <TooltipProvider>
        <Altar {...props} />
      </TooltipProvider>,
    )
    expect(screen.queryByRole('checkbox', { name: /seamless loop/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/crossfade seconds/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview seamless loop/i })).not.toBeInTheDocument()
  })

  it('labels the export button with the selected format and exports it', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(
      <TooltipProvider>
        <Altar {...props} format="mp3" onExport={onExport} />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('button', { name: /export mp3/i }))
    expect(onExport).toHaveBeenCalled()
  })

  it('picks the export format and leaves the current format out of more formats', async () => {
    const user = userEvent.setup()
    const onFormat = vi.fn()
    render(
      <TooltipProvider>
        <Altar {...props} format="flac" onFormat={onFormat} />
      </TooltipProvider>,
    )
    await user.selectOptions(screen.getByLabelText(/export format/i), 'ogg')
    expect(onFormat).toHaveBeenCalledWith('ogg')
    await user.click(screen.getByRole('button', { name: /more formats/i }))
    expect(screen.queryByRole('menuitem', { name: /export flac/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /export wav/i })).toBeInTheDocument()
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

  it('offers bitrate for opus and quality for vorbis', async () => {
    const user = userEvent.setup()
    const onBitrateKbps = vi.fn()
    const { rerender } = render(
      <TooltipProvider>
        <Altar {...props} format="opus" bitrateKbps={128} onBitrateKbps={onBitrateKbps} />
      </TooltipProvider>,
    )
    await user.selectOptions(screen.getByLabelText(/export bitrate/i), '192')
    expect(onBitrateKbps).toHaveBeenCalledWith(192)

    const onVorbisQuality = vi.fn()
    rerender(
      <TooltipProvider>
        <Altar {...props} format="ogg" vorbisQuality={6} onVorbisQuality={onVorbisQuality} />
      </TooltipProvider>,
    )
    await user.selectOptions(screen.getByLabelText(/vorbis quality/i), '8')
    expect(onVorbisQuality).toHaveBeenCalledWith(8)
  })
})