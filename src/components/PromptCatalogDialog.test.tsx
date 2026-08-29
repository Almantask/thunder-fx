import { render, screen, within } from '@testing-library/react'
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
    const level1Btn = screen.getByRole('button', { name: /level i/i })
    expect(level1Btn).toHaveAttribute('aria-expanded', 'false')
    await user.click(level1Btn)
    expect(screen.getByRole('checkbox', { name: /forest ambient/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /steel sword draw/i })).not.toBeInTheDocument()
  })

  it('opens collapsed 3 intensity levels when selecting an Ambience category', async () => {
    const user = userEvent.setup()
    const ambienceCatalog = catalogFromFiles({
      '/prompts/ambience/forest.md': `# Forest

### Forest ambient (I)
- Duration: 30s
- Negative: speech, singing

TrackType: Music, instrumental, forest ambient, looping-friendly

### Forest mystery (II)
- Duration: 45s
- Negative: speech, singing

TrackType: Music, instrumental, forest mystery theme, cinematic

### Forest storm (III)
- Duration: 60s
- Negative: speech, singing

TrackType: Music, instrumental, epic forest tempest orchestra
`,
    })
    renderDialog({ catalog: ambienceCatalog })
    expect(screen.getByRole('radio', { name: 'Ambience' })).toHaveAttribute('aria-checked', 'true')

    const level1Btn = screen.getByRole('button', { name: /level i — quiet looping bed/i })
    const level2Btn = screen.getByRole('button', { name: /level ii — mood in motion/i })
    const level3Btn = screen.getByRole('button', { name: /level iii — full intensity/i })

    // All 3 intensity levels are collapsed by default
    expect(level1Btn).toHaveAttribute('aria-expanded', 'false')
    expect(level2Btn).toHaveAttribute('aria-expanded', 'false')
    expect(level3Btn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('checkbox', { name: /forest ambient/i })).not.toBeInTheDocument()

    // Expand Level I -> shows Level I prompt only
    await user.click(level1Btn)
    expect(level1Btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: /forest ambient/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /forest mystery/i })).not.toBeInTheDocument()

    // Expand Level II -> shows Level II prompt
    await user.click(level2Btn)
    expect(level2Btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: /forest mystery/i })).toBeInTheDocument()

    // Expand Level III -> shows Level III prompt
    await user.click(level3Btn)
    expect(level3Btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: /forest storm/i })).toBeInTheDocument()
  })

  it('displays subcategories and allows filtering by subcategory', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.getByRole('radio', { name: /all/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /sword/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /unarmed & martial/i })).toBeInTheDocument()

    // Filter by Sword
    await user.click(screen.getByRole('radio', { name: /sword/i }))
    expect(screen.getByRole('checkbox', { name: /steel sword draw/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /fist punch/i })).not.toBeInTheDocument()

    // Filter by Unarmed & Martial
    await user.click(screen.getByRole('radio', { name: /unarmed & martial/i }))
    expect(screen.getByRole('checkbox', { name: /fist punch/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /steel sword draw/i })).not.toBeInTheDocument()
  })

  it('allows collapsing and expanding subcategory accordions in the prompt list', async () => {
    const user = userEvent.setup()
    renderDialog()
    const swordAccordion = screen.getByRole('button', { name: /^sword/i })
    expect(swordAccordion).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: /steel sword draw/i })).toBeInTheDocument()

    // Collapse Sword
    await user.click(swordAccordion)
    expect(swordAccordion).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('checkbox', { name: /steel sword draw/i })).not.toBeInTheDocument()

    // Re-expand Sword
    await user.click(swordAccordion)
    expect(swordAccordion).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: /steel sword draw/i })).toBeInTheDocument()
  })

  it('searches across all FX categories ignoring the selected category', async () => {
    const user = userEvent.setup()
    renderDialog()
    // Select UI category
    await user.click(screen.getByRole('option', { name: /^ui/i }))
    expect(screen.getByRole('checkbox', { name: /soft button click/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /steel sword draw/i })).not.toBeInTheDocument()

    // Type a query that belongs to Combat category ('sword')
    await user.type(screen.getByLabelText(/search prompts/i), 'sword')
    // Should find steel sword draw from Combat even though UI was selected!
    expect(screen.getByRole('checkbox', { name: /steel sword draw/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /soft button click/i })).not.toBeInTheDocument()
  })

  it('searches across all Ambience categories ignoring the selected category', async () => {
    const user = userEvent.setup()
    const mixed = catalogFromFiles({
      '/prompts/ambience/forest.md': `# Forest
### Forest ambient (I)
- Duration: 30s
- Negative: speech, singing
TrackType: Music, instrumental, forest ambient
`,
      '/prompts/ambience/tavern.md': `# Tavern
### Tavern lute (I)
- Duration: 30s
- Negative: speech, singing
TrackType: Music, instrumental, tavern lute
`,
    })
    renderDialog({ catalog: mixed })
    await user.click(screen.getByRole('radio', { name: 'Ambience' }))
    // Select Tavern category
    await user.click(screen.getByRole('option', { name: /tavern/i }))
    // Search for 'forest'
    await user.type(screen.getByLabelText(/search prompts/i), 'forest')
    // Should find forest ambient even though Tavern was selected!
    expect(screen.getByRole('checkbox', { name: /forest ambient/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /tavern lute/i })).not.toBeInTheDocument()
  })

  it('renders clear instrument tags on non-fx prompts and previews them', async () => {
    const user = userEvent.setup()
    const ambienceCatalog = catalogFromFiles({
      '/prompts/ambience/forest.md': `# Forest

### Forest ambient (I)
- Duration: 30s
- Negative: speech, singing

TrackType: Music, instrumental, forest ambient with Celtic harp and soft cello
`,
    })
    renderDialog({ catalog: ambienceCatalog })
    await user.click(screen.getByRole('button', { name: /level i — quiet looping bed/i }))

    const instContainer = screen.getByLabelText('Instruments: harp, cello')
    expect(instContainer).toBeInTheDocument()
    expect(within(instContainer).getByText('harp')).toBeInTheDocument()
    expect(within(instContainer).getByText('cello')).toBeInTheDocument()

    // Preview
    await user.click(screen.getByRole('button', { name: /preview forest ambient/i }))
    expect(screen.getByText(/Instruments:/i)).toBeInTheDocument()
  })

  it('does not render instrument tags on FX prompts', () => {
    renderDialog()
    expect(screen.queryByLabelText(/Instruments:/i)).not.toBeInTheDocument()
  })

  it('filters by multiple selected instruments with Any and All match modes', async () => {
    const user = userEvent.setup()
    const ambienceCatalog = catalogFromFiles({
      '/prompts/ambience/forest.md': `# Forest

### Harp only (I)
- Duration: 30s
- Negative: speech

TrackType: Music, peaceful grove with Celtic harp

### Flute only (I)
- Duration: 30s
- Negative: speech

TrackType: Music, peaceful grove with solo flute

### Harp and Flute (I)
- Duration: 30s
- Negative: speech

TrackType: Music, peaceful grove with Celtic harp and solo flute

### Cello only (I)
- Duration: 30s
- Negative: speech

TrackType: Music, peaceful grove with solo cello
`,
    })
    renderDialog({ catalog: ambienceCatalog })
    const level1Btn = screen.getByRole('button', { name: /level i — quiet looping bed/i })
    await user.click(level1Btn)

    // All 4 are visible initially
    expect(screen.getByRole('checkbox', { name: /harp only/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /flute only/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /harp and flute/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /cello only/i })).toBeInTheDocument()

    // Select Harp instrument filter
    const harpFilterBtn = screen.getByRole('button', { name: /^harp/i })
    await user.click(harpFilterBtn)

    // Only prompts with harp should show
    expect(screen.getByRole('checkbox', { name: /harp only/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /harp and flute/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /flute only/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /cello only/i })).not.toBeInTheDocument()

    // Multi-select: also select Flute
    const fluteFilterBtn = screen.getByRole('button', { name: /^flute/i })
    await user.click(fluteFilterBtn)

    // By default "Any" match mode is active -> prompts with harp OR flute show
    expect(screen.getByRole('checkbox', { name: /harp only/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /flute only/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /harp and flute/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /cello only/i })).not.toBeInTheDocument()

    // Switch match mode to "All"
    await user.click(screen.getByRole('radio', { name: /^all$/i }))

    // Only prompts with BOTH harp AND flute show
    expect(screen.getByRole('checkbox', { name: /harp and flute/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /harp only/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /flute only/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /cello only/i })).not.toBeInTheDocument()

    // Clear instrument filter by clicking "All instruments"
    await user.click(screen.getByRole('button', { name: /all instruments/i }))
    expect(screen.getByRole('checkbox', { name: /harp only/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /flute only/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /harp and flute/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /cello only/i })).toBeInTheDocument()
  })
})



