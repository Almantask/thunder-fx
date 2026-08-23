import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Altar } from '@/components/Altar'
import { CommandPalette } from '@/components/CommandPalette'
import { GrimoireRail } from '@/components/GrimoireRail'
import { IncantationConsole } from '@/components/IncantationConsole'
import { PromptCatalogDialog } from '@/components/PromptCatalogDialog'
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
import { cancelGenerate, engineStatus, exportClipFile, generate, loadModel, reportError } from '@/lib/engine'
import { clipFilename } from '@/lib/filename'
import { createIdbLibrary, createMemoryLibrary } from '@/lib/library'
import { mockStatus } from '@/lib/mockEngine'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import { canCast } from '@/lib/prompt'
import {
  loadPromptCatalog,
  mergeQueue,
  removeFromQueue,
  type CatalogEffect,
} from '@/lib/promptCatalog'
import {
  GENERATE_MODES,
  applyGenerateMode,
  applyModeDuration,
  applyModeNegative,
  clipMode,
  ensureTrackType,
  inferGenerateMode,
} from '@/lib/generateMode'
import { loadSettings, saveSettings } from '@/lib/setup'
import {
  estimateGenerateMs,
  estimateLoadMs,
  estimateQueueMs,
  loadTimingLog,
  recordGenerate,
  recordLoad,
  saveTimingLog,
  type TimingLog,
} from '@/lib/timing'
import type { Clip, EngineStatus, GenerateMode, KeepSettings, KeepTab, WeavePhase } from '@/lib/types'
import { TOTAL_RITES } from '@/lib/types'
import { isTauri } from '@/lib/utils'
import { trimWav, wavDurationSeconds } from '@/lib/wav'

const library =
  typeof indexedDB === 'undefined' ? createMemoryLibrary() : createIdbLibrary()

type PendingDelete = string | null

export function Studio() {
  const [settings, setSettings] = useState<KeepSettings>(loadSettings)
  const [mode, setMode] = useState<GenerateMode>(() =>
    settings.generateMode === 'music' ? 'music' : 'sfx',
  )
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(() => {
    if (mode === 'music' && settings.defaultDuration === GENERATE_MODES.sfx.defaultDuration) {
      return GENERATE_MODES.music.defaultDuration
    }
    return settings.defaultDuration
  })
  const [cfg, setCfg] = useState(1)
  const [negative, setNegative] = useState('')
  const [seed, setSeed] = useState('-1')
  const [ritesOpen, setRitesOpen] = useState(false)
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [wav, setWav] = useState<ArrayBuffer>()
  const [query, setQuery] = useState('')
  const [weaving, setWeaving] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [rite, setRite] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [weavePhase, setWeavePhase] = useState<WeavePhase>('weaving')
  const [weaveRatio, setWeaveRatio] = useState<number>()
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
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [queue, setQueue] = useState<CatalogEffect[]>([])
  const [timing, setTiming] = useState(loadTimingLog)
  const [queueRunning, setQueueRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const weaveStartedRef = useRef(0)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const playRaf = useRef<number>(0)
  const queueRef = useRef(queue)
  const stopQueueRef = useRef(false)
  const timingRef = useRef(timing)
  const engineMockRef = useRef(false)
  const catalog = useMemo(() => loadPromptCatalog(), [])
  queueRef.current = queue
  timingRef.current = timing

  const [engine, setEngine] = useState<EngineStatus>(() =>
    isTauri()
      ? {
          ready: false,
          mock: false,
          loaded: false,
          device: 'unknown',
          message: 'Checking engine…',
        }
      : mockStatus(),
  )
  engineMockRef.current = engine.mock
  const clipDuration = wav ? wavDurationSeconds(wav) : duration

  function rememberTiming(next: TimingLog) {
    timingRef.current = next
    saveTimingLog(next)
    setTiming(next)
  }

  async function refreshLibrary() {
    setClips(await library.list())
  }

  async function refreshEngine() {
    if (!isTauri()) return
    try {
      setEngine(await engineStatus())
    } catch (err: unknown) {
      const message = reportError(err, 'Engine status failed')
      setEngine({ ready: false, mock: true, loaded: false, device: 'unknown', message })
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
    cancelAnimationFrame(playRaf.current)
    setPlaying(false)
    playbackRef.current?.dispose()
    playbackRef.current = null
    if (!wav) return
    let cancelled = false
    void createPlayback(wav)
      .then((handle) => {
        if (cancelled) {
          handle.dispose()
          return
        }
        playbackRef.current = handle
      })
      .catch(() => {
        /* Preview is optional; generate already saved the clip. */
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(playRaf.current)
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
    stopQueueRef.current = true
    if (Date.now() - weaveStartedRef.current > 10_000) {
      setConfirmDispel(true)
      return
    }
    abortRef.current?.abort()
    void cancelGenerate()
  }

  function applyCatalogEffect(effect: CatalogEffect) {
    const next = inferGenerateMode(effect.prompt)
    setMode(next)
    setSettings((s) => ({ ...s, generateMode: next }))
    setPrompt(effect.prompt)
    setDuration(effect.duration)
    setNegative(effect.negative)
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
    if (clip) {
      setPrompt(clip.prompt)
      const next = clipMode(clip)
      if (next !== mode) {
        setNegative((n) => applyModeNegative(n, mode, next))
        setDuration((d) => applyModeDuration(d, mode, next))
        setMode(next)
        setSettings((s) => ({ ...s, generateMode: next }))
      }
    }
  }

  function selectMode(next: GenerateMode) {
    if (next === mode) return
    setPrompt((p) => applyGenerateMode(p, next))
    setNegative((n) => applyModeNegative(n, mode, next))
    setDuration((d) => applyModeDuration(d, mode, next))
    setMode(next)
    setSettings((s) => ({ ...s, generateMode: next }))
  }

  async function loadWeights() {
    if (loadingModel || weaving || engine.loaded) return
    setError(undefined)
    setLoadingModel(true)
    setRite(0)
    setElapsedMs(0)
    setWeavePhase('loading')
    setWeaveRatio(undefined)
    const started = Date.now()
    try {
      await loadModel((ratio) => {
        setElapsedMs(Date.now() - started)
        setWeaveRatio(ratio)
        setWeavePhase('loading')
      })
      if (!engineMockRef.current) {
        rememberTiming(recordLoad(timingRef.current, Date.now() - started))
      }
      await refreshEngine()
      setEngine((current) => ({ ...current, loaded: true }))
      toast.success('Model ready.', { description: 'Generate will only create a clip.' })
    } catch (err) {
      const message = reportError(err, 'Model load failed')
      setError(message)
      toast.error('Model load failed.', { description: `${message} Saved to the error log.` })
    } finally {
      setLoadingModel(false)
    }
  }

  async function generateOne(
    request: {
      prompt: string
      seconds: number
      negative: string
      mode: GenerateMode
      category?: string
      intensity?: string
    },
    options: { manageBusy?: boolean } = {},
  ): Promise<'ok' | 'abort' | 'error'> {
    const manageBusy = options.manageBusy ?? true
    setError(undefined)
    if (manageBusy) setWeaving(true)
    setRite(0)
    setElapsedMs(0)
    setWeavePhase('weaving')
    setWeaveRatio(undefined)
    weaveStartedRef.current = Date.now()
    const controller = new AbortController()
    abortRef.current = controller
    const parsedSeed = Number(seed)
    try {
      const result = await generate(
        {
          prompt: request.prompt,
          seconds: request.seconds,
          seed: Number.isFinite(parsedSeed) ? parsedSeed : -1,
          cfg,
          negative: request.negative,
          libraryDir: settings.libraryDir,
          mode: request.mode,
          category: request.category,
          intensity: request.intensity,
        },
        {
          signal: controller.signal,
          stepDelayMs: 180,
          onProgress: (p) => {
            setRite(p.step)
            setElapsedMs(p.elapsedMs)
            if (p.phase) setWeavePhase(p.phase)
            setWeaveRatio(p.ratio)
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
      if (!engineMockRef.current) {
        rememberTiming(
          recordGenerate(timingRef.current, request.seconds, Date.now() - weaveStartedRef.current),
        )
      }
      return 'ok'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast('Generation cancelled.')
        return 'abort'
      }
      const message = reportError(err, 'Generation failed')
      setError(message)
      toast.error('Generation failed.', { description: `${message} Saved to the error log.` })
      return 'error'
    } finally {
      if (manageBusy) setWeaving(false)
      abortRef.current = null
    }
  }

  async function cast() {
    if (!canCast(prompt) || weaving || loadingModel || !engine.loaded) return
    const requestPrompt = ensureTrackType(prompt, mode)
    const requestNegative = negative.trim() || GENERATE_MODES[mode].defaultNegative
    setPrompt(requestPrompt)
    if (!negative.trim() && requestNegative) setNegative(requestNegative)
    await generateOne({
      prompt: requestPrompt,
      seconds: duration,
      negative: requestNegative,
      mode,
    })
  }

  async function castQueue() {
    if (weaving || loadingModel || !engine.loaded || queueRef.current.length === 0) return
    stopQueueRef.current = false
    setQueueRunning(true)
    setWeaving(true)
    let saved = 0
    try {
      while (queueRef.current.length > 0 && !stopQueueRef.current) {
        const item = queueRef.current[0]
        if (!item) break
        const nextMode = inferGenerateMode(item.prompt)
        applyCatalogEffect(item)
        const outcome = await generateOne(
          {
            prompt: ensureTrackType(item.prompt, nextMode),
            seconds: item.duration,
            negative: item.negative.trim() || GENERATE_MODES[nextMode].defaultNegative,
            mode: nextMode,
            category: item.category,
            intensity: item.intensity,
          },
          { manageBusy: false },
        )
        if (outcome !== 'ok') break
        const remaining = queueRef.current.filter((effect) => effect.id !== item.id)
        queueRef.current = remaining
        setQueue(remaining)
        saved += 1
      }
      if (saved > 0 && queueRef.current.length === 0) {
        toast.success(saved === 1 ? 'Queue finished.' : `Queue finished. ${saved} clips saved.`)
      }
    } finally {
      setQueueRunning(false)
      setWeaving(false)
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
    const startAt = playhead >= trimEnd || playhead < trimStart ? trimStart : playhead
    void playbackRef.current?.play(trimStart, trimEnd, looping, startAt)
    setPlaying(true)
    cancelAnimationFrame(playRaf.current)
    const tick = () => {
      const t = playbackRef.current?.getCurrentTime() ?? trimStart
      setPlayhead(t)
      if (t >= trimEnd && !looping) {
        playbackRef.current?.stop()
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
      toast.success('WAV saved.', { description: path ?? name })
    } catch (err) {
      const message = reportError(err, 'Export failed')
      toast.error('Export failed.', { description: `${message} Saved to the error log.` })
    }
  }

  async function exportOgg() {
    if (!wav) return
    if (!isTauri()) {
      toast('OGG export needs the desktop app.', {
        description: 'In the browser, export WAV. OGG is available in the Windows app.',
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
      toast.success('OGG saved.', { description: path ?? name })
    } catch (err) {
      const message = reportError(err, 'OGG export failed')
      toast.error('Export failed.', { description: `${message} Saved to the error log.` })
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
        engineLabel={
          engine.mock ? 'mock engine' : engine.loaded ? engine.device : 'model not loaded'
        }
        weaving={weaving}
        loadingModel={loadingModel}
        weavePhase={weavePhase}
        tab={tab}
        onTabChange={setTab}
      />
      {error ? (
        <Hint className="w-full" label="This step failed. Open Settings for the traceback. The prompt is unchanged.">
          <div className="w-full border-b border-danger/40 bg-leather px-4 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        </Hint>
      ) : null}
      {tab === 'library' ? (
        <GrimoireRail
          clips={clips}
          selectedId={selectedId}
          query={query}
          mode={mode}
          onQuery={setQuery}
          onSelect={(id) => {
            void loadClip(id)
            setTab('generate')
          }}
          onStarter={(starter) => {
            const next = inferGenerateMode(starter)
            if (next !== mode) {
              setNegative((n) => applyModeNegative(n, mode, next))
              setDuration((d) => applyModeDuration(d, mode, next))
              setMode(next)
              setSettings((s) => ({ ...s, generateMode: next }))
            }
            setPrompt(starter)
            setTab('generate')
          }}
          onDelete={setPendingDelete}
          onModeChange={selectMode}
          getWav={(id) => library.getWav(id)}
        />
      ) : null}
      {tab === 'generate' ? (
        <>
          <div className="flex min-h-0 flex-1">
            <ScrollCanvas
              wav={wav}
              weaving={weaving}
              loadingModel={loadingModel}
              rite={rite}
              totalRites={TOTAL_RITES}
              elapsedMs={elapsedMs}
              phase={weavePhase}
              ratio={weaveRatio}
              historicalEstimateMs={
                loadingModel
                  ? estimateLoadMs(timing)
                  : weaving
                    ? estimateGenerateMs(
                        timing,
                        queueRunning ? (queue[0]?.duration ?? duration) : duration,
                      )
                    : undefined
              }
              queueTailEstimateMs={
                queueRunning && queue.length > 1
                  ? estimateQueueMs(timing, queue.slice(1))
                  : undefined
              }
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
              emptyLabel={GENERATE_MODES[mode].emptyWaveform}
            />
            <Altar
              hasClip={Boolean(wav)}
              weaving={weaving || loadingModel}
              playing={playing}
              looping={looping}
              trimStart={trimStart}
              trimEnd={trimEnd}
              duration={clipDuration}
              onPlay={togglePlay}
              onStop={() => {
                playbackRef.current?.stop()
                setPlaying(false)
                cancelAnimationFrame(playRaf.current)
              }}
              onLoop={setLooping}
              onTrimStart={(v) => setTrimStart(Math.max(0, Math.min(v, trimEnd - 0.05)))}
              onTrimEnd={(v) => setTrimEnd(Math.min(clipDuration, Math.max(v, trimStart + 0.05)))}
              onExportWav={() => void exportWav()}
              onExportOgg={() => void exportOgg()}
            />
          </div>
          <IncantationConsole
            mode={mode}
            prompt={prompt}
            duration={duration}
            cfg={cfg}
            negative={negative}
            seed={seed}
            ritesOpen={ritesOpen}
            weaving={weaving}
            loadingModel={loadingModel}
            modelLoaded={engine.loaded}
            engineReady={engine.ready}
            engineMessage={engine.message}
            queue={queue}
            onMode={selectMode}
            onPrompt={setPrompt}
            onDuration={setDuration}
            onCfg={setCfg}
            onNegative={setNegative}
            onSeed={setSeed}
            onRitesOpen={setRitesOpen}
            onCast={() => void cast()}
            onDispel={requestDispel}
            onLoadModel={() => void loadWeights()}
            onOpenCatalog={() => setCatalogOpen(true)}
            onGenerateQueue={() => void castQueue()}
            onClearQueue={() => {
              queueRef.current = []
              setQueue([])
            }}
            onRemoveQueued={(id) => {
              const remaining = removeFromQueue(queueRef.current, id)
              queueRef.current = remaining
              setQueue(remaining)
            }}
            loadEstimateMs={estimateLoadMs(timing)}
            castEstimateMs={estimateGenerateMs(timing, duration)}
            queueEstimateMs={estimateQueueMs(timing, queue)}
            clipEstimateMs={(seconds) => estimateGenerateMs(timing, seconds)}
          />
        </>
      ) : null}
      {tab === 'settings' ? <SettingsPanel settings={settings} onChange={setSettings} /> : null}
      <PromptCatalogDialog
        open={catalogOpen}
        catalog={catalog}
        onOpenChange={setCatalogOpen}
        onEnqueue={(effects) => {
          const next = mergeQueue(queueRef.current, effects)
          queueRef.current = next
          setQueue(next)
        }}
        onUse={(effect) => {
          applyCatalogEffect(effect)
          setCatalogOpen(false)
        }}
      />
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
          window.setTimeout(() => document.getElementById('prompt')?.focus(), 0)
        }}
        onOpenLogs={() => setTab('settings')}
        onOpenLibrary={() => setTab('library')}
        onOpenGenerate={() => setTab('generate')}
        onOpenSettings={() => setTab('settings')}
        onInstrumental={() => {
          setTab('generate')
          selectMode('music')
        }}
        onLoadModel={() => {
          setTab('generate')
          void loadWeights()
        }}
        onPromptCatalog={() => {
          setTab('generate')
          setCatalogOpen(true)
        }}
        onGenerateQueue={() => {
          setTab('generate')
          void castQueue()
        }}
      />
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <Hint label="Confirm before deleting a library clip.">
              <AlertDialogTitle>Delete this sound?</AlertDialogTitle>
            </Hint>
            <Hint label="The WAV is deleted from the local library. Export copies on disk are left alone.">
              <AlertDialogDescription>
                The clip will be removed from the library. This cannot be undone.
              </AlertDialogDescription>
            </Hint>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Hint label="Leave this clip in the library.">
              <AlertDialogCancel>Keep</AlertDialogCancel>
            </Hint>
            <Hint label="Delete this clip from the local library. The WAV file is removed.">
              <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
            </Hint>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDispel} onOpenChange={setConfirmDispel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <Hint label="Cancel only if you want to stop GPU work. Continuing lets the model finish.">
              <AlertDialogTitle>Cancel generation?</AlertDialogTitle>
            </Hint>
            <Hint label="Shown when a generation has already run more than ten seconds, so a misclick is costly.">
              <AlertDialogDescription>
                More than ten seconds have already been spent on this generation.
              </AlertDialogDescription>
            </Hint>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Hint label="Let the model finish this generation.">
              <AlertDialogCancel>Keep generating</AlertDialogCancel>
            </Hint>
            <Hint label="Cancel generation. GPU work stops; no new clip is saved.">
              <AlertDialogAction
                onClick={() => {
                  stopQueueRef.current = true
                  abortRef.current?.abort()
                  void cancelGenerate()
                  setConfirmDispel(false)
                }}
              >
                Cancel
              </AlertDialogAction>
            </Hint>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
