import { useEffect, useState } from 'react'
import { ErrorLogPanel } from '@/components/ErrorLogPanel'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  errorLogPath,
  libraryPath,
  pickDirectory,
  revealLibrary,
} from '@/lib/engine'
import { MAX_GENERATE_SECONDS, MIN_GENERATE_SECONDS, clampGenerateSeconds } from '@/lib/duration'
import { DEFAULT_LIBRARY_PLACEHOLDER, type KeepSettings } from '@/lib/types'
import { isTauri } from '@/lib/utils'

type SettingsPanelProps = {
  settings: KeepSettings
  onChange: (settings: KeepSettings) => void
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [logPath, setLogPath] = useState<string | null>(null)
  const [resolvedLibrary, setResolvedLibrary] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    void errorLogPath().then(setLogPath)
    void libraryPath().then(setResolvedLibrary)
  }, [])

  async function browseLibrary() {
    const picked = await pickDirectory(settings.libraryDir || resolvedLibrary || undefined)
    if (picked) onChange({ ...settings, libraryDir: picked })
  }

  const libraryValue = settings.libraryDir
  const libraryPlaceholder = resolvedLibrary ?? DEFAULT_LIBRARY_PLACEHOLDER

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col bg-leather" aria-label="Settings">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-6">
          <div>
            <Hint label="Local settings. Thunder FX does not add sliders that lower Medium quality.">
              <h2 className="font-display text-xl text-cream">Settings</h2>
            </Hint>
            <p className="mt-1 text-sm text-muted">
              Where generated sounds are stored, where exports prefer to go, and the error log.
            </p>
          </div>

          <div className="space-y-4">
            <Hint
              className="w-full flex-col"
              label="Folder where Generate writes WAV files. Empty uses the default under Local AppData."
            >
              <div className="w-full">
                <Label htmlFor="library-dir">Generated sounds folder</Label>
                <Input
                  id="library-dir"
                  className="mt-1 font-mono"
                  value={libraryValue}
                  onChange={(e) => onChange({ ...settings, libraryDir: e.target.value })}
                  placeholder={libraryPlaceholder}
                />
              </div>
            </Hint>
            {isTauri() ? (
              <div className="flex flex-wrap gap-2">
                <Hint label="Pick a folder in Explorer. New generations write WAV files there.">
                  <Button type="button" variant="outline" onClick={() => void browseLibrary()}>
                    Browse
                  </Button>
                </Hint>
                <Hint label="Reveal the generated-sounds folder in Explorer.">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void revealLibrary(settings.libraryDir || resolvedLibrary || undefined)}
                  >
                    Reveal folder
                  </Button>
                </Hint>
              </div>
            ) : (
              <p className="text-xs text-muted">
                Browser generations stay in IndexedDB. The desktop app writes WAV files to this folder
                ({DEFAULT_LIBRARY_PLACEHOLDER} by default).
              </p>
            )}

            <Hint
              className="w-full flex-col"
              label="Suggested folder for the native Save dialog when exporting a trim. Empty uses the last place you picked."
            >
              <div className="w-full">
                <Label htmlFor="export-dir">Default export folder</Label>
                <Input
                  id="export-dir"
                  className="mt-1 font-mono"
                  value={settings.defaultExportDir}
                  onChange={(e) => onChange({ ...settings, defaultExportDir: e.target.value })}
                  placeholder="Downloads (browser) or native dialog"
                />
              </div>
            </Hint>
          </div>

          <div className="space-y-4">
            <Hint
              className="w-full flex-col"
              label="Gated-repo token (hf_…). Used for model download and generation. Never sent anywhere except Hugging Face."
            >
              <div className="w-full">
                <Label htmlFor="hf-token">Hugging Face token (optional)</Label>
                <Input
                  id="hf-token"
                  className="mt-1"
                  type="password"
                  value={settings.hfToken}
                  onChange={(e) => onChange({ ...settings, hfToken: e.target.value })}
                  autoComplete="off"
                />
              </div>
            </Hint>
            <Hint
              className="w-full flex-col"
              label="Duration pre-filled in the prompt for new sound-effect generations. 0.5–380 seconds (Stable Audio 3 Medium max). Instrumental mode starts at 20s unless you already changed the slider."
            >
              <div className="w-full">
                <Label htmlFor="default-duration">Default duration (seconds)</Label>
                <Input
                  id="default-duration"
                  className="mt-1"
                  type="number"
                  min={MIN_GENERATE_SECONDS}
                  max={MAX_GENERATE_SECONDS}
                  step={0.5}
                  value={settings.defaultDuration}
                  onChange={(e) =>
                    onChange({ ...settings, defaultDuration: clampGenerateSeconds(Number(e.target.value) || 8) })
                  }
                />
              </div>
            </Hint>
          </div>

          <div>
            <Hint label="Where generation failures are appended, including Python tracebacks.">
              <Label>Error log path</Label>
            </Hint>
            <Hint className="mt-1 w-full" label="Full path of error.log on this machine.">
              <p className="w-full font-mono text-xs text-muted break-all">
                {logPath ?? '%LOCALAPPDATA%\\thunder-fx\\logs\\error.log'}
              </p>
            </Hint>
          </div>

          <ErrorLogPanel />
        </div>
      </ScrollArea>
    </section>
  )
}
