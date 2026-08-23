import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromptCatalogDialog } from '@/components/PromptCatalogDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { catalogFromFiles } from '@/lib/promptCatalog'

const catalog = catalogFromFiles({
  '/prompts/combat.md': `# Combat

### Steel sword draw
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay

### Fist punch
- Duration: 1s
- Negative: music, speech, singing

TrackType: SFX, gloved fist hitting a padded dummy, close mic, dry studio, fast decay
`,
  '/prompts/ui.md': `# UI

### Soft button click
- Duration: 0.5s
- Negative: music, speech, singing

TrackType: SFX, short UI button click, hard plastic, close mic, dry studio, fast decay
`,
})

function renderDialog(
  overrides: Partial<Parameters<typeof PromptCatalogDialog>[0]> = {},
) {
  const onEnqueue = vi.fn()
  const onUse = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <TooltipProvider>
      <PromptCatalogDialog
        open
        catalog={catalog}
        onOpenChange={onOpenChange}
        onEnqueue={onEnqueue}
        onUse={onUse}
        {...overrides}
      />
    </TooltipProvider>,
  )
  return { onEnqueue, onUse, onOpenChange }
}

describe('PromptCatalogDialog', () => {
  it('lists categories from /prompts and their effects', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.getByRole('dialog', { name: /browse prompts/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /combat/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('checkbox', { name: /steel sword draw/i })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /^ui/i }))
    expect(screen.getByRole('checkbox', { name: /soft button click/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /steel sword draw/i })).not.toBeInTheDocument()
  })

  it('adds selected effects to the generate queue', async () => {
    const user = userEvent.setup()
    const { onEnqueue } = renderDialog()
    await user.click(screen.getByRole('checkbox', { name: /fist punch/i }))
    await user.click(screen.getByRole('button', { name: /add selected/i }))
    expect(onEnqueue).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Fist punch', duration: 1 }),
    ])
  })

  it('adds every effect in the open category', async () => {
    const user = userEvent.setup()
    const { onEnqueue } = renderDialog()
    await user.click(screen.getByRole('button', { name: /add category/i }))
    expect(onEnqueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Steel sword draw' }),
        expect.objectContaining({ title: 'Fist punch' }),
      ]),
    )
    expect(onEnqueue.mock.calls[0]?.[0]).toHaveLength(2)
  })

  it('filters effects by search text', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText(/search prompts/i), 'fist')
    expect(screen.getByRole('checkbox', { name: /fist punch/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /steel sword draw/i })).not.toBeInTheDocument()
  })

  it('loads one prompt into Generate without queueing', async () => {
    const user = userEvent.setup()
    const { onUse } = renderDialog()
    await user.click(screen.getByRole('button', { name: /use steel sword draw/i }))
    expect(onUse).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Steel sword draw',
        duration: 1.5,
      }),
    )
  })

  it('offers Preview on each listed prompt', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /preview steel sword draw/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /preview fist punch/i })).toBeInTheDocument()
  })

  it('previews the prompt text without using it', async () => {
    const user = userEvent.setup()
    const { onUse } = renderDialog()
    expect(
      screen.queryByText(/steel shortsword leaving a leather scabbard/i),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /preview steel sword draw/i }))
    expect(screen.getByText(/steel shortsword leaving a leather scabbard/i)).toBeInTheDocument()
    expect(onUse).not.toHaveBeenCalled()
  })

  it('filters the catalog between FX and Ambience', async () => {
    const user = userEvent.setup()
    const mixed = catalogFromFiles({
      '/prompts/fx/combat.md': `# Combat

### Steel sword draw
- Duration: 1.5s
- Negative: music, speech, singing

TrackType: SFX, steel shortsword leaving a leather scabbard, close mic, dry studio, fast decay
`,
      '/prompts/ambience/forest.md': `# Forest

### Forest ambient (I)
- Duration: 30s
- Negative: speech, singing

TrackType: Music, instrumental, forest ambient, looping-friendly
`,
    })
    renderDialog({ catalog: mixed })
    expect(screen.getByRole('radio', { name: 'FX' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Ambience' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: /steel sword draw/i })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Ambience' }))
    expect(screen.getByRole('checkbox', { name: /forest ambient/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /steel sword draw/i })).not.toBeInTheDocument()
  })
})
