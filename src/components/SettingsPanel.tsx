import { useEffect, useState } from 'react'
import { ErrorLogPanel } from '@/components/ErrorLogPanel'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AUDIO_FORMATS,
  formatLabel,
  formatNeedsDesktop,
  formatNote,
  type AudioFormat,
} from '@/lib/audioExport'
import {
  errorLogPath,
  libraryPath,
  pickDirectory,
  revealLibrary,
} from '@/lib/engine'
import { MAX_GENERATE_SECONDS, MIN_GENERATE_SECONDS, clampGenerateSeconds } from '@/lib/duration'
import { PRESET_ORDER, QUALITY_PRESETS } from '@/lib/qualityPreset'
import { DEFAULT_LIBRARY_PLACEHOLDER, type KeepSettings } from '@/lib/types'
import { APP_VERSION } from '@/lib/buildInfo'
import {
  checkForUpdates,
  downloadAndInstall,
  relaunchApp,
  type UpdateState,
} from '@/lib/updater'
import { cn, isTauri } from '@/lib/utils'

type SettingsPanelProps = {
  settings: KeepSettings
  onChange: (settings: KeepSettings) => void
  /** Whether the medium-base weights Max quality needs are already on disk. */
  baseModelReady?: boolean
  onInstallBaseModel?: () => void
  installingBaseModel?: boolean
}

export function SettingsPanel({
  settings,
  onChange,
  baseModelReady,
  onInstallBaseModel,
  installingBaseModel = false,
}: SettingsPanelProps) {
  const [logPath, setLogPath] = useState<string | null>(null)
  const [resolvedLibrary, setResolvedLibrary] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    if (!isTauri()) return
    void errorLogPath().then(setLogPath)
    void libraryPath().then(setResolvedLibrary)
  }, [])

  async function browseLibrary() {
    const picked = await pickDirectory(settings.libraryDir || resolvedLibrary || undefined)
    if (picked) onChange({ ...settings, libraryDir: picked })
  }

  async function runUpdateCheck() {
    setUpdate({ status: 'checking' })
    setUpdate(await checkForUpdates())
  }

  /**
   * Installs in place, then waits for the user to relaunch. Restarting on its
   * own would kill a generation that is still running behind this panel.
   */
  async function runUpdateInstall(version: string) {
    setUpdate({ status: 'downloading', version })
    const result = await downloadAndInstall((ratio) =>
      setUpdate({ status: 'downloading', version, ratio }),
    )
    setUpdate(result)
  }

  const libraryValue = settings.libraryDir
  const libraryPlaceholder = resolvedLibrary ?? DEFAULT_LIBRARY_PLACEHOLDER

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col bg-leather" aria-label="Settings">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-6">
          <div>
            <Hint label="Local settings. Quality is picked with a preset, which chooses the sampler and checkpoint rather than just a step count.">
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

            <Hint
              className="w-full flex-col"
              label="Format pre-selected on the export panel and the sound-pack dialog. Generation always masters to WAV; this is what that master is written out as. Opus is the default: transparent quality at roughly a third of an MP3 320."
            >
              <div className="w-full">
                <Label htmlFor="default-export-format">Default audio format</Label>
                <select
                  id="default-export-format"
                  className="mt-1 h-9 w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather-2 px-2 font-mono text-sm text-cream"
                  value={settings.defaultExportFormat}
                  onChange={(e) =>
                    onChange({ ...settings, defaultExportFormat: e.target.value as AudioFormat })
                  }
                >
                  {AUDIO_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {formatLabel(format)}
                      {!isTauri() && formatNeedsDesktop(format) ? ' (desktop only)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </Hint>
            <p className="text-xs text-muted">
              {formatNote(settings.defaultExportFormat)}
              {formatNeedsDesktop(settings.defaultExportFormat) && !isTauri()
                ? ` ${formatLabel(settings.defaultExportFormat)} needs the desktop app; exports in the browser fall back to WAV.`
                : ''}
            </p>
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
              label="Duration pre-filled for new sound-effect generations. 0.5–380 seconds (Stable Audio 3 Medium max). Ambience starts at 30s and Instrumental at 20s unless you already changed the slider."
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
            <Hint
              className="w-full flex-col"
              label="Starting step count for the Advanced slider, which only takes effect on the Custom preset. The three presets above choose their own step count together with a sampler that suits it."
            >
              <div className="w-full">
                <Label htmlFor="default-quality-steps">Default quality steps</Label>
                <Input
                  id="default-quality-steps"
                  className="mt-1"
                  type="number"
                  min={4}
                  max={50}
                  step={1}
                  value={settings.qualitySteps ?? 20}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      qualitySteps: Math.max(4, Math.min(50, Number(e.target.value) || 20)),
                    })
                  }
                />
              </div>
            </Hint>
          </div>

          <div className="space-y-3">
            <Hint label="Which preset new generations start on. You can still switch per clip or per queue run on Generate.">
              <h3 className="font-display text-sm tracking-[0.16em] text-muted">DEFAULT QUALITY</h3>
            </Hint>
            <div
              role="radiogroup"
              aria-label="Default quality preset"
              className="inline-flex h-8 items-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather-2 p-0.5"
            >
              {PRESET_ORDER.map((id) => {
                const spec = id === 'custom' ? null : QUALITY_PRESETS[id]
                if (!spec) return null
                const selected = settings.defaultPreset === id
                return (
                  <Hint key={id} label={spec.hint}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={cn(
                        'inline-flex h-7 items-center justify-center rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors hover:text-cream',
                        selected &&
                          'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] font-medium text-cream',
                      )}
                      onClick={() => onChange({ ...settings, defaultPreset: id })}
                    >
                      {spec.label}
                    </button>
                  </Hint>
                )
              })}
            </div>
            <p className="text-xs text-muted">
              Steps alone are not the quality dial. Medium is a distilled checkpoint sampled with pingpong,
              which re-noises on every step, so a higher step count there adds invented detail rather than
              detail that was there — and a deterministic sampler averages its texture away, which sounds
              muffled and flat. Real headroom comes from the un-distilled Medium-Base checkpoint, which Max
              quality uses; it is also the only mode where the negative prompt does anything.
            </p>
            {baseModelReady === false ? (
              <div className="rounded-book border border-[color-mix(in_srgb,var(--color-gold)_28%,transparent)] bg-leather-2 p-3">
                <p className="text-xs text-muted">
                  Max quality needs <span className="font-mono">medium-base</span>, which is not downloaded
                  yet (about 9 GB; it shares Medium's text encoder, so Medium must already be
                  installed). Until it is, selecting Max quality for sound effects or ambience refuses
                  to generate rather than quietly running something else — substituting is what made
                  earlier takes sound muffled and flat. Instrumental is unaffected: it measured better on
                  Medium anyway, so Max quality keeps it there and needs no download.
                </p>
                <Button
                  type="button"
                  className="mt-2"
                  size="sm"
                  disabled={installingBaseModel}
                  onClick={() => onInstallBaseModel?.()}
                >
                  {installingBaseModel ? 'Downloading…' : 'Download Medium-Base'}
                </Button>
              </div>
            ) : baseModelReady ? (
              <p className="text-xs text-muted">
                <span className="font-mono">medium-base</span> is installed, so Max quality runs the
                un-distilled checkpoint with real guidance.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <Hint label="FP32 is full quality. FP16 cuts the model footprint roughly in half for 4–6 GB GPUs. Unload and Load model after changing this.">
              <h3 className="font-display text-sm tracking-[0.16em] text-muted">PRECISION</h3>
            </Hint>
            <div
              role="radiogroup"
              aria-label="Precision mode"
              className="inline-flex h-8 items-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather-2 p-0.5"
            >
              <Hint label="Full float32 weights. Roughly double the VRAM, and the worker turns off chunked decode, so long clips need far more headroom.">
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.precision !== 'fp16'}
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors hover:text-cream',
                    settings.precision !== 'fp16' &&
                      'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] font-medium text-cream',
                  )}
                  onClick={() => onChange({ ...settings, precision: 'fp32' })}
                >
                  FP32
                </button>
              </Hint>
              <Hint label="Half precision (fp16/bf16). About 2.8 GB of weights, and what Stable Audio 3 ships as its own default. Unload, then Load model to apply.">
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.precision === 'fp16'}
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors hover:text-cream',
                    settings.precision === 'fp16' &&
                      'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] font-medium text-cream',
                  )}
                  onClick={() => onChange({ ...settings, precision: 'fp16' })}
                >
                  FP16 / BF16
                </button>
              </Hint>
            </div>
            <p className="text-xs text-muted">
              Low VRAM mode also uses chunked decode on long clips. Unload the model, then Load model to apply a
              precision change.
            </p>
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

          <div className="space-y-3">
            <Hint label="The version running now, and whether a newer signed installer is published.">
              <h3 className="font-display text-sm tracking-[0.16em] text-muted">UPDATES</h3>
            </Hint>
            <p className="font-mono text-xs text-muted">Thunder FX {APP_VERSION}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Hint label="Ask the release channel whether a newer version is published. Nothing is downloaded yet.">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={update.status === 'checking' || update.status === 'downloading'}
                  onClick={() => void runUpdateCheck()}
                >
                  {update.status === 'checking' ? 'Checking…' : 'Check for updates'}
                </Button>
              </Hint>
              {update.status === 'available' ? (
                <Hint label="Download and install the update. Thunder FX keeps running until you restart it.">
                  <Button type="button" size="sm" onClick={() => void runUpdateInstall(update.version)}>
                    Install {update.version}
                  </Button>
                </Hint>
              ) : null}
              {update.status === 'ready' ? (
                <Hint label="Restart into the new version. Finish anything still generating first.">
                  <Button type="button" size="sm" onClick={() => void relaunchApp()}>
                    Restart to finish
                  </Button>
                </Hint>
              ) : null}
            </div>
            {update.status === 'current' ? (
              <p className="text-xs text-muted">Thunder FX is up to date.</p>
            ) : null}
            {update.status === 'unsupported' ? (
              <p className="text-xs text-muted">{update.reason}</p>
            ) : null}
            {update.status === 'available' ? (
              <p className="text-xs text-muted">
                Version {update.version} is available.
                {update.date ? ` Published ${update.date}.` : ''}
                {update.notes ? ` ${update.notes}` : ''}
              </p>
            ) : null}
            {update.status === 'downloading' ? (
              <p className="text-xs text-muted" role="status">
                Downloading {update.version}
                {typeof update.ratio === 'number' ? ` — ${Math.round(update.ratio * 100)}%` : '…'}
              </p>
            ) : null}
            {update.status === 'ready' ? (
              <p className="text-xs text-muted">
                Version {update.version} is installed and applies on restart.
              </p>
            ) : null}
            {update.status === 'failed' ? (
              <p className="text-xs text-danger" role="alert">
                Update check failed. {update.message}
              </p>
            ) : null}
          </div>

          <ErrorLogPanel />
        </div>
      </ScrollArea>
    </section>
  )
}
