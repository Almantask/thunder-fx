import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FirstWatch } from '@/components/FirstWatch'

describe('FirstWatch', () => {
  it('keeps Continue disabled until both oaths are sworn', async () => {
    const user = userEvent.setup()
    render(<FirstWatch onComplete={vi.fn()} />)
    const cont = screen.getByRole('button', { name: 'Continue' })
    expect(cont).toBeDisabled()
    await user.click(screen.getByLabelText(/stability ai community license/i))
    expect(cont).toBeDisabled()
    await user.click(screen.getByLabelText(/gemma terms/i))
    expect(cont).toBeEnabled()
  })

  it('moves to Augury after oaths', async () => {
    const user = userEvent.setup()
    render(<FirstWatch onComplete={vi.fn()} />)
    await user.click(screen.getByLabelText(/stability ai community license/i))
    await user.click(screen.getByLabelText(/gemma terms/i))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Augury' })).toBeInTheDocument()
  })
})
