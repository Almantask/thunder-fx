import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GrimoireRail } from '@/components/GrimoireRail'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('GrimoireRail', () => {
  it('shows starter incantations when empty', async () => {
    const user = userEvent.setup()
    let chosen = ''
    render(
      <TooltipProvider>
        <GrimoireRail
          clips={[]}
          query=""
          onQuery={() => undefined}
          onSelect={() => undefined}
          onStarter={(p) => {
            chosen = p
          }}
          onDelete={() => undefined}
        />
      </TooltipProvider>,
    )
    expect(screen.getByText(/grimoire is empty/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /shortsword/i }))
    expect(chosen).toMatch(/shortsword/i)
  })
})
