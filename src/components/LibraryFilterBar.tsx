import { Star, X } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { MAX_RATING, isFilterActive, type LibraryFilter } from '@/lib/clipMeta'
import { cn } from '@/lib/utils'

export type LibraryFilterBarProps = {
  filter: LibraryFilter
  onFilter: (filter: LibraryFilter) => void
  /** Tags in use across the whole library, most used first. */
  tags: { tag: string; count: number }[]
  /** How many clips are hidden by the current filter, for the reset hint. */
  hiddenCount: number
}

const chip =
  'inline-flex h-6 items-center gap-1 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_28%,transparent)] px-2 font-mono text-[11px] text-muted transition-colors hover:text-cream'

const chipOn = 'border-gold bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] text-cream'

/** Triage filters: favourites, a rating floor, tags, and whether rejects show. */
export function LibraryFilterBar({ filter, onFilter, tags, hiddenCount }: LibraryFilterBarProps) {
  const active = isFilterActive(filter)

  const toggleTag = (tag: string) => {
    const next = filter.tags.includes(tag)
      ? filter.tags.filter((entry) => entry !== tag)
      : [...filter.tags, tag]
    onFilter({ ...filter, tags: next })
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <Hint label="Show only clips marked as a favourite.">
        <button
          type="button"
          aria-pressed={filter.favoritesOnly}
          className={cn(chip, filter.favoritesOnly && chipOn)}
          onClick={() => onFilter({ ...filter, favoritesOnly: !filter.favoritesOnly })}
        >
          <Star className={cn('h-3 w-3', filter.favoritesOnly && 'fill-current')} />
          Favourites
        </button>
      </Hint>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Minimum rating">
        {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((value) => (
          <Hint
            key={value}
            label={
              filter.minRating === value
                ? 'Clear the rating filter.'
                : `Show only clips rated ${value} or higher.`
            }
          >
            <button
              type="button"
              role="radio"
              aria-checked={filter.minRating === value}
              aria-label={`At least ${value} star${value === 1 ? '' : 's'}`}
              className={cn(
                'flex h-6 w-4 items-center justify-center text-muted transition-colors hover:text-gold focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none',
                value <= filter.minRating && 'text-gold',
              )}
              onClick={() =>
                onFilter({ ...filter, minRating: filter.minRating === value ? 0 : value })
              }
            >
              <Star className={cn('h-3 w-3', value <= filter.minRating && 'fill-current')} />
            </button>
          </Hint>
        ))}
      </div>

      <Hint label="Rejects are hidden by default. This brings them back so they can be restored or deleted.">
        <button
          type="button"
          aria-pressed={filter.showRejected}
          className={cn(chip, filter.showRejected && chipOn)}
          onClick={() => onFilter({ ...filter, showRejected: !filter.showRejected })}
        >
          Show rejected
        </button>
      </Hint>

      {tags.slice(0, 12).map(({ tag, count }) => (
        <Hint key={tag} label={`Show only clips tagged "${tag}". Selecting more than one tag requires all of them.`}>
          <button
            type="button"
            aria-pressed={filter.tags.includes(tag)}
            className={cn(chip, filter.tags.includes(tag) && chipOn)}
            onClick={() => toggleTag(tag)}
          >
            {tag}
            <span className="opacity-60">{count}</span>
          </button>
        </Hint>
      ))}

      {active ? (
        <Hint label="Clear every filter and show the library again.">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted hover:text-cream"
            onClick={() =>
              onFilter({ favoritesOnly: false, showRejected: false, minRating: 0, tags: [] })
            }
          >
            <X className="h-3 w-3" />
            Clear{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
          </Button>
        </Hint>
      ) : null}
    </div>
  )
}
