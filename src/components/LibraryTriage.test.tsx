/**
 * @vitest-environment jsdom
 *
 * The triage surface added to the library: favourites, ratings, tags, rename,
 * and the trash that makes deleting recoverable.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClipDetailsDialog } from '@/components/ClipDetailsDialog'
import { GrimoireRail } from '@/components/GrimoireRail'
import { TrashDialog } from '@/components/TrashDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EMPTY_FILTER, type ClipMetaIndex, type LibraryFilter } from '@/lib/clipMeta'
import type { TrashEntry } from '@/lib/trash'
import type { Clip } from '@/lib/types'

function clip(id: string, prompt: string): Clip {
  return {
    id,
    prompt,
    duration: 2,
    seed: 7,
    createdAt: '2026-09-01T00:00:00Z',
    cfg: 1,
    negative: '',
    mode: 'sfx',
    path: `C:\\library\\sfx\\combat\\${id}.wav`,
  }
}

const CLIPS = [
  clip('sword', 'TrackType: SFX, steel sword swing'),
  clip('door', 'TrackType: SFX, heavy wooden door'),
]

function renderRail(
  overrides: {
    meta?: ClipMetaIndex
    filter?: LibraryFilter
    handlers?: Record<string, unknown>
  } = {},
) {
  const handlers = {
    onQuery: vi.fn(),
    onSelect: vi.fn(),
    onStarter: vi.fn(),
    onDelete: vi.fn(),
    onFilter: vi.fn(),
    onToggleFavorite: vi.fn(),
    onToggleRejected: vi.fn(),
    onRate: vi.fn(),
    onRename: vi.fn(),
    onEditTags: vi.fn(),
    onOpenTrash: vi.fn(),
    onCompare: vi.fn(),
    ...overrides.handlers,
  }
  render(
    <TooltipProvider>
      <GrimoireRail
        clips={CLIPS}
        query=""
        mode="sfx"
        meta={overrides.meta ?? {}}
        filter={overrides.filter ?? EMPTY_FILTER}
        trashCount={2}
        {...handlers}
      />
    </TooltipProvider>,
  )
  return handlers
}

/**
 * Cards sit inside collapsed category and subcategory groups, so open every
 * level. Expanding a category reveals more collapsed triggers beneath it, and
 * "Expand all" only appears when there is more than one category — hence the
 * loop rather than a single click.
 */
async function expandAll(user: ReturnType<typeof userEvent.setup>) {
  for (let pass = 0; pass < 4; pass += 1) {
    const collapsed = screen.queryAllByRole('button', { expanded: false })
    if (!collapsed.length) return
    await user.click(collapsed[0]!)
  }
}

describe('library triage', () => {
  it('marks a clip as a favourite', async () => {
    const user = userEvent.setup()
    const handlers = renderRail()
    await expandAll(user)
    const [star] = screen.getAllByRole('button', { name: /add favourite/i })
    await user.click(star!)
    expect(handlers.onToggleFavorite).toHaveBeenCalled()
  })

  it('shows a favourite as already set', async () => {
    const user = userEvent.setup()
    renderRail({ meta: { sword: { favorite: true } } })
    await expandAll(user)
    expect(screen.getAllByRole('button', { name: /remove favourite/i })).toHaveLength(1)
  })

  it('rates a clip', async () => {
    const user = userEvent.setup()
    const handlers = renderRail()
    await expandAll(user)
    const groups = screen.getAllByRole('radiogroup', { name: /rating for/i })
    await user.click(within(groups[0]!).getByRole('radio', { name: '4 stars' }))
    expect(handlers.onRate).toHaveBeenCalledWith(expect.any(String), 4)
  })

  it('opens rename and tags for a clip', async () => {
    const user = userEvent.setup()
    const handlers = renderRail()
    await expandAll(user)
    await user.click(screen.getAllByRole('button', { name: /rename clip/i })[0]!)
    expect(handlers.onRename).toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: /edit tags/i })[0]!)
    expect(handlers.onEditTags).toHaveBeenCalled()
  })

  it('hides a rejected clip by default', async () => {
    const user = userEvent.setup()
    renderRail({ meta: { sword: { rejected: true } } })
    await expandAll(user)
    expect(screen.queryByText(/steel sword swing/i)).not.toBeInTheDocument()
    expect(screen.getByText(/heavy wooden door/i)).toBeInTheDocument()
  })

  it('brings rejected clips back when the filter asks for them', async () => {
    const user = userEvent.setup()
    renderRail({
      meta: { sword: { rejected: true } },
      filter: { ...EMPTY_FILTER, showRejected: true },
    })
    await expandAll(user)
    expect(screen.getByText(/steel sword swing/i)).toBeInTheDocument()
  })

  it('shows only favourites when that filter is on', async () => {
    const user = userEvent.setup()
    renderRail({
      meta: { sword: { favorite: true } },
      filter: { ...EMPTY_FILTER, favoritesOnly: true },
    })
    await expandAll(user)
    expect(screen.getByText(/steel sword swing/i)).toBeInTheDocument()
    expect(screen.queryByText(/heavy wooden door/i)).not.toBeInTheDocument()
  })

  it('applies a rating floor from the filter bar', async () => {
    const user = userEvent.setup()
    const handlers = renderRail()
    const bar = screen.getByRole('radiogroup', { name: /minimum rating/i })
    await user.click(within(bar).getByRole('radio', { name: /at least 3 stars/i }))
    expect(handlers.onFilter).toHaveBeenCalledWith(expect.objectContaining({ minRating: 3 }))
  })

  it('offers a tag in use as a filter', async () => {
    const user = userEvent.setup()
    const handlers = renderRail({ meta: { sword: { tags: ['metal'] } } })
    await user.click(screen.getByRole('button', { name: /metal/i }))
    expect(handlers.onFilter).toHaveBeenCalledWith(expect.objectContaining({ tags: ['metal'] }))
  })

  it('renders the renamed display name instead of the prompt', async () => {
    const user = userEvent.setup()
    renderRail({ meta: { sword: { name: 'sword_swing_03' } } })
    await expandAll(user)
    expect(screen.getByText('sword_swing_03')).toBeInTheDocument()
    expect(screen.queryByText(/steel sword swing/i)).not.toBeInTheDocument()
  })

  it('opens the trash', async () => {
    const user = userEvent.setup()
    const handlers = renderRail()
    await user.click(screen.getByRole('button', { name: /open trash/i }))
    expect(handlers.onOpenTrash).toHaveBeenCalled()
  })

  it('only allows a comparison once exactly two clips are selected', async () => {
    const user = userEvent.setup()
    const handlers = renderRail()
    const compare = screen.getByRole('button', { name: /compare selected clips/i })
    expect(compare).toBeDisabled()

    await expandAll(user)
    const boxes = screen.getAllByRole('checkbox')
    await user.click(boxes[0]!)
    expect(screen.getByRole('button', { name: /compare selected clips/i })).toBeDisabled()

    await user.click(boxes[1]!)
    await user.click(screen.getByRole('button', { name: /compare selected clips/i }))
    expect(handlers.onCompare).toHaveBeenCalledWith(expect.arrayContaining(['sword', 'door']))
  })

  it('no longer tells the user that deleting cannot be undone', async () => {
    const user = userEvent.setup()
    renderRail()
    await expandAll(user)
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument()
  })
})

describe('TrashDialog', () => {
  const entry: TrashEntry = {
    id: 'sword',
    clip: CLIPS[0]!,
    originalPath: 'C:\\library\\sfx\\combat\\sword.wav',
    trashPath: 'C:\\library\\.trash\\sword--1.wav',
    deletedAt: '2026-09-08T00:00:00Z',
  }

  function renderTrash(entries: TrashEntry[]) {
    const handlers = {
      onOpenChange: vi.fn(),
      onRestore: vi.fn(),
      onPurge: vi.fn(),
      onEmpty: vi.fn(),
    }
    render(
      <TooltipProvider>
        <TrashDialog open entries={entries} {...handlers} />
      </TooltipProvider>,
    )
    return handlers
  }

  it('says when the trash is empty', () => {
    renderTrash([])
    expect(screen.getByText(/the trash is empty/i)).toBeInTheDocument()
  })

  it('restores a clip', async () => {
    const user = userEvent.setup()
    const handlers = renderTrash([entry])
    await user.click(screen.getByRole('button', { name: /restore sword/i }))
    expect(handlers.onRestore).toHaveBeenCalledWith('sword')
  })

  it('deletes one clip for good', async () => {
    const user = userEvent.setup()
    const handlers = renderTrash([entry])
    await user.click(screen.getByRole('button', { name: /delete sword permanently/i }))
    expect(handlers.onPurge).toHaveBeenCalledWith('sword')
  })

  it('empties the whole trash', async () => {
    const user = userEvent.setup()
    const handlers = renderTrash([entry])
    await user.click(screen.getByRole('button', { name: /empty trash/i }))
    expect(handlers.onEmpty).toHaveBeenCalled()
  })
})

describe('ClipDetailsDialog', () => {
  function renderDetails(overrides: Partial<Parameters<typeof ClipDetailsDialog>[0]> = {}) {
    const onSubmit = vi.fn()
    render(
      <TooltipProvider>
        <ClipDetailsDialog
          open
          focus="name"
          meta={{}}
          name="Steel sword swing"
          renamesFile
          suggestions={['metal']}
          onOpenChange={vi.fn()}
          onSubmit={onSubmit}
          {...overrides}
        />
      </TooltipProvider>,
    )
    return onSubmit
  }

  it('previews the filename a rename will produce', () => {
    renderDetails()
    expect(screen.getByText('Steel sword swing.wav')).toBeInTheDocument()
  })

  it('submits the new name', async () => {
    const user = userEvent.setup()
    const onSubmit = renderDetails()
    const field = screen.getByLabelText(/clip name/i)
    await user.clear(field)
    await user.type(field, 'sword_swing_03')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'sword_swing_03', tags: [] })
  })

  it('refuses a name with no characters a filename can use', async () => {
    const user = userEvent.setup()
    renderDetails()
    const field = screen.getByLabelText(/clip name/i)
    await user.clear(field)
    await user.type(field, '///')
    expect(screen.getByRole('alert')).toHaveTextContent(/no characters a filename can use/i)
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('adds a tag on Enter and submits it', async () => {
    const user = userEvent.setup()
    const onSubmit = renderDetails()
    await user.type(screen.getByLabelText(/add a tag/i), 'Impact{Enter}')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['impact'] }))
  })

  it('offers a tag already used elsewhere in the library', async () => {
    const user = userEvent.setup()
    const onSubmit = renderDetails()
    await user.click(screen.getByRole('button', { name: /\+ metal/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['metal'] }))
  })

  it('removes a tag that is already set', async () => {
    const user = userEvent.setup()
    const onSubmit = renderDetails({ meta: { tags: ['metal', 'impact'] } })
    await user.click(screen.getByRole('button', { name: /remove tag metal/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['impact'] }))
  })
})
