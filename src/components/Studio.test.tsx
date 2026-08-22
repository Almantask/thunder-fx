import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Studio } from '@/components/Studio'
import { TooltipProvider } from '@/components/ui/tooltip'

function renderStudio() {
  return render(
    <TooltipProvider>
      <Studio />
    </TooltipProvider>,
  )
}

describe('Studio', () => {
  it('opens on Generate with the incantation console', () => {
    renderStudio()
    expect(screen.getByRole('tab', { name: 'Generate' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /cast, generate sound/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Search Grimoire')).not.toBeInTheDocument()
  })

  it('shows the Grimoire on Library and hides Cast', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.click(screen.getByRole('tab', { name: 'Library' }))
    expect(screen.getByLabelText('Search Grimoire')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cast, generate sound/i })).not.toBeInTheDocument()
  })

  it('shows the library folder and error ledger on Settings', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByLabelText(/generated sounds folder/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /error log/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cast, generate sound/i })).not.toBeInTheDocument()
  })
})
