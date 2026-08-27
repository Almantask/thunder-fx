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

  it('shows loading model while weights go into VRAM', () => {
    render(
      <TooltipProvider>
        <Titlebar
          engineLabel="cuda"
          weaving={false}
          loadingModel
          tab="generate"
          onTabChange={vi.fn()}
        />
      </TooltipProvider>,
    )
    expect(screen.getByText('loading model')).toBeInTheDocument()
  })

  it('shows generating while a clip is being made', () => {
    render(
      <TooltipProvider>
        <Titlebar
          engineLabel="cuda"
          weaving
          weavePhase="weaving"
          tab="generate"
          onTabChange={vi.fn()}
        />
      </TooltipProvider>,
    )
    expect(screen.getByText('generating')).toBeInTheDocument()
  })

  it('shows a VRAM badge and warns when memory is high', () => {
    render(
      <TooltipProvider>
        <Titlebar
          engineLabel="cuda"
          weaving={false}
          tab="generate"
          onTabChange={vi.fn()}
          vramUsedGb={7.2}
          vramTotalGb={8}
          gpuName="RTX 3070"
          gpuTempC={71}
        />
      </TooltipProvider>,
    )
    const badge = screen.getByLabelText(/vram: 7.2 \/ 8.0 gb/i)
    expect(badge).toHaveTextContent('7.2 / 8.0 GB')
    expect(badge.className).toMatch(/amber/)
  })
})
