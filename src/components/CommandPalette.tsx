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
  onOpenLogs: () => void
  onOpenLibrary: () => void
  onOpenGenerate: () => void
  onOpenSettings: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  onCast,
  onExportWav,
  onExportOgg,
  onFocusPrompt,
  onOpenLogs,
  onOpenLibrary,
  onOpenGenerate,
  onOpenSettings,
}: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput
          placeholder="Command the keep…"
          className="w-full"
          title="Type to filter rites. Esc closes. Enter runs the selected command."
        />
        <CommandList>
          <CommandEmpty title="No command matches that text. Try Library, Generate, Settings, or Cast.">
            No rite matches.
          </CommandEmpty>
          <CommandItem
            title="Open the Grimoire of saved weaves."
            onSelect={() => {
              onOpenLibrary()
              onOpenChange(false)
            }}
          >
            Library
          </CommandItem>
          <CommandItem
            title="Open the Cast canvas: Scroll, Altar, and incantation."
            onSelect={() => {
              onOpenGenerate()
              onOpenChange(false)
            }}
          >
            Generate
          </CommandItem>
          <CommandItem
            title="Weave the current incantation with Stable Audio 3 Medium."
            onSelect={() => {
              onCast()
              onOpenChange(false)
            }}
          >
            Cast
          </CommandItem>
          <CommandItem
            title="Save the trimmed clip as 16-bit stereo WAV at 44.1 kHz."
            onSelect={() => {
              onExportWav()
              onOpenChange(false)
            }}
          >
            Export WAV
          </CommandItem>
          <CommandItem
            title="Encode the trim as OGG Vorbis through the Python sidecar."
            onSelect={() => {
              onExportOgg()
              onOpenChange(false)
            }}
          >
            Export OGG
          </CommandItem>
          <CommandItem
            title="Move keyboard focus to the incantation parchment."
            onSelect={() => {
              onFocusPrompt()
              onOpenChange(false)
            }}
          >
            Focus incantation
          </CommandItem>
          <CommandItem
            title="Open Settings: library folder, export folder, token, and the error ledger."
            onSelect={() => {
              onOpenSettings()
              onOpenChange(false)
            }}
          >
            Settings
          </CommandItem>
          <CommandItem
            title="Read Cast and sidecar errors on the Settings tab, newest first."
            onSelect={() => {
              onOpenLogs()
              onOpenChange(false)
            }}
          >
            Error log
          </CommandItem>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
