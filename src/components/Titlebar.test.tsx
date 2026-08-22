import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Titlebar } from '@/components/Titlebar'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('Titlebar', () => {
  it('offers Library, Generate, and Settings tabs', () => {
    render(
      <TooltipProvider>
        <Titlebar
          engineLabel="cuda"
          weaving={false}
          tab="generate"
          onTabChange={vi.fn()}
        />
      </TooltipProvider>,
    )
    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Generate' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Logs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep' })).not.toBeInTheDocument()
  })

  it('notifies when a tab is chosen', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(
      <TooltipProvider>
        <Titlebar
          engineLabel="cuda"
          weaving={false}
          tab="generate"
          onTabChange={onTabChange}
        />
      </TooltipProvider>,
    )
    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(onTabChange).toHaveBeenCalledWith('settings')
  })
})
