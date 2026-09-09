import { RotateCcw, Trash2 } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { promptName } from '@/lib/filename'
import { TRASH_RETENTION_DAYS, type TrashEntry } from '@/lib/trash'
import { relativeTime } from '@/lib/utils'

export type TrashDialogProps = {
  open: boolean
  entries: TrashEntry[]
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onEmpty: () => void
}

export function TrashDialog({
  open,
  entries,
  busy = false,
  onOpenChange,
  onRestore,
  onPurge,
  onEmpty,
}: TrashDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="trash-desc" className="max-w-2xl">
        <DialogTitle>Trash</DialogTitle>
        <DialogDescription id="trash-desc">
          Deleted clips are moved here instead of being destroyed. They are removed automatically
          after {TRASH_RETENTION_DAYS} days, or whenever you empty the trash.
        </DialogDescription>

        {entries.length === 0 ? (
          <p className="py-6 text-sm text-muted">The trash is empty.</p>
        ) : (
          <>
            <ScrollArea className="max-h-[50vh]">
              <ul className="space-y-2 pr-2">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] bg-leather-2/40 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-cream">
                        {entry.meta?.name || promptName(entry.clip.prompt, entry.clip)}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted">
                        deleted {relativeTime(entry.deletedAt)}
                      </p>
                    </div>
                    <Hint label="Put this clip back where it came from, with its rating and tags.">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs"
                        disabled={busy}
                        onClick={() => onRestore(entry.id)}
                        aria-label={`Restore ${entry.id}`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </Hint>
                    <Hint label="Delete this clip's WAV for good. This cannot be undone.">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs text-danger hover:bg-danger/10 hover:text-danger"
                        disabled={busy}
                        onClick={() => onPurge(entry.id)}
                        aria-label={`Delete ${entry.id} permanently`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </Hint>
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <div className="flex justify-between gap-2 pt-2">
              <Hint label="Delete every WAV in the trash for good. This cannot be undone.">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger hover:bg-danger/10 hover:text-danger"
                  disabled={busy}
                  onClick={onEmpty}
                >
                  Empty trash ({entries.length})
                </Button>
              </Hint>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
