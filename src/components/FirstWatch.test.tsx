import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FirstWatch } from '@/components/FirstWatch'
import { TooltipProvider } from '@/components/ui/tooltip'

function renderWatch(onComplete = vi.fn()) {
  return render(
    <TooltipProvider delayDuration={0}>
      <FirstWatch onComplete={onComplete} />
    </TooltipProvider>,
  )
}

async function advanceToScribing() {
  const user = userEvent.setup()
  renderWatch()
  await user.click(screen.getByLabelText(/stability ai community license/i))
  await user.click(screen.getByLabelText(/gemma terms/i))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'Augury' })).toBeInTheDocument()
  const next = await screen.findByRole('button', { name: 'Continue' })
  await waitFor(() => expect(next).toBeEnabled())
  await user.click(next)
  expect(await screen.findByRole('heading', { name: 'Scribing' })).toBeInTheDocument()
  return user
}

describe('FirstWatch', () => {
  it('keeps Continue disabled until both oaths are sworn', async () => {
    const user = userEvent.setup()
    renderWatch()
    const cont = screen.getByRole('button', { name: 'Continue' })
    expect(cont).toBeDisabled()
    await user.click(screen.getByLabelText(/stability ai community license/i))
    expect(cont).toBeDisabled()
    await user.click(screen.getByLabelText(/gemma terms/i))
    expect(cont).toBeEnabled()
  })

  it('moves to Augury after oaths', async () => {
    const user = userEvent.setup()
    renderWatch()
    await user.click(screen.getByLabelText(/stability ai community license/i))
    await user.click(screen.getByLabelText(/gemma terms/i))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Augury' })).toBeInTheDocument()
  })

  it('hides full token instructions until the keeper asks', async () => {
    await advanceToScribing()
    expect(screen.getByRole('button', { name: /show full token instructions/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /how to get a hugging face token/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/huggingface\.co\/settings\/tokens/i)).not.toBeInTheDocument()
  })

  it('opens detailed token steps from the scribing card', async () => {
    const user = await advanceToScribing()
    await user.click(screen.getByRole('button', { name: /show full token instructions/i }))
    expect(
      await screen.findByRole('heading', { name: /how to get a hugging face token/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /huggingface\.co\/settings\/tokens/i })).toHaveAttribute(
      'href',
      'https://huggingface.co/settings/tokens',
    )
    expect(screen.getByRole('link', { name: /stabilityai\/stable-audio-3-medium/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /google\/t5gemma-b-b-ul2/i })).toBeInTheDocument()
    expect(screen.getByText(/permission to Read/i)).toBeInTheDocument()
    expect(screen.getAllByText(/hf_/i).length).toBeGreaterThan(0)
  })
})
