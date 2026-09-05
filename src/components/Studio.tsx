import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Altar } from '@/components/Altar'
import { CommandPalette } from '@/components/CommandPalette'
import { GrimoireRail, type PackExportRequest } from '@/components/GrimoireRail'
import { IncantationConsole } from '@/components/IncantationConsole'
import { PromptCatalogDialog } from '@/components/PromptCatalogDialog'
import { ScrollCanvas } from '@/components/ScrollCanvas'
import { SettingsPanel } from '@/components/SettingsPanel'
import { TakesGrid, type TakeCandidate } from '@/components/TakesGrid'
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
import {
  cancelGenerate,
  deleteDiskFile,
  engineStatus,
  exportClipFile,
  exportSoundPack,
  generate,
  loadModel,
  pickDirectory,
  reportError,
  setLibraryDir,
  unloadModel,
  writeEncodedFile,
} from '@/lib/engine'
import { copyFile, joinPath, tempDir, writeFileBytes, writeTextFile } from '@/lib/tauriFs'
import { randomSeed } from '@/lib/seed'
import type { AudioFormat, BitDepthOption, SampleRateOption } from '@/lib/audioExport'
import { formatNeedsDesktop, prepareExportWav, resolveDefaultFormat } from '@/lib/audioExport'
import { clipFilename, isUuidOrSymbol, promptName } from '@/lib/filename'
import { buildPackManifest, formatPackFilename } from '@/lib/packNaming'
import { detectSilenceBounds } from '@/lib/silenceTrim'
import { createAppLibrary } from '@/lib/library'
import { mockStatus } from '@/lib/mockEngine'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import { canCast } from '@/lib/prompt'
import {
  getCompletedSubcategoryCount,
  loadPromptCatalog,
  mergeQueue,
  removeFromQueue,
  type CatalogEffect,
} from '@/lib/promptCatalog'
import {
  FIXED_CFG,
  GENERATE_MODES,
  applyGenerateMode,
  applyModeDuration,
  applyModeNegative,
  applyModeSteps,
  clipMode,
  ensureTrackType,
  modeFromCatalog,
  modeSupportsSeamlessLoop,
  resolveGenerateMode,
} from '@/lib/generateMode'
import { loadQueue, loadSettings, saveQueue, saveSettings } from '@/lib/setup'
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
import { isTauri } from '@/lib/utils'

import { extractInstruments, musicWavInfo } from '@/lib/instruments'
import { downloadArrayBuffer, tagMusicWav, trimWav, wavDurationSeconds } from '@/lib/wav'

type PendingDelete = string | null

export function Studio() {
  const [settings, setSettings] = useState<KeepSettings>(loadSettings)
  const [mode, setMode] = useState<GenerateMode>(() => resolveGenerateMode(settings.generateMode))
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(() => {
    const initial = resolveGenerateMode(settings.generateMode)
    if (initial !== 'sfx' && settings.defaultDuration === GENERATE_MODES.sfx.defaultDuration) {
      return GENERATE_MODES[initial].defaultDuration
    }
    return settings.defaultDuration
  })
  const [steps, setSteps] = useState(() => settings.qualitySteps ?? 20)
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
  const [totalRites, setTotalRites] = useState(() => settings.qualitySteps ?? 20)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [weavePhase, setWeavePhase] = useState<WeavePhase>('weaving')

  const [weaveRatio, setWeaveRatio] = useState<number>()
  const [error, setError] = useState<string>()
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(8)
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(false)
  const [exportFmt, setExportFmt] = useState<AudioFormat>(() =>
    resolveDefaultFormat(settings.defaultExportFormat, isTauri()),
  )
  const [sampleRate, setSampleRate] = useState<SampleRateOption>(44100)
  const [bitDepth, setBitDepth] = useState<BitDepthOption>(16)
  const [mono, setMono] = useState(false)
  // Off by default: looping is a deliberate choice, not something a mode
  // switch turns on behind the user's back.
  const [generateSeamlessLoop, setGenerateSeamlessLoop] = useState(false)
  const [takes, setTakes] = useState<TakeCandidate[]>([])
  const [takesOpen, setTakesOpen] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [tab, setTab] = useState<KeepTab>('generate')
  const [commandOpen, setCommandOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [confirmDispel, setConfirmDispel] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [queue, setQueue] = useState<CatalogEffect[]>(loadQueue)
  const [timing, setTiming] = useState(loadTimingLog)
  const [queueRunning, setQueueRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const loadAbortRef = useRef<AbortController | null>(null)
  const weaveStartedRef = useRef(0)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const playRaf = useRef<number>(0)
  const queueRef = useRef(queue)
  const stopQueueRef = useRef(false)
  const timingRef = useRef(timing)
  const engineMockRef = useRef(false)
  const clipsRef = useRef(clips)
  const queueRunningRef = useRef(false)
  const queuedDuringRunRef = useRef(false)
  clipsRef.current = clips
  queueRunningRef.current = queueRunning

  const library = useMemo(
    () => createAppLibrary(() => settings.libraryDir, () => clipsRef.current),
    [settings.libraryDir],
  )

  const catalog = useMemo(() => loadPromptCatalog(), [])
  const completedSubcategoryCount = useMemo(
    () => getCompletedSubcategoryCount(clips, catalog),
    [clips, catalog],
  )
  // Lookups by id happen on every render and every selection; a linear scan
  // over a few thousand library clips adds up.
  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips])
  queueRef.current = queue
  timingRef.current = timing

  function updateQueue(next: CatalogEffect[]) {
    queueRef.current = next
    setQueue(next)
    saveQueue(next)
  }

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
  const activeClip = selectedId ? clipsById.get(selectedId) : undefined

  function rememberTiming(next: TimingLog) {
    timingRef.current = next
    saveTimingLog(next)
    setTiming(next)
  }

  function normalizeClip(clip: Clip): Clip {
    return isUuidOrSymbol(clip.prompt)
      ? { ...clip, prompt: promptName(clip.prompt, clip) }
      : clip
  }

  /**
   * Full rescan: walks and parses every WAV under the library folder. Cheap
   * enough on entering the Library tab, far too expensive to run after each
   * clip in a queue — see {@link addClipToLibraryList}.
   */
  async function refreshLibrary() {
    let loadedClips: Clip[] = []
    try {
      loadedClips = await library.list()
    } catch {
      loadedClips = []
    }
    setClips(loadedClips.map(normalizeClip))
  }

  /** Splices one freshly generated clip into the list, newest first. */
  function addClipToLibraryList(clip: Clip) {
    setClips((current) => {
      const normalized = normalizeClip(clip)
      const rest = current.filter((existing) => existing.id !== normalized.id)
      return [normalized, ...rest]
    })
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

  // The backend only reads and writes inside folders it knows about, so the
  // configured library folder has to be registered before the first scan.
  useEffect(() => {
    void setLibraryDir(settings.libraryDir).then(() => refreshLibrary())
  }, [settings.libraryDir])

  useEffect(() => {
    if (tab === 'library') {
      void refreshLibrary()
    }
  }, [tab])

  useEffect(() => {
    void refreshEngine()
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    const id = window.setInterval(() => {
      void refreshEngine()
    }, 4000)
    return () => window.clearInterval(id)
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

  // Held in a ref so the listener below can be registered once instead of on
  // every render — progress ticks re-render several times a second.
  const shortcutStateRef = useRef({ weaving, loadingModel, wav, clipDuration })
  shortcutStateRef.current = { weaving, loadingModel, wav, clipDuration }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { weaving, loadingModel, wav, clipDuration } = shortcutStateRef.current
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
      if (e.key === 'Escape') {
        if (weaving) {
          e.preventDefault()
          requestDispel()
        } else if (loadingModel) {
          e.preventDefault()
          cancelLoadWeights()
        }
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
  }, [])

  function cancelQueue() {
    stopQueueRef.current = true
    abortRef.current?.abort()
    void cancelGenerate()
    setQueueRunning(false)
    setWeaving(false)
    toast('Queue stopped. Remaining prompts preserved.')
  }

  function cancelLoadWeights() {
    loadAbortRef.current?.abort()
    void cancelGenerate()
    setLoadingModel(false)
  }

  function requestDispel() {
    stopQueueRef.current = true
    if (Date.now() - weaveStartedRef.current > 10_000) {
      setConfirmDispel(true)
      return
    }
    abortRef.current?.abort()
    void cancelGenerate()
    setQueueRunning(false)
  }

  function applyCatalogEffect(effect: CatalogEffect) {
    const next = modeFromCatalog(effect)
    setMode(next)
    setSettings((s) => ({ ...s, generateMode: next }))
    setPrompt(effect.prompt)
    setDuration(effect.duration)
    setNegative(effect.negative)
    if (!modeSupportsSeamlessLoop(next)) setGenerateSeamlessLoop(false)
  }

  async function getClipWav(id: string): Promise<ArrayBuffer | undefined> {
    return await library.getWav(id)
  }

  async function loadClip(id: string) {
    const buf = await getClipWav(id)
    if (!buf) {
      toast.error('Could not load audio file.', {
        description: 'The audio file was not found in storage.',
      })
      return
    }
    // A WAV the library scanner picked up may not be one we can decode (the
    // parser is 16-bit PCM only), so failure here has to stay a toast.
    let clipSeconds: number
    try {
      clipSeconds = wavDurationSeconds(buf)
    } catch (err) {
      const message = reportError(err, 'Unsupported audio file')
      toast.error('Could not open this clip.', {
        description: `${message} Thunder FX reads 16-bit PCM WAV files.`,
      })
      return
    }
    setSelectedId(id)
    setWav(buf)
    setTrimStart(0)
    setTrimEnd(clipSeconds)
    setPlayhead(0)
    const clip = clipsById.get(id)
    if (clip) {
      const properPrompt = isUuidOrSymbol(clip.prompt) ? promptName(clip.prompt, clip) : clip.prompt
      setPrompt(properPrompt)
      const next = clipMode(clip)
      if (next !== mode) {
        setNegative((n) => applyModeNegative(n, mode, next))
        setDuration((d) => applyModeDuration(d, mode, next))
        setSteps((s) => applyModeSteps(s, mode, next))
        if (!modeSupportsSeamlessLoop(next)) setGenerateSeamlessLoop(false)
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
    setSteps((s) => applyModeSteps(s, mode, next))
    if (!modeSupportsSeamlessLoop(next)) setGenerateSeamlessLoop(false)
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
    weaveStartedRef.current = started
    const controller = new AbortController()
    loadAbortRef.current = controller
    try {
      await loadModel(
        (ratio) => {
          setElapsedMs(Date.now() - started)
          setWeaveRatio(ratio)
          setWeavePhase('loading')
        },
        { signal: controller.signal, precision: settings.precision },
      )
      if (!engineMockRef.current) {
        rememberTiming(recordLoad(timingRef.current, Date.now() - started))
      }
      await refreshEngine()
      setEngine((current) => ({ ...current, loaded: true }))
      toast.success('Model ready.', { description: 'Generate will only create a clip.' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast('Model load cancelled.')
        return
      }
      const message = reportError(err, 'Model load failed')
      setError(message)
      toast.error('Model load failed.', { description: `${message} Saved to the error log.` })
    } finally {
      setLoadingModel(false)
      loadAbortRef.current = null
    }
  }

  async function unloadWeights() {
    if (loadingModel || weaving || !engine.loaded) return
    try {
      await unloadModel()
      await refreshEngine()
      setEngine((current) => ({ ...current, loaded: false }))
      toast.success('Model unloaded.', {
        description: 'GPU memory freed. Click Load model before generating.',
      })
    } catch (err) {
      const message = reportError(err, 'Model unload failed')
      setError(message)
      toast.error('Model unload failed.', { description: `${message} Saved to the error log.` })
    }
  }

  async function generateOne(
    request: {
      prompt: string
      seconds: number
      negative: string
      mode: GenerateMode
      steps?: number
      category?: string
      subcategory?: string
      intensity?: string
      seamlessLoop?: boolean
    },
    options: {
      manageBusy?: boolean
      setActiveClip?: boolean
      seed?: number
      onResult?: (clip: Clip, wav: ArrayBuffer) => void
    } = {},
  ): Promise<'ok' | 'abort' | 'error'> {
    const manageBusy = options.manageBusy ?? true
    const setActiveClip = options.setActiveClip ?? true
    const currentSteps = request.steps ?? steps
    setError(undefined)
    if (manageBusy) setWeaving(true)
    setRite(0)
    setTotalRites(currentSteps)
    setElapsedMs(0)
    setWeavePhase('weaving')
    setWeaveRatio(undefined)
    weaveStartedRef.current = Date.now()
    const controller = new AbortController()
    abortRef.current = controller
    const parsedSeed = options.seed ?? Number(seed)
    try {
      const result = await generate(
        {
          prompt: request.prompt,
          seconds: request.seconds,
          seed: Number.isFinite(parsedSeed) ? parsedSeed : -1,
          cfg: FIXED_CFG,
          steps: currentSteps,
          negative: request.negative,
          libraryDir: settings.libraryDir,
          mode: request.mode,
          category: request.category,
          subcategory: request.subcategory,
          intensity: request.intensity,
          seamlessLoop: Boolean(request.seamlessLoop),
        },
        {
          signal: controller.signal,
          stepDelayMs: 60,
          onProgress: (p) => {
            setRite(p.step)
            if (p.total) setTotalRites(p.total)
            setElapsedMs(p.elapsedMs)
            if (p.phase) setWeavePhase(p.phase)
            setWeaveRatio(p.ratio)
          },
        },
      )
      let finalClip = result.clip
      let finalWav = result.wav
      if (finalClip.mode === 'music' && !finalClip.instruments?.length) {
        const detected = extractInstruments(finalClip.prompt)
        if (detected.length) {
          finalClip = { ...finalClip, instruments: detected.slice(0, 3) }
          finalWav = tagMusicWav(
            finalWav,
            musicWavInfo(
              finalClip.prompt,
              finalClip.instruments,
              finalClip.category,
              finalClip.intensity,
            ),
          )
        }
      }
      if (!isTauri()) {
        await library.save(finalClip, finalWav)
      }
      options.onResult?.(finalClip, finalWav)
      addClipToLibraryList(finalClip)
      if (setActiveClip) {
        setSelectedId(finalClip.id)
        setWav(finalWav)
        setTrimStart(0)
        setTrimEnd(finalClip.duration)
        setPlayhead(0)
        setLooping(Boolean(request.seamlessLoop && modeSupportsSeamlessLoop(request.mode ?? 'sfx')))
      }
      if (!engineMockRef.current) {
        rememberTiming(
          recordGenerate(
            timingRef.current,
            request.seconds,
            Date.now() - weaveStartedRef.current,
            { steps: currentSteps, precision: settings.precision },
          ),
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
    setWav(undefined)
    setSelectedId(undefined)
    queuedDuringRunRef.current = false
    const requestPrompt = ensureTrackType(prompt, mode)
    const requestNegative = negative.trim() || GENERATE_MODES[mode].defaultNegative
    setPrompt(requestPrompt)
    if (!negative.trim() && requestNegative) setNegative(requestNegative)
    const outcome = await generateOne(
      {
        prompt: requestPrompt,
        seconds: duration,
        negative: requestNegative,
        mode,
        steps,
        seamlessLoop: modeSupportsSeamlessLoop(mode) && generateSeamlessLoop,
      },
      { setActiveClip: true },
    )
    // Prompts queued with "Queue next" while this generation ran are picked
    // up here so they keep generating without another click.
    if (
      outcome === 'ok' &&
      queuedDuringRunRef.current &&
      queueRef.current.length > 0 &&
      !queueRunningRef.current
    ) {
      void castQueue()
    }
  }

  function queueCurrentPrompt() {
    if (!canCast(prompt) || loadingModel || !engine.loaded) return
    const requestPrompt = ensureTrackType(prompt, mode)
    const requestNegative = negative.trim() || GENERATE_MODES[mode].defaultNegative
    const item: CatalogEffect = {
      id: `custom:${crypto.randomUUID()}`,
      library: mode === 'music' ? 'music' : mode === 'ambience' ? 'ambience' : 'fx',
      categoryId: 'custom',
      category: 'Custom',
      title: promptName(requestPrompt) || 'Custom prompt',
      prompt: requestPrompt,
      duration,
      negative: requestNegative,
    }
    queuedDuringRunRef.current = true
    updateQueue([...queueRef.current, item])
    toast('Added to queue.', { description: 'Generates automatically after the current run finishes.' })
  }

  async function castTakes() {
    if (!canCast(prompt) || weaving || loadingModel || !engine.loaded) return
    const requestPrompt = ensureTrackType(prompt, mode)
    const requestNegative = negative.trim() || GENERATE_MODES[mode].defaultNegative
    setPrompt(requestPrompt)
    if (!negative.trim() && requestNegative) setNegative(requestNegative)
    setTakes([])
    setTakesOpen(false)
    setWeaving(true)
    const collected: TakeCandidate[] = []
    try {
      for (let i = 0; i < 4; i += 1) {
        const seedValue = randomSeed()
        const outcome = await generateOne(
          {
            prompt: requestPrompt,
            seconds: duration,
            negative: requestNegative,
            mode,
            steps,
            seamlessLoop: modeSupportsSeamlessLoop(mode) && generateSeamlessLoop,
          },
          {
            manageBusy: false,
            setActiveClip: false,
            seed: seedValue,
            onResult: (clip, buf) => {
              collected.push({ clip, wav: buf })
            },
          },
        )
        if (outcome !== 'ok') break
      }
      if (collected.length) {
        setTakes(collected)
        setTakesOpen(true)
      }
    } finally {
      setWeaving(false)
    }
  }

  async function castQueue() {
    if (weaving || loadingModel || !engine.loaded || queueRef.current.length === 0) return
    setWav(undefined)
    setSelectedId(undefined)
    stopQueueRef.current = false
    setQueueRunning(true)
    setWeaving(true)
    let saved = 0
    try {
      while (queueRef.current.length > 0 && !stopQueueRef.current) {
        const item = queueRef.current[0]
        if (!item) break
        const nextMode = modeFromCatalog(item)
        applyCatalogEffect(item)
        const loop = modeSupportsSeamlessLoop(nextMode) && generateSeamlessLoop
        const outcome = await generateOne(
          {
            prompt: ensureTrackType(item.prompt, nextMode),
            seconds: item.duration,
            negative: item.negative.trim() || GENERATE_MODES[nextMode].defaultNegative,
            mode: nextMode,
            steps,
            category: item.category,
            subcategory: item.subcategory,
            intensity: item.intensity,
            seamlessLoop: loop,
          },
          { manageBusy: false, setActiveClip: false, seed: item.seed },
        )
        if (outcome !== 'ok') break
        const remaining = queueRef.current.filter((effect) => effect.id !== item.id)
        updateQueue(remaining)
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

  function prepareExportBuffer(): ArrayBuffer | undefined {
    if (!wav) return undefined
    const clip = selectedId ? clipsById.get(selectedId) : undefined
    const activePrompt = clip?.prompt ?? prompt
    const isMusic = clip ? clipMode(clip) === 'music' : mode === 'music' || activePrompt.toLowerCase().includes('tracktype: music')
    let exportBuf = trimWav(wav, trimStart, trimEnd)
    if (isMusic) {
      const detected = clip?.instruments?.length ? clip.instruments : extractInstruments(activePrompt)
      exportBuf = tagMusicWav(
        exportBuf,
        musicWavInfo(activePrompt, detected, clip?.category, clip?.intensity),
      )
    }
    return exportBuf
  }

  async function exportFormat(format: AudioFormat) {
    const exportBuf = prepareExportBuffer()
    if (!exportBuf) return
    if (formatNeedsDesktop(format) && !isTauri()) {
      toast(`${format.toUpperCase()} export needs the desktop app.`, {
        description: 'In the browser, export WAV. Compressed formats are available in the Windows app.',
      })
      return
    }
    const clip = selectedId ? clipsById.get(selectedId) : undefined
    const name = clipFilename(clip?.prompt ?? prompt, trimEnd - trimStart, format)
    try {
      const path = await exportClipFile({
        buffer: exportBuf,
        filename: name,
        format,
        sampleRate,
        bitDepth,
        mono,
        defaultDir: settings.defaultExportDir,
      })
      toast.success(`${format.toUpperCase()} saved.`, { description: path ?? name })
    } catch (err) {
      const message = reportError(err, 'Export failed')
      toast.error('Export failed.', { description: `${message} Saved to the error log.` })
    }
  }

  // Changing the default in Settings retargets the export panel right away
  // rather than waiting for the next launch.
  function applySettings(next: KeepSettings) {
    if (next.defaultExportFormat !== settings.defaultExportFormat) {
      setExportFmt(resolveDefaultFormat(next.defaultExportFormat, isTauri()))
    }
    setSettings(next)
  }

  async function exportSelectedFormat() {
    await exportFormat(exportFmt)
  }

  async function exportWav() {
    await exportFormat('wav')
  }

  async function exportOgg() {
    await exportFormat('ogg')
  }

  function autoTrimSilence() {
    if (!wav) return
    const bounds = detectSilenceBounds(wav)
    setTrimStart(bounds.startSec)
    setTrimEnd(Math.min(clipDuration, Math.max(bounds.endSec, bounds.startSec + 0.05)))
  }

  async function exportLibraryPack(request: PackExportRequest) {
    const selected = request.ids
      .map((id) => clipsById.get(id))
      .filter((clip): clip is Clip => Boolean(clip))
    if (!selected.length) return
    if (formatNeedsDesktop(request.format) && !isTauri()) {
      toast(`${request.format.toUpperCase()} export needs the desktop app.`)
      return
    }
    const files: { name: string; buffer: ArrayBuffer; clip: Clip }[] = []
    for (let i = 0; i < selected.length; i += 1) {
      const clip = selected[i]!
      const buf = await getClipWav(clip.id)
      if (!buf) continue
      const name = formatPackFilename(request.template, clip, i + 1, request.format)
      files.push({
        name,
        buffer: prepareExportWav(buf, {
          format: 'wav',
          sampleRate: 44100,
          bitDepth: 16,
          mono: false,
        }),
        clip,
      })
    }
    if (!files.length) {
      toast.error('Could not read the selected clips.')
      return
    }
    // Encoded files stay on disk and are copied or zipped from there, so the
    // bytes never make a round trip back through the webview.
    let encodedPaths: { path: string; name: string }[] = []
    if (request.format !== 'wav' && isTauri()) {
      const temp = await tempDir()
      const batch = crypto.randomUUID()
      for (const file of files) {
        const dest = joinPath(temp, `thunder-fx-pack-${batch}-${file.name}`)
        await writeEncodedFile({ buffer: file.buffer, path: dest, format: request.format })
        encodedPaths.push({ path: dest, name: file.name })
      }
    }
    const manifest = request.includeManifest
      ? buildPackManifest(files.map((file) => ({ filename: file.name, clip: file.clip })))
      : undefined
    try {
      if (request.zip) {
        const path = await exportSoundPack({
          files: files.map((file) => ({ name: file.name, buffer: file.buffer })),
          encodedFiles: encodedPaths,
          zipName: 'thunder-fx-pack.zip',
          manifest,
          defaultDir: settings.defaultExportDir,
        })
        toast.success('Sound pack saved.', { description: path ?? 'thunder-fx-pack.zip' })
        return
      }
      if (!isTauri()) {
        for (const file of files) {
          downloadArrayBuffer(file.buffer, file.name)
        }
        toast.success(`Saved ${files.length} files.`)
        return
      }
      const folder = await pickDirectory(settings.defaultExportDir)
      if (!folder) return
      if (encodedPaths.length) {
        for (const encoded of encodedPaths) {
          await copyFile(encoded.path, joinPath(folder, encoded.name))
        }
      } else {
        for (const file of files) {
          await writeFileBytes(joinPath(folder, file.name), file.buffer)
        }
      }
      if (manifest) {
        await writeTextFile(joinPath(folder, 'manifest.json'), manifest)
      }
      toast.success(`Saved ${files.length} files.`)
    } catch (err) {
      const message = reportError(err, 'Pack export failed')
      toast.error('Pack export failed.', { description: `${message} Saved to the error log.` })
    } finally {
      for (const encoded of encodedPaths) {
        await deleteDiskFile(encoded.path)
      }
      encodedPaths = []
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
        vramUsedGb={engine.vramUsedGb}
        vramTotalGb={engine.vramTotalGb}
        gpuName={engine.gpuName}
        gpuTempC={engine.gpuTempC}
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
          defaultFormat={exportFmt}
          onQuery={setQuery}
          onSelect={(id) => {
            void loadClip(id)
            setTab('generate')
          }}
          onStarter={(starter, starterMode) => {
            const next = starterMode ?? modeFromCatalog({ prompt: starter })
            if (next !== mode) {
              setNegative((n) => applyModeNegative(n, mode, next))
              setDuration((d) => applyModeDuration(d, mode, next))
              if (!modeSupportsSeamlessLoop(next)) setGenerateSeamlessLoop(false)
              setMode(next)
              setSettings((s) => ({ ...s, generateMode: next }))
            }
            setPrompt(starter)
            setTab('generate')
          }}
          onDelete={setPendingDelete}
          onModeChange={selectMode}
          onExportPack={(request) => void exportLibraryPack(request)}
          getWav={getClipWav}
        />
      ) : null}
      {tab === 'generate' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ScrollCanvas
              wav={wav}
              weaving={weaving}
              loadingModel={loadingModel}
              modelLoaded={engine.loaded}
              rite={rite}
              totalRites={totalRites}
              elapsedMs={elapsedMs}
              startedAt={weaveStartedRef.current}
              phase={weavePhase}
              ratio={weaveRatio}
              mode={mode}
              seed={activeClip?.seed}
              completedSubcategoryCount={completedSubcategoryCount}
              historicalEstimateMs={
                loadingModel
                  ? estimateLoadMs(timing, { precision: settings.precision, isMock: engine.mock })
                  : weaving
                    ? estimateGenerateMs(
                        timing,
                        queueRunning ? (queue[0]?.duration ?? duration) : duration,
                        {
                          steps,
                          precision: settings.precision,
                          isMock: engine.mock,
                        },
                      )
                    : undefined
              }
              queueTailEstimateMs={
                queueRunning && queue.length > 1
                  ? estimateQueueMs(timing, queue.slice(1), {
                      precision: settings.precision,
                      isMock: engine.mock,
                    })
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
              format={exportFmt}
              sampleRate={sampleRate}
              bitDepth={bitDepth}
              mono={mono}
              onPlay={togglePlay}
              onStop={() => {
                playbackRef.current?.stop()
                setPlaying(false)
                cancelAnimationFrame(playRaf.current)
              }}
              onLoop={setLooping}
              onTrimStart={(v) => setTrimStart(Math.max(0, Math.min(v, trimEnd - 0.05)))}
              onTrimEnd={(v) => setTrimEnd(Math.min(clipDuration, Math.max(v, trimStart + 0.05)))}
              onAutoTrim={autoTrimSilence}
              onFormat={setExportFmt}
              onSampleRate={setSampleRate}
              onBitDepth={setBitDepth}
              onMono={setMono}
              onExport={() => void exportSelectedFormat()}
              onExportFormat={(format) => void exportFormat(format)}
            />
          </div>
          <IncantationConsole
            className="shrink-0"
            mode={mode}
            prompt={prompt}
            duration={duration}
            steps={steps}
            negative={negative}
            seed={seed}
            ritesOpen={ritesOpen}
            weaving={weaving}
            loadingModel={loadingModel}
            modelLoaded={engine.loaded}
            engineReady={engine.ready}
            engineMessage={engine.message}
            queue={queue}
            queueRunning={queueRunning}
            onMode={selectMode}
            onPrompt={setPrompt}
            onDuration={setDuration}
            onSteps={setSteps}
            onNegative={setNegative}
            onSeed={setSeed}
            onRitesOpen={setRitesOpen}
            onCast={() => void cast()}
            onCastTakes={() => void castTakes()}
            onQueueCurrent={queueCurrentPrompt}
            onDispel={requestDispel}
            onLoadModel={() => void loadWeights()}
            onCancelLoadModel={cancelLoadWeights}
            onUnloadModel={() => void unloadWeights()}
            onOpenCatalog={() => setCatalogOpen(true)}
            onGenerateQueue={() => void castQueue()}

            onCancelQueue={cancelQueue}
            onClearQueue={() => updateQueue([])}
            onRemoveQueued={(id) => updateQueue(removeFromQueue(queueRef.current, id))}
            loadEstimateMs={estimateLoadMs(timing, { precision: settings.precision, isMock: engine.mock })}
            castEstimateMs={estimateGenerateMs(timing, duration, {
              steps,
              precision: settings.precision,
              isMock: engine.mock,
            })}
            queueEstimateMs={estimateQueueMs(timing, queue, {
              precision: settings.precision,
              isMock: engine.mock,
            })}
            clipEstimateMs={(seconds) =>
              estimateGenerateMs(timing, seconds, {
                steps,
                precision: settings.precision,
                isMock: engine.mock,
              })
            }
            generateSeamlessLoop={generateSeamlessLoop}
            onGenerateSeamlessLoop={setGenerateSeamlessLoop}
          />
        </div>
      ) : null}
      {tab === 'settings' ? (
        <SettingsPanel settings={settings} onChange={applySettings} />
      ) : null}
      <PromptCatalogDialog
        open={catalogOpen}
        catalog={catalog}
        onOpenChange={setCatalogOpen}
        onEnqueue={(effects) => {
          const next = mergeQueue(queueRef.current, effects)
          updateQueue(next)
        }}
        onUse={(effect) => {
          applyCatalogEffect(effect)
          setCatalogOpen(false)
        }}
      />
      <TakesGrid
        open={takesOpen}
        takes={takes}
        onOpenChange={setTakesOpen}
        onKeep={(ids) => {
          const kept = takes.filter((take) => ids.includes(take.clip.id))
          const last = kept.at(-1)
          if (last) {
            setSelectedId(last.clip.id)
            setWav(last.wav)
            setTrimStart(0)
            setTrimEnd(last.clip.duration)
            setPlayhead(0)
          }
        }}
        onDiscard={(ids) => {
          void (async () => {
            for (const id of ids) {
              await library.delete(id)
            }
            setTakes((prev) => prev.filter((take) => !ids.includes(take.clip.id)))
            await refreshLibrary()
          })()
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
        onAmbience={() => {
          setTab('generate')
          selectMode('ambience')
        }}
        onLoadModel={() => {
          setTab('generate')
          void loadWeights()
        }}
        onUnloadModel={() => {
          setTab('generate')
          void unloadWeights()
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
                  setQueueRunning(false)
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
