import { Ban, Pencil, Star, Tag } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { MAX_RATING, type ClipMeta } from '@/lib/clipMeta'
import { cn } from '@/lib/utils'

export type ClipMetaControlsProps = {
  meta: ClipMeta
  /** Used in the accessible labels, so screen readers say which clip. */
  name: string
  onToggleFavorite: () => void
  onToggleRejected: () => void
  onRate: (rating: number) => void
  onRename: () => void
  onEditTags: () => void
}

const iconButton = 'h-6 w-6 shrink-0 rounded-full p-0'

/**
 * Triage controls on a library card.
 *
 * Favourite and reject are opposite verdicts on the same clip, so setting one
 * clears the other (see `clipMeta.toggleFavorite`). Rating is separate: a clip
 * can be a four without being the pick of the batch.
 */
export function ClipMetaControls({
  meta,
  name,
  onToggleFavorite,
  onToggleRejected,
  onRate,
  onRename,
  onEditTags,
}: ClipMetaControlsProps) {
  const rating = meta.rating ?? 0
  return (
    <div className="mt-1 flex flex-wrap items-center gap-0.5">
      <Hint label={meta.favorite ? `Remove ${name} from favourites.` : `Mark ${name} as a favourite.`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(iconButton, meta.favorite ? 'text-gold' : 'text-muted hover:text-gold')}
          onClick={onToggleFavorite}
          aria-label={meta.favorite ? 'Remove favourite' : 'Add favourite'}
          aria-pressed={Boolean(meta.favorite)}
        >
          <Star className={cn('h-3.5 w-3.5', meta.favorite && 'fill-current')} />
        </Button>
      </Hint>

      <div
        className="flex items-center"
        role="radiogroup"
        aria-label={`Rating for ${name}`}
      >
        {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((value) => (
          <Hint
            key={value}
            label={
              rating === value
                ? `Clear the rating on ${name}.`
                : `Rate ${name} ${value} of ${MAX_RATING}.`
            }
          >
            <button
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              className={cn(
                'flex h-5 w-3.5 items-center justify-center text-muted transition-colors hover:text-gold focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none',
                value <= rating && 'text-gold',
              )}
              onClick={() => onRate(value)}
            >
              <Star className={cn('h-2.5 w-2.5', value <= rating && 'fill-current')} />
            </button>
          </Hint>
        ))}
      </div>

      <Hint
        label={
          meta.rejected
            ? `Un-reject ${name} so it shows in the library again.`
            : `Reject ${name}. It is hidden from the library but not deleted.`
        }
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(iconButton, meta.rejected ? 'text-danger' : 'text-muted hover:text-danger')}
          onClick={onToggleRejected}
          aria-label={meta.rejected ? 'Un-reject clip' : 'Reject clip'}
          aria-pressed={Boolean(meta.rejected)}
        >
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </Hint>

      <Hint label={`Rename ${name}. This renames the WAV file on disk too.`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(iconButton, 'text-muted hover:text-cream')}
          onClick={onRename}
          aria-label="Rename clip"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </Hint>

      <Hint label={`Edit tags on ${name}. Tags filter the library.`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            iconButton,
            meta.tags?.length ? 'text-gold' : 'text-muted hover:text-cream',
          )}
          onClick={onEditTags}
          aria-label="Edit tags"
        >
          <Tag className="h-3.5 w-3.5" />
        </Button>
      </Hint>

      {meta.tags?.length ? (
        <span className="ml-0.5 min-w-0 truncate font-mono text-[10px] text-gold/80" title={meta.tags.join(', ')}>
          {meta.tags.join(' · ')}
        </span>
      ) : null}
    </div>
  )
}
