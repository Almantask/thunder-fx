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
  onInstrumental?: () => void
  onLoadModel?: () => void
  onPromptCatalog?: () => void
  onGenerateQueue?: () => void
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
  onInstrumental,
  onLoadModel,
  onPromptCatalog,
  onGenerateQueue,
}: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput
          placeholder="Search commands…"
          className="w-full"
          title="Type to filter commands. Esc closes. Enter runs the selected command."
        />
        <CommandList>
          <CommandEmpty title="No command matches that text. Try Library, Generate, Settings, Load model, Instrumental, Prompt catalog, or Generate sound.">
            No matching command.
          </CommandEmpty>
          <CommandItem
            title="Open saved sounds."
            onSelect={() => {
              onOpenLibrary()
              onOpenChange(false)
            }}
          >
            Library
          </CommandItem>
          <CommandItem
            title="Open Generate: waveform, preview, and prompt."
            onSelect={() => {
              onOpenGenerate()
              onOpenChange(false)
            }}
          >
            Generate
          </CommandItem>
          <CommandItem
            title="Generate the current prompt with Stable Audio 3 Medium."
            onSelect={() => {
              onCast()
              onOpenChange(false)
            }}
          >
            Generate sound
          </CommandItem>
          {onLoadModel ? (
            <CommandItem
              title="Load Medium into VRAM. This is not generating a clip. Generate stays a separate step."
              onSelect={() => {
                onLoadModel()
                onOpenChange(false)
              }}
            >
              Load model
            </CommandItem>
          ) : null}
          {onPromptCatalog ? (
            <CommandItem
              title="Open the shipped /prompts catalog and add effects to the generate queue."
              onSelect={() => {
                onPromptCatalog()
                onOpenChange(false)
              }}
            >
              Prompt catalog
            </CommandItem>
          ) : null}
          {onGenerateQueue ? (
            <CommandItem
              title="Generate every queued catalog prompt in order. Cancel stops the rest."
              onSelect={() => {
                onGenerateQueue()
                onOpenChange(false)
              }}
            >
              Generate queue
            </CommandItem>
          ) : null}
          {onInstrumental ? (
            <CommandItem
              title="Switch Generate to instrumental music: TrackType Music, no vocals."
              onSelect={() => {
                onInstrumental()
                onOpenChange(false)
              }}
            >
              Instrumental mode
            </CommandItem>
          ) : null}
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
            title="Encode the trim as OGG Vorbis through the Python engine."
            onSelect={() => {
              onExportOgg()
              onOpenChange(false)
            }}
          >
            Export OGG
          </CommandItem>
          <CommandItem
            title="Move keyboard focus to the prompt."
            onSelect={() => {
              onFocusPrompt()
              onOpenChange(false)
            }}
          >
            Focus prompt
          </CommandItem>
          <CommandItem
            title="Open Settings: library folder, export folder, token, and the error log."
            onSelect={() => {
              onOpenSettings()
              onOpenChange(false)
            }}
          >
            Settings
          </CommandItem>
          <CommandItem
            title="Read generate and engine errors on the Settings tab, newest first."
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
