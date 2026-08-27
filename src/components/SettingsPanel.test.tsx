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

function renderPanel(initial: KeepSettings = DEFAULT_SETTINGS) {
  function Harness() {
    const [settings, setSettings] = useState(initial)
    return <SettingsPanel settings={settings} onChange={setSettings} />
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

  it('lets you pick a low-VRAM precision profile', async () => {
    const user = userEvent.setup()
    renderPanel()
    const low = screen.getByRole('radio', { name: /fp16 \/ bf16/i })
    expect(screen.getByRole('radio', { name: /fp32/i })).toHaveAttribute('aria-checked', 'true')
    await user.click(low)
    expect(low).toHaveAttribute('aria-checked', 'true')
  })
})
