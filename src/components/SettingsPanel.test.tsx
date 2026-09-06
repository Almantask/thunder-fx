/**
 * @vitest-environment jsdom
 */
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '@/components/SettingsPanel'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEFAULT_SETTINGS, type KeepSettings } from '@/lib/types'

vi.mock('@/lib/engine', () => ({
  readErrorLog: vi.fn(async () => '[t] ERROR omen\ntraceback\n\n[t] ERROR later'),
  revealErrorLog: vi.fn(),
  errorLogPath: vi.fn(async () => null),
  libraryPath: vi.fn(async () => null),
  revealLibrary: vi.fn(),
  pickDirectory: vi.fn(async () => null),
}))

function renderPanel(
  initial: KeepSettings = DEFAULT_SETTINGS,
  props: { baseModelReady?: boolean } = {},
) {
  function Harness() {
    const [settings, setSettings] = useState(initial)
    return <SettingsPanel settings={settings} onChange={setSettings} {...props} />
  }
  return render(
    <TooltipProvider>
      <Harness />
    </TooltipProvider>,
  )
}

describe('SettingsPanel', () => {
  it('lets you set where generated sounds are stored', async () => {
    const user = userEvent.setup()
    renderPanel()
    const folder = screen.getByLabelText(/generated sounds folder/i)
    await user.type(folder, 'E:\\sfx')
    expect(folder).toHaveValue('E:\\sfx')
  })

  it('shows the error log on the same page', async () => {
    renderPanel()
    expect(await screen.findByRole('heading', { name: /error log/i })).toBeInTheDocument()
    const log = await screen.findByRole('log')
    expect(log.textContent ?? '').toMatch(/ERROR later/)
  })

  it('accepts a default duration up to the Medium model limit', () => {
    renderPanel()
    expect(screen.getByLabelText(/default duration/i)).toHaveAttribute('max', '380')
  })

  it('lets you pick the default audio format for generated audio', async () => {
    const user = userEvent.setup()
    renderPanel()
    const select = screen.getByLabelText(/default audio format/i)
    expect(select).toHaveValue('opus')
    expect(screen.getByRole('option', { name: /aiff/i })).toBeInTheDocument()
    await user.selectOptions(select, 'flac')
    expect(select).toHaveValue('flac')
    expect(screen.getByText(/lossless, about half the size of wav/i)).toBeInTheDocument()
  })

  it('warns that a compressed default falls back to wav in the browser', () => {
    renderPanel({ ...DEFAULT_SETTINGS, defaultExportFormat: 'mp3' })
    expect(screen.getByText(/needs the desktop app/i)).toBeInTheDocument()
  })

  it('defaults to fp16 and lets you switch to full precision', async () => {
    const user = userEvent.setup()
    renderPanel()
    // fp16 is what the worker, the Stable Audio library and the README all use.
    // fp32 also turns off chunked decode in the worker, roughly doubling VRAM.
    const low = screen.getByRole('radio', { name: /fp16 \/ bf16/i })
    const full = screen.getByRole('radio', { name: /fp32/i })
    expect(low).toHaveAttribute('aria-checked', 'true')
    await user.click(full)
    expect(full).toHaveAttribute('aria-checked', 'true')
  })

  it('defaults the quality preset to Balanced and lets you change it', async () => {
    const user = userEvent.setup()
    renderPanel()
    const balanced = screen.getByRole('radio', { name: /balanced/i })
    expect(balanced).toHaveAttribute('aria-checked', 'true')
    const fast = screen.getByRole('radio', { name: /max speed/i })
    await user.click(fast)
    expect(fast).toHaveAttribute('aria-checked', 'true')
  })

  it('offers the Medium-Base download when Max quality cannot use it yet', () => {
    renderPanel(undefined, { baseModelReady: false })
    expect(screen.getByRole('button', { name: /download medium-base/i })).toBeInTheDocument()
    // Until it is installed Max quality must refuse, not quietly run something
    // else. Substituting is what made earlier takes sound muffled and flat.
    expect(screen.getByText(/refuses\s+to\s+generate/i)).toBeInTheDocument()
  })

  it('says Max quality is fully enabled once Medium-Base is installed', () => {
    renderPanel(undefined, { baseModelReady: true })
    expect(screen.queryByRole('button', { name: /download medium-base/i })).toBeNull()
    expect(screen.getByText(/un-distilled checkpoint with real guidance/i)).toBeInTheDocument()
  })
})
