import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Hint } from '@/components/Hint'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('Hint', () => {
  it('shows the explanation when the control is hovered', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider delayDuration={0}>
        <Hint label="Keeps the Hugging Face token and export folder on this machine.">
          <button type="button">Keep</button>
        </Hint>
      </TooltipProvider>,
    )
    await user.hover(screen.getByRole('button', { name: 'Keep' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Keeps the Hugging Face token and export folder on this machine.',
    )
  })

  it('does not capture pointer events over nearby controls', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider delayDuration={0}>
        <Hint label="Open the prompt pack.">
          <button type="button">Browse prompts</button>
        </Hint>
      </TooltipProvider>,
    )
    await user.hover(screen.getByRole('button', { name: 'Browse prompts' }))
    expect(await screen.findByRole('tooltip')).toHaveClass('pointer-events-none')
  })
})
