import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCast: () => void
  onExportWav: () => void
  onExportOgg: () => void
  onFocusPrompt: () => void
  onOpenKeep: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  onCast,
  onExportWav,
  onExportOgg,
  onFocusPrompt,
  onOpenKeep,
}: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Command the keep…" />
        <CommandList>
          <CommandEmpty>No rite matches.</CommandEmpty>
          <CommandItem
            onSelect={() => {
              onCast()
              onOpenChange(false)
            }}
          >
            Cast
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onExportWav()
              onOpenChange(false)
            }}
          >
            Export WAV
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onExportOgg()
              onOpenChange(false)
            }}
          >
            Export OGG
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onFocusPrompt()
              onOpenChange(false)
            }}
          >
            Focus incantation
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenKeep()
              onOpenChange(false)
            }}
          >
            Open Keep
          </CommandItem>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
