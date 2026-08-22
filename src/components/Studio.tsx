import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Altar } from '@/components/Altar'
import { CommandPalette } from '@/components/CommandPalette'
import { GrimoireRail } from '@/components/GrimoireRail'
import { IncantationConsole } from '@/components/IncantationConsole'
import { ScrollCanvas } from '@/components/ScrollCanvas'
import { SettingsPanel } from '@/components/SettingsPanel'
import { Titlebar } from '@/components/Titlebar'
import { Hint } from '@/components/Hint'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cancelGenerate, engineStatus, exportClipFile, generate, reportError } from '@/lib/engine'
import { clipFilename } from '@/lib/filename'
import { createIdbLibrary, createMemoryLibrary } from '@/lib/library'
import { mockStatus } from '@/lib/mockEngine'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import { appendChip, canCast } from '@/lib/prompt'
import { loadSettings, saveSettings } from '@/lib/setup'
import type { Clip, EngineStatus, KeepSettings, KeepTab } from '@/lib/types'
import { TOTAL_RITES } from '@/lib/types'
import { isTauri } from '@/lib/utils'
import { trimWav, wavDurationSeconds } from '@/lib/wav'

const library =
  typeof indexedDB === 'undefined' ? createMemoryLibrary() : createIdbLibrary()

type PendingDelete = string | null

export function Studio() {
  const [settings, setSettings] = useState<KeepSettings>(loadSettings)
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(settings.defaultDuration)
  const [cfg, setCfg] = useState(1)
  const [negative, setNegative] = useState('')
  const [seed, setSeed] = useState('-1')
  const [ritesOpen, setRitesOpen] = useState(false)
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [wav, setWav] = useState<ArrayBuffer>()
  const [query, setQuery] = useState('')
  const [weaving, setWeaving] = useState(false)
  const [rite, setRite] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string>()
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(8)
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [tab, setTab] = useState<KeepTab>('generate')
  const [commandOpen, setCommandOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [confirmDispel, setConfirmDispel] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const weaveStartedRef = useRef(0)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const playRaf = useRef<number>(0)

  const [engine, setEngine] = useState<EngineStatus>(mockStatus)
  const clipDuration = wav ? wavDurationSeconds(wav) : duration

  async function refreshLibrary() {
    setClips(await library.list())
  }

  async function refreshEngine() {
    if (!isTauri()) return
    try {
      setEngine(await engineStatus())
    } catch (err: unknown) {
      const message = reportError(err, 'Engine status failed')
      setEngine({ ready: false, mock: true, device: 'unknown', message })
    }
  }

  useEffect(() => {
    void refreshLibrary()
  }, [])

  useEffect(() => {
    void refreshEngine()
  }, [])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    playbackRef.current?.dispose()
    playbackRef.current = null
    if (!wav) return
    let cancelled = false
    void createPlayback(wav).then((handle) => {
      if (cancelled) {
        handle.dispose()
        return
      }
      playbackRef.current = handle
    })
    return () => {
      cancelled = true
      playbackRef.current?.dispose()
      playbackRef.current = null
    }
  }, [wav])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
      if (e.key === 'Escape' && weaving) {
        e.preventDefault()
        requestDispel()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        exportWav()
      }
      if (!typing && e.key === ' ' && wav) {
        e.preventDefault()
        togglePlay()
      }
      if (!typing && e.key === '[' && wav) {
        setTrimStart((s) => Math.max(0, s - 0.05))
      }
      if (!typing && e.key === ']' && wav) {
        setTrimEnd((s) => Math.min(clipDuration, s + 0.05))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function requestDispel() {
    if (Date.now() - weaveStartedRef.current > 10_000) {
      setConfirmDispel(true)
      return
    }
    abortRef.current?.abort()
    void cancelGenerate()
  }

  async function loadClip(id: string) {
    const buf = await library.getWav(id)
    if (!buf) return
    setSelectedId(id)
    setWav(buf)
    const d = wavDurationSeconds(buf)
    setTrimStart(0)
    setTrimEnd(d)
    setPlayhead(0)
    const clip = clips.find((c) => c.id === id)
    if (clip) setPrompt(clip.prompt)
  }

  async function cast() {
    if (!canCast(prompt) || weaving) return
    setError(undefined)
    setWeaving(true)
    setRite(0)
    setElapsedMs(0)
    weaveStartedRef.current = Date.now()
    const controller = new AbortController()
    abortRef.current = controller
    const parsedSeed = Number(seed)
    try {
      const result = await generate(
        {
          prompt,
          seconds: duration,
          seed: Number.isFinite(parsedSeed) ? parsedSeed : -1,
          cfg,
          negative,
          libraryDir: settings.libraryDir,
        },
        {
          signal: controller.signal,
          stepDelayMs: 180,
          onProgress: (p) => {
            setRite(p.step)
            setElapsedMs(p.elapsedMs)
          },
        },
      )
      await library.save(result.clip, result.wav)
      await refreshLibrary()
      setSelectedId(result.clip.id)
      setWav(result.wav)
      setTrimStart(0)
      setTrimEnd(result.clip.duration)
      setPlayhead(0)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast('The weave was dispelled.')
      } else {
        const message = reportError(err, 'Cast failed')
        setError(message)
        toast.error('The omen soured.', { description: `${message} Saved to the error log.` })
      }
    } finally {
      setWeaving(false)
      abortRef.current = null
    }
  }

  function togglePlay() {
    if (!wav) return
    if (playing) {
      playbackRef.current?.stop()
      setPlaying(false)
      cancelAnimationFrame(playRaf.current)
      return
    }
    void playbackRef.current?.play(trimStart, trimEnd, looping)
    setPlaying(true)
    const tick = () => {
      const t = playbackRef.current?.getCurrentTime() ?? trimStart
      setPlayhead(t)
      if (t >= trimEnd && !looping) {
        setPlaying(false)
        return
      }
      playRaf.current = requestAnimationFrame(tick)
    }
    playRaf.current = requestAnimationFrame(tick)
  }

  async function exportWav() {
    if (!wav) return
    const clip = clips.find((c) => c.id === selectedId)
    const name = clipFilename(clip?.prompt ?? prompt, trimEnd - trimStart, 'wav')
    try {
      const path = await exportClipFile({
        buffer: trimWav(wav, trimStart, trimEnd),
        filename: name,
        format: 'wav',
        defaultDir: settings.defaultExportDir,
      })
      toast.success('WAV scribed.', { description: path ?? name })
    } catch (err) {
      const message = reportError(err, 'Export failed')
      toast.error('The omen soured.', { description: `${message} Saved to the error log.` })
    }
  }

  async function exportOgg() {
    if (!wav) return
    if (!isTauri()) {
      toast('OGG Vorbis needs the desktop sidecar.', {
        description: 'soundfile encodes OGG from the Tauri keep. Export WAV here.',
      })
      return
    }
    const clip = clips.find((c) => c.id === selectedId)
    const name = clipFilename(clip?.prompt ?? prompt, trimEnd - trimStart, 'ogg')
    try {
      const path = await exportClipFile({
        buffer: trimWav(wav, trimStart, trimEnd),
        filename: name,
        format: 'ogg',
        defaultDir: settings.defaultExportDir,
      })
      toast.success('OGG scribed.', { description: path ?? name })
    } catch (err) {
      const message = reportError(err, 'OGG export failed')
      toast.error('The omen soured.', { description: `${message} Saved to the error log.` })
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await library.delete(pendingDelete)
    if (selectedId === pendingDelete) {
      setSelectedId(undefined)
      setWav(undefined)
    }
    setPendingDelete(null)
    await refreshLibrary()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Titlebar
        engineLabel={engine.mock ? 'mock brazier' : engine.device}
        weaving={weaving}
        tab={tab}
        onTabChange={setTab}
      />
      {error ? (
        <Hint className="w-full" label="This Cast failed. Open Settings for the traceback. The incantation is still in the parchment.">
          <div className="w-full border-b border-danger/40 bg-leather px-4 py-2 text-sm text-danger" role="alert">
            The omen soured. {error}
          </div>
        </Hint>
      ) : null}
      {tab === 'library' ? (
        <GrimoireRail
          clips={clips}
          selectedId={selectedId}
          query={query}
          onQuery={setQuery}
          onSelect={(id) => {
            void loadClip(id)
            setTab('generate')
          }}
          onStarter={(prompt) => {
            setPrompt(prompt)
            setTab('generate')
          }}
          onDelete={setPendingDelete}
        />
      ) : null}
      {tab === 'generate' ? (
        <>
          <div className="flex min-h-0 flex-1">
            <ScrollCanvas
              wav={wav}
              weaving={weaving}
              rite={rite}
              totalRites={TOTAL_RITES}
              elapsedMs={elapsedMs}
              duration={clipDuration}
              trimStart={trimStart}
              trimEnd={Math.min(trimEnd, clipDuration)}
              playhead={playhead}
              onTrim={(s, e) => {
                setTrimStart(s)
                setTrimEnd(e)
              }}
              onSeek={(s) => {
                setPlayhead(s)
                playbackRef.current?.seek(s)
              }}
            />
            <Altar
              hasClip={Boolean(wav)}
              weaving={weaving}
              playing={playing}
              looping={looping}
              trimStart={trimStart}
              trimEnd={trimEnd}
              duration={clipDuration}
              onPlay={togglePlay}
              onStop={() => {
                playbackRef.current?.stop()
                setPlaying(false)
              }}
              onLoop={setLooping}
              onTrimStart={(v) => setTrimStart(Math.max(0, Math.min(v, trimEnd - 0.05)))}
              onTrimEnd={(v) => setTrimEnd(Math.min(clipDuration, Math.max(v, trimStart + 0.05)))}
              onExportWav={() => void exportWav()}
              onExportOgg={() => void exportOgg()}
            />
          </div>
          <IncantationConsole
            prompt={prompt}
            duration={duration}
            cfg={cfg}
            negative={negative}
            seed={seed}
            ritesOpen={ritesOpen}
            weaving={weaving}
            onPrompt={setPrompt}
            onDuration={setDuration}
            onCfg={setCfg}
            onNegative={setNegative}
            onSeed={setSeed}
            onRitesOpen={setRitesOpen}
            onChip={(chip) => setPrompt((p) => appendChip(p, chip))}
            onCast={() => void cast()}
            onDispel={requestDispel}
          />
        </>
      ) : null}
      {tab === 'settings' ? <SettingsPanel settings={settings} onChange={setSettings} /> : null}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onCast={() => {
          setTab('generate')
          void cast()
        }}
        onExportWav={() => void exportWav()}
        onExportOgg={() => void exportOgg()}
        onFocusPrompt={() => {
          setTab('generate')
          window.setTimeout(() => document.getElementById('incantation')?.focus(), 0)
        }}
        onOpenLogs={() => setTab('settings')}
        onOpenLibrary={() => setTab('library')}
        onOpenGenerate={() => setTab('generate')}
        onOpenSettings={() => setTab('settings')}
      />
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <Hint label="Confirm before deleting a Grimoire page.">
              <AlertDialogTitle>Strike this page?</AlertDialogTitle>
            </Hint>
            <Hint label="The WAV is deleted from the local library. Export copies on disk are left alone.">
              <AlertDialogDescription>
                The clip will be removed from the Grimoire. This cannot be undone.
              </AlertDialogDescription>
            </Hint>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Hint label="Leave this page in the Grimoire.">
              <AlertDialogCancel>Keep it</AlertDialogCancel>
            </Hint>
            <Hint label="Delete this weave from the local library. The WAV file is removed.">
              <AlertDialogAction onClick={() => void confirmDelete()}>Strike</AlertDialogAction>
            </Hint>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDispel} onOpenChange={setConfirmDispel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <Hint label="Cancel only if you want to stop GPU work. Continuing lets Medium finish.">
              <AlertDialogTitle>Dispel a long weave?</AlertDialogTitle>
            </Hint>
            <Hint label="Shown when a Cast has already run more than ten seconds, so a misclick is costly.">
              <AlertDialogDescription>
                More than ten seconds have already been spent on this Cast.
              </AlertDialogDescription>
            </Hint>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Hint label="Let Medium finish this Cast.">
              <AlertDialogCancel>Continue weaving</AlertDialogCancel>
            </Hint>
            <Hint label="Cancel the weave. GPU work stops; no new clip is saved.">
              <AlertDialogAction
                onClick={() => {
                  abortRef.current?.abort()
                  void cancelGenerate()
                  setConfirmDispel(false)
                }}
              >
                Dispel
              </AlertDialogAction>
            </Hint>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
