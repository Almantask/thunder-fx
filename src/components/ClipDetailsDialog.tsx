import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_NAME_LENGTH, normalizeTag, type ClipMeta } from '@/lib/clipMeta'
import { sanitizeClipStem } from '@/lib/filename'

export type ClipDetailsDialogProps = {
  open: boolean
  /** Which field to put the cursor in; both are always editable. */
  focus: 'name' | 'tags'
  meta: ClipMeta
  /** Current display name, used as the starting value. */
  name: string
  /** Whether renaming also renames the WAV on disk, which the copy explains. */
  renamesFile: boolean
  /** Tags already used elsewhere in the library, offered as suggestions. */
  suggestions: string[]
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (value: { name: string; tags: string[] }) => void
}

export function ClipDetailsDialog({
  open,
  focus,
  meta,
  name,
  renamesFile,
  suggestions,
  busy = false,
  onOpenChange,
  onSubmit,
}: ClipDetailsDialogProps) {
  const [draftName, setDraftName] = useState(name)
  const [tags, setTags] = useState<string[]>(meta.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const tagRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setDraftName(name)
    setTags(meta.tags ?? [])
    setTagDraft('')
    // The dialog animates in, so focus has to wait a tick for the field to exist.
    const id = window.setTimeout(() => {
      if (focus === 'tags') tagRef.current?.focus()
      else nameRef.current?.select()
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, focus, name, meta])

  const stem = sanitizeClipStem(draftName)
  const nameUsable = stem.length > 0

  function commitTag(value: string) {
    const clean = normalizeTag(value)
    if (!clean || tags.includes(clean)) {
      setTagDraft('')
      return
    }
    setTags([...tags, clean].sort())
    setTagDraft('')
  }

  const unused = suggestions.filter((tag) => !tags.includes(tag)).slice(0, 8)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="clip-details-desc">
        <DialogTitle>Clip details</DialogTitle>
        <DialogDescription id="clip-details-desc">
          {renamesFile
            ? 'Renaming changes the WAV file on disk as well, so the name you give it is the name it exports under.'
            : 'The name is stored with the clip. Tags filter the library.'}
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="clip-name">Name</Label>
            <Input
              id="clip-name"
              ref={nameRef}
              className="mt-1"
              value={draftName}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => setDraftName(e.target.value)}
              aria-label="Clip name"
            />
            {draftName.trim() && !nameUsable ? (
              <p className="mt-1 text-xs text-danger" role="alert">
                That name has no characters a filename can use. Try letters or digits.
              </p>
            ) : renamesFile && nameUsable ? (
              <p className="mt-1 font-mono text-xs text-muted">{stem}.wav</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="clip-tags">Tags</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Hint key={tag} label={`Remove the "${tag}" tag.`}>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded-book border border-gold/40 bg-leather-2 px-2 font-mono text-[11px] text-cream hover:border-danger hover:text-danger"
                    onClick={() => setTags(tags.filter((entry) => entry !== tag))}
                    aria-label={`Remove tag ${tag}`}
                  >
                    {tag}
                    <X className="h-3 w-3" />
                  </button>
                </Hint>
              ))}
            </div>
            <Input
              id="clip-tags"
              ref={tagRef}
              className="mt-1.5"
              value={tagDraft}
              placeholder="Add a tag, then press Enter"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  commitTag(tagDraft)
                } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                  setTags(tags.slice(0, -1))
                }
              }}
              onBlur={() => commitTag(tagDraft)}
              aria-label="Add a tag"
            />
            {unused.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {unused.map((tag) => (
                  <Hint key={tag} label={`Add the "${tag}" tag, already used elsewhere in the library.`}>
                    <button
                      type="button"
                      className="inline-flex h-6 items-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] px-2 font-mono text-[11px] text-muted hover:text-cream"
                      onClick={() => commitTag(tag)}
                    >
                      + {tag}
                    </button>
                  </Hint>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!nameUsable || busy}
              onClick={() => onSubmit({ name: draftName.trim(), tags })}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
