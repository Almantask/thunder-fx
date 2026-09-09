/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShapePanel, type ShapePanelProps } from '@/components/ShapePanel'
import { TooltipProvider } from '@/components/ui/tooltip'

function setup(overrides: Partial<ShapePanelProps> = {}) {
  const props: ShapePanelProps = {
    disabled: false,
    canUndo: false,
    dirty: false,
    canSave: true,
    onFade: vi.fn(),
    onReverse: vi.fn(),
    onGain: vi.fn(),
    onNormalize: vi.fn(),
    onPitch: vi.fn(),
    onVariants: vi.fn(),
    onUndo: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  }
  render(
    <TooltipProvider>
      <ShapePanel {...props} />
    </TooltipProvider>,
  )
  return props
}

/** The panel starts collapsed, so every test opens it first. */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /shape/i }))
}

describe('ShapePanel', () => {
  it('stays collapsed until it is opened', () => {
    setup()
    expect(screen.queryByRole('button', { name: /reverse/i })).not.toBeInTheDocument()
  })

  it('reverses the clip', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: /reverse clip/i }))
    expect(props.onReverse).toHaveBeenCalledTimes(1)
  })

  it('normalizes the clip', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: /normalize level/i }))
    expect(props.onNormalize).toHaveBeenCalledTimes(1)
  })

  it('passes both fade lengths through', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    const fadeIn = screen.getByLabelText(/fade in seconds/i)
    await user.clear(fadeIn)
    await user.type(fadeIn, '0.5')
    await user.click(screen.getByRole('button', { name: /apply fades/i }))
    expect(props.onFade).toHaveBeenCalledWith(0.5, 0.1)
  })

  it('accepts a decimal that has to pass through a trailing dot while typing', async () => {
    // Re-parsing every keystroke turned "0." into 0 and dropped the dot, so
    // "0.5" arrived as 5 and a sub-second fade could not be typed at all.
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    for (const [label, value] of [
      [/fade out seconds/i, '1.25'],
      [/pitch shift in semitones/i, '0.5'],
    ] as const) {
      const field = screen.getByLabelText(label)
      await user.clear(field)
      await user.type(field, value)
      expect(field).toHaveValue(value)
    }
    await user.click(screen.getByRole('button', { name: /apply pitch shift/i }))
    expect(props.onPitch).toHaveBeenCalledWith(0.5)
  })

  it('accepts a negative gain, which has to pass through a bare minus sign', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    const gain = screen.getByLabelText(/gain in decibels/i)
    await user.clear(gain)
    await user.type(gain, '-3.5')
    await user.click(screen.getByRole('button', { name: /apply gain/i }))
    expect(props.onGain).toHaveBeenCalledWith(-3.5)
  })

  it('ignores text that is not part of a number', async () => {
    const user = userEvent.setup()
    setup()
    await open(user)
    const gain = screen.getByLabelText(/gain in decibels/i)
    await user.clear(gain)
    await user.type(gain, 'abc')
    expect(gain).toHaveValue('')
  })

  it('normalizes an out-of-range draft when the field loses focus', async () => {
    const user = userEvent.setup()
    setup()
    await open(user)
    const semitones = screen.getByLabelText(/pitch shift in semitones/i)
    await user.clear(semitones)
    await user.type(semitones, '99')
    await user.tab()
    expect(semitones).toHaveValue('12')
  })

  it('will not apply fades when both are zero', async () => {
    const user = userEvent.setup()
    setup()
    await open(user)
    const fadeOut = screen.getByLabelText(/fade out seconds/i)
    await user.clear(fadeOut)
    await user.type(fadeOut, '0')
    expect(screen.getByRole('button', { name: /apply fades/i })).toBeDisabled()
  })

  it('will not apply a gain of zero', async () => {
    const user = userEvent.setup()
    setup()
    await open(user)
    expect(screen.getByRole('button', { name: /apply gain/i })).toBeDisabled()
  })

  it('applies a gain once one is typed', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    const gain = screen.getByLabelText(/gain in decibels/i)
    await user.clear(gain)
    await user.type(gain, '6')
    await user.click(screen.getByRole('button', { name: /apply gain/i }))
    expect(props.onGain).toHaveBeenCalledWith(6)
  })

  it('clamps a gain past the supported range', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    const gain = screen.getByLabelText(/gain in decibels/i)
    await user.clear(gain)
    await user.type(gain, '99')
    await user.click(screen.getByRole('button', { name: /apply gain/i }))
    expect(props.onGain).toHaveBeenCalledWith(24)
  })

  it('shifts pitch by the typed number of semitones', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: /apply pitch shift/i }))
    expect(props.onPitch).toHaveBeenCalledWith(2)
  })

  it('makes variants using the semitone value as the spread', async () => {
    const user = userEvent.setup()
    const props = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: /make pitch variants/i }))
    expect(props.onVariants).toHaveBeenCalledWith(3, 2)
  })

  it('disables undo until there is an edit to undo', async () => {
    const user = userEvent.setup()
    setup({ canUndo: false })
    await open(user)
    expect(screen.getByRole('button', { name: /undo edit/i })).toBeDisabled()
  })

  it('undoes once there is an edit', async () => {
    const user = userEvent.setup()
    const props = setup({ canUndo: true })
    await open(user)
    await user.click(screen.getByRole('button', { name: /undo edit/i }))
    expect(props.onUndo).toHaveBeenCalledTimes(1)
  })

  it('only offers save once something has been edited', async () => {
    const user = userEvent.setup()
    setup({ dirty: false })
    await open(user)
    expect(screen.getByRole('button', { name: /save edits to library/i })).toBeDisabled()
  })

  it('saves an edited clip', async () => {
    const user = userEvent.setup()
    const props = setup({ dirty: true })
    await open(user)
    await user.click(screen.getByRole('button', { name: /save edits to library/i }))
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('marks the collapsed header when there are unsaved edits', () => {
    setup({ dirty: true })
    expect(screen.getByLabelText(/unsaved edits/i)).toBeInTheDocument()
  })

  it('explains why an edit cannot be written back in the browser build', async () => {
    const user = userEvent.setup()
    setup({ dirty: true, canSave: false })
    await open(user)
    expect(screen.getByText(/needs the desktop app/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save edits to library/i })).toBeDisabled()
  })

  it('disables every transform while there is no clip', async () => {
    const user = userEvent.setup()
    setup({ disabled: true })
    await open(user)
    expect(screen.getByRole('button', { name: /reverse clip/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /normalize level/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /apply pitch shift/i })).toBeDisabled()
  })
})
