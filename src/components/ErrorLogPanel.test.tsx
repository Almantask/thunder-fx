import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorLogPanel } from '@/components/ErrorLogPanel'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('@/lib/engine', () => ({
  readErrorLog: vi.fn(async () => '[t] ERROR omen\ntraceback\n\n[t] ERROR later'),
  revealErrorLog: vi.fn(),
}))

describe('ErrorLogPanel', () => {
  it('shows log entries so they can be read newest first', async () => {
    render(
      <TooltipProvider>
        <ErrorLogPanel />
      </TooltipProvider>,
    )
    expect(await screen.findByRole('heading', { name: /error log/i })).toBeInTheDocument()
    const log = await screen.findByRole('log')
    const text = log.textContent ?? ''
    expect(text.indexOf('ERROR later')).toBeLessThan(text.indexOf('ERROR omen'))
  })
})
