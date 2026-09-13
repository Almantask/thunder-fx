import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Altar } from '@/components/Altar'
import { ClipDetailsDialog } from '@/components/ClipDetailsDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { CompareDialog, type CompareSide } from '@/components/CompareDialog'
import { ShapePanel } from '@/components/ShapePanel'
import { TrashDialog } from '@/components/TrashDialog'
import { GrimoireRail, type PackExportRequest } from '@/components/GrimoireRail'
import { IncantationConsole } from '@/components/IncantationConsole'
import { PromptCatalogDialog } from '@/components/PromptCatalogDialog'
import { ScrollCanvas } from '@/components/ScrollCanvas'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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
  logClientError,
  pickDirectory,
  reportError,
  setLibraryDir,
  sweepDiskTrash,
  unloadModel,
  writeEncodedFile,
} from '@/lib/engine'
import { copyFile, joinPath, moveFile, tempDir, writeFileBytes, writeTextFile } from '@/lib/tauriFs'
import { deriveTakeSeed, resolveSeed } from '@/lib/seed'
import {
  BASE_MODEL,
  resolvePresetPlan,
  resolveQualityPreset,
  type QualityPreset,
} from '@/lib/qualityPreset'
import type { AudioFormat, BitDepthOption, SampleRateOption } from '@/lib/audioExport'
import {
  defaultBitrateKbps,
  formatNeedsDesktop,
  needsBitrate,
  prepareExportWav,
  resolveDefaultFormat,
} from '@/lib/audioExport'
import {
  clipFilename,
  isUuidOrSymbol,
  promptName,
  replacePathStem,
  sanitizeClipStem,
} from '@/lib/filename'
import {
  EMPTY_FILTER,
  clipDisplayName,
  forgetMeta,
  getMeta,
  pruneMissingMeta,
  renameMeta,
  setRating as setClipRating,
  tagCounts,
  toggleFavorite as toggleClipFavorite,
  toggleRejected as toggleClipRejected,
  type ClipMetaIndex,
  type LibraryFilter,
} from '@/lib/clipMeta'
import { createClipMetaStore } from '@/lib/clipMetaStore'
import { SidecarCorruptError } from '@/lib/sidecarFile'
import { createDiskTrash, createMemoryTrash, type TrashEntry } from '@/lib/trash'
import {
  applyFade,
  applyGainDb,
  normalizePeak,
  pitchShiftWav,
  reverseWav,
  variantSemitones,
  variantSuffix,
} from '@/lib/audioEdit'
import { buildPackManifest, formatPackFilename } from '@/lib/packNaming'
import { detectSilenceBounds } from '@/lib/silenceTrim'
import { createAppLibrary } from '@/lib/library'
import { mockStatus } from '@/lib/mockEngine'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import { canCast } from '@/lib/prompt'
import {
  enrichClipTaxonomy,
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
  getMeasuredPhaseModel,
  loadTimingLog,
  recordGenerate,
  recordLoad,
  saveTimingLog,
  type TimingLog,
} from '@/lib/timing'
import {
  liveRemainingMs,
  runMeasurements,
  startRun,
  trackRun,
  type RunTrack,
} from '@/lib/runTiming'
import { phaseStepMs, type QueueCostItem } from '@/lib/perfBenchmarks'
import type { Clip, EngineStatus, GenerateMode, KeepSettings, KeepTab, WeaveUiState } from '@/lib/types'
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
  const [weave, setWeave] = useState<WeaveUiState>(() => ({
    rite: 0,
    totalRites: settings.qualitySteps ?? 20,
    elapsedMs: 0,
    phase: 'weaving',
  }))
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
  const [bitrateKbps, setBitrateKbps] = useState(() =>
    defaultBitrateKbps(resolveDefaultFormat(settings.defaultExportFormat, isTauri())),
  )
  const [vorbisQuality, setVorbisQuality] = useState(() => settings.defaultVorbisQuality)
  // Off by default: looping is a deliberate choice, not something a mode
  // switch turns on behind the user's back.
  const [generateSeamlessLoop, setGenerateSeamlessLoop] = useState(false)
  const [preset, setPreset] = useState<QualityPreset>(() =>
    resolveQualityPreset(settings.defaultPreset),
  )
  // Forces one queue run onto a single preset; null runs each item as queued.
  const [queuePreset, setQueuePreset] = useState<QualityPreset | null>(null)
  const [installingBase, setInstallingBase] = useState(false)
  const [takes, setTakes] = useState<TakeCandidate[]>([])
  const [takesParentSeed, setTakesParentSeed] = useState<number>()
  const [takesOpen, setTakesOpen] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [tab, setTab] = useState<KeepTab>('generate')
  const [commandOpen, setCommandOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [meta, setMeta] = useState<ClipMetaIndex>({})
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>(EMPTY_FILTER)
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([])
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashBusy, setTrashBusy] = useState(false)
  const [detailsFor, setDetailsFor] = useState<{ id: string; focus: 'name' | 'tags' } | null>(null)
  const [detailsBusy, setDetailsBusy] = useState(false)
  const [compare, setCompare] = useState<{ a: CompareSide; b: CompareSide } | null>(null)
  // Buffers as they were before each Shape edit. Nothing is written to disk
  // until Save, so this is the whole undo history for the working clip.
  const [editStack, setEditStack] = useState<ArrayBuffer[]>([])
  const [savingEdits, setSavingEdits] = useState(false)
  const [confirmDispel, setConfirmDispel] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [queue, setQueue] = useState<CatalogEffect[]>(loadQueue)
  const [timing, setTiming] = useState(loadTimingLog)
  const [queueRunning, setQueueRunning] = useState(false)
  const [weaveStalled, setWeaveStalled] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const loadAbortRef = useRef<AbortController | null>(null)
  const weaveStartedRef = useRef(0)
  // The run in flight, so the countdown can be recomputed from its real pace on
  // every repaint rather than only when a progress event arrives.
  const runRef = useRef<RunTrack | null>(null)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const playRaf = useRef<number>(0)
  const queueRef = useRef(queue)
  const stopQueueRef = useRef(false)
  const timingRef = useRef(timing)
  const engineMockRef = useRef(false)
  const clipsRef = useRef(clips)
  const queueRunningRef = useRef(false)
  const queueWarningsRef = useRef(new Map<string, number>())
  const queuedDuringRunRef = useRef(false)
  clipsRef.current = clips
  queueRunningRef.current = queueRunning

  const library = useMemo(
    () => createAppLibrary(() => settings.libraryDir, () => clipsRef.current),
    [settings.libraryDir],
  )

  const metaStore = useMemo(
    () => createClipMetaStore(() => settings.libraryDir),
    [settings.libraryDir],
  )

  // Disk moves the WAV into `<library>/.trash`; the browser build holds the
  // IndexedDB bytes for the session instead. Both restore the same way.
  const trashStore = useMemo(
    () =>
      isTauri()
        ? createDiskTrash(() => settings.libraryDir)
        : createMemoryTrash({
            getWav: (id) => library.getWav(id),
            restoreClip: (clip, wav) => library.save(clip, wav),
            removeClip: (id) => library.delete(id),
          }),
    [settings.libraryDir, library],
  )

  const catalog = useMemo(() => loadPromptCatalog(), [])
  const completedSubcategoryCount = useMemo(
    () => getCompletedSubcategoryCount(clips, catalog),
    [clips, catalog],
  )
  // Lookups by id happen on every render and every selection; a linear scan
  // over a few thousand library clips adds up.
  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips])
  // Studio re-renders several times a second while a generation runs, so the
  // tag scan has to be memoized or it walks the whole index on every tick.
  const tagSuggestions = useMemo(() => tagCounts(meta).map((row) => row.tag), [meta])
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
  const weavingRef = useRef(false)
  const loadingModelRef = useRef(false)
  const engineLoadedRef = useRef(false)
  engineMockRef.current = engine.mock
  weavingRef.current = weaving
  loadingModelRef.current = loadingModel
  engineLoadedRef.current = engine.loaded
  const clipDuration = useMemo(() => (wav ? wavDurationSeconds(wav) : duration), [wav, duration])
  const activeClip = selectedId ? clipsById.get(selectedId) : undefined

  // The steps slider no longer drives generation on its own, so time estimates
  // have to read the preset's effective step count and guidance instead. Both
  // matter: Max quality runs 50 steps at CFG 4, and guidance above 1 runs a
  // doubled batch, so pricing it off the slider understated it several times over.
  const activePresetPlan = resolvePresetPlan(preset, {
    steps,
    mode,
    baseAvailable: engine.baseModelReady,
  })
  const effectiveSteps = activePresetPlan.steps

  /**
   * Price a queued item on the preset it will actually run under, which is not
   * always the console's: an item carries the preset it was queued with, and a
   * queue run can pin one over the top. Estimating them all at the console's
   * settings is how a queue of Max quality beds got quoted at Balanced speed.
   */
  function queueCostItems(items: CatalogEffect[]): QueueCostItem[] {
    return items.map((item) => {
      const plan = resolvePresetPlan(queuePreset ?? item.preset ?? preset, {
        steps,
        mode: modeFromCatalog(item),
        baseAvailable: engine.baseModelReady,
      })
      return { duration: item.duration, steps: plan.steps, cfg: plan.cfg }
    })
  }

  // What the run in flight is actually doing, so its estimate is not read off
  // the console while a queue item with different settings is on the GPU.
  const runningItem = queueRunning ? queue[0] : undefined
  const runningPlan = runningItem
    ? resolvePresetPlan(queuePreset ?? runningItem.preset ?? preset, {
        steps,
        mode: modeFromCatalog(runningItem),
        baseAvailable: engine.baseModelReady,
      })
    : activePresetPlan
  const runningSeconds = runningItem?.duration ?? duration
  const runCostOptions = {
    steps: runningPlan.steps,
    cfg: runningPlan.cfg,
    precision: settings.precision,
    isMock: engine.mock,
  }
  const runHistoricalEstimateMs = loadingModel
    ? estimateLoadMs(timing, {
        precision: settings.precision,
        model: activePresetPlan.model,
        isMock: engine.mock,
      })
    : weaving
      ? estimateGenerateMs(timing, runningSeconds, runCostOptions)
      : undefined
  const runQueueTailMs =
    queueRunning && queue.length > 1
      ? estimateQueueMs(timing, queueCostItems(queue.slice(1)), {
          precision: settings.precision,
          isMock: engine.mock,
        })
      : undefined
  // This machine's calibrated per-step and per-tail costs. The live estimator
  // blends them with the pace the current run is actually holding.
  const runCostModel = getMeasuredPhaseModel(timing, runCostOptions)

  function remainingAt(now: number): number | undefined {
    return liveRemainingMs(runRef.current, {
      now,
      model: runCostModel,
      historicalTotalMs: runHistoricalEstimateMs,
      queueTailMs: runQueueTailMs,
    })
  }

  function rememberTiming(next: TimingLog) {
    timingRef.current = next
    saveTimingLog(next)
    setTiming(next)
  }

  function normalizeClip(clip: Clip): Clip {
    const named = isUuidOrSymbol(clip.prompt)
      ? { ...clip, prompt: promptName(clip.prompt, clip) }
      : clip
    return enrichClipTaxonomy(named)
  }

  /**
   * Full rescan: walks and parses every WAV under the library folder. Cheap
   * enough on entering the Library tab, far too expensive to run after each
   * clip in a queue — see {@link addClipToLibraryList}.
   */
  async function refreshLibrary(fromMeta?: ClipMetaIndex) {
    let loadedClips: Clip[] = []
    let scanned = false
    try {
      loadedClips = await library.list()
      scanned = true
    } catch (err) {
      const message = reportError(err, 'Could not scan the library')
      toast.error('Could not scan the library.', {
        description: [message, settings.libraryDir.trim() || undefined].filter(Boolean).join('\n'),
      })
      loadedClips = []
    }
    const normalized = loadedClips.map(normalizeClip)
    setClips(normalized)
    if (!scanned) return
    let trashIds: string[] = []
    try {
      trashIds = (await trashStore.list()).map((entry) => entry.id)
    } catch {
      // An unreadable trash index still lets the library list render.
      trashIds = []
    }
    const liveIds = normalized.map((clip) => clip.id)
    setMeta((current) => {
      const { index, removed } = pruneMissingMeta(fromMeta ?? current, liveIds, trashIds)
      if (!removed) return fromMeta ?? current
      void metaStore.save(index).catch((err: unknown) => {
        reportError(err, 'Could not save clip metadata')
      })
      void logClientError(`Pruned ${removed} metadata row(s) whose audio is gone`)
      return index
    })
  }

  /** Splices one freshly generated clip into the list, newest first. */
  function addClipToLibraryList(clip: Clip) {
    setClips((current) => {
      const normalized = normalizeClip(clip)
      const rest = current.filter((existing) => existing.id !== normalized.id)
      return [normalized, ...rest]
    })
  }

  /** Writes through on every change; the sidecar is small and rewritten whole. */
  function updateMeta(next: ClipMetaIndex) {
    setMeta(next)
    void metaStore.save(next).catch((err: unknown) => {
      const message = reportError(err, 'Could not save clip metadata')
      toast.error('Could not save that change.', { description: message })
    })
  }

  async function refreshTrash() {
    try {
      setTrashEntries(await trashStore.list())
    } catch (err) {
      reportError(err, 'Could not list trash')
      setTrashEntries([])
    }
  }

  /**
   * Moves the clip aside rather than destroying it, and offers the undo right
   * there — a library clip can be minutes of GPU time.
   */
  async function trashClip(id: string) {
    const clip = clipsById.get(id)
    if (!clip) return
    const row = getMeta(meta, id)
    try {
      const entry = await trashStore.trash(clip, Object.keys(row).length ? row : undefined)
      if (!entry) {
        // Nothing to move aside (no path, or no audio held): fall back to the
        // old behaviour rather than silently leaving the clip in place.
        await library.delete(id)
      } else {
        updateMeta(forgetMeta(meta, id))
        toast('Moved to trash.', {
          description: clipDisplayName(clip, meta),
          action: { label: 'Undo', onClick: () => void restoreFromTrash(id) },
        })
      }
    } catch (err) {
      const message = reportError(err, 'Delete failed')
      toast.error('Could not delete that clip.', { description: message })
      return
    }
    if (selectedId === id) {
      setSelectedId(undefined)
      setWav(undefined)
      setEditStack([])
    }
    await refreshLibrary()
    await refreshTrash()
  }

  async function restoreFromTrash(id: string) {
    setTrashBusy(true)
    try {
      const entry = await trashStore.restore(id)
      if (!entry) {
        toast.error('Could not restore that clip.', {
          description: 'Its audio is no longer where the trash recorded it.',
        })
        return
      }
      if (entry.meta) updateMeta({ ...meta, [entry.id]: entry.meta })
      toast.success('Restored.', { description: clipDisplayName(entry.clip, meta) })
      await refreshLibrary()
      await refreshTrash()
    } catch (err) {
      const message = reportError(err, 'Restore failed')
      toast.error('Could not restore that clip.', { description: message })
    } finally {
      setTrashBusy(false)
    }
  }

  async function purgeFromTrash(id: string) {
    setTrashBusy(true)
    try {
      await trashStore.purge(id)
      await refreshTrash()
    } finally {
      setTrashBusy(false)
    }
  }

  async function emptyTrash() {
    setTrashBusy(true)
    try {
      await trashStore.empty()
      await refreshTrash()
      toast('Trash emptied.')
    } finally {
      setTrashBusy(false)
    }
  }

  /**
   * Renames the WAV on disk, because the clip id *is* the file stem — so the
   * metadata row has to move with it or the clip loses its rating and tags.
   */
  async function renameClip(id: string, name: string, tags: string[]) {
    const clip = clipsById.get(id)
    if (!clip) return
    const stem = sanitizeClipStem(name)
    if (!stem) {
      toast.error('That name has no characters a filename can use.')
      return
    }
    setDetailsBusy(true)
    try {
      let nextId = id
      if (isTauri() && clip.path) {
        const destination = replacePathStem(clip.path, stem)
        if (destination !== clip.path) {
          await moveFile(clip.path, destination)
          nextId = stem
        }
      }
      let next = renameMeta(meta, id, nextId, name.trim())
      const current = getMeta(next, nextId)
      next = {
        ...next,
        [nextId]: { ...current, tags: tags.length ? [...tags].sort() : undefined },
      }
      if (!tags.length && !current.favorite && !current.rejected && !current.rating && !name.trim()) {
        delete next[nextId]
      }
      updateMeta(next)
      if (selectedId === id) setSelectedId(nextId)
      setDetailsFor(null)
      await refreshLibrary()
    } catch (err) {
      const message = reportError(err, 'Rename failed')
      toast.error('Could not rename that clip.', {
        description: `${message} A clip with that name may already exist.`,
      })
    } finally {
      setDetailsBusy(false)
    }
  }

  async function openCompare(ids: [string, string]) {
    const [firstId, secondId] = ids
    const first = clipsById.get(firstId)
    const second = clipsById.get(secondId)
    if (!first || !second) return
    const [firstWav, secondWav] = await Promise.all([getClipWav(firstId), getClipWav(secondId)])
    if (!firstWav || !secondWav) {
      toast.error('Could not load both clips to compare.')
      return
    }
    setCompare({
      a: { id: firstId, name: clipDisplayName(first, meta), wav: firstWav },
      b: { id: secondId, name: clipDisplayName(second, meta), wav: secondWav },
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
    void metaStore.load().then((loaded) => {
      setMeta(loaded)
      void refreshLibrary(loaded)
    }).catch((err: unknown) => {
      if (err instanceof SidecarCorruptError) {
        toast.error('Clip metadata file is unreadable.', {
          description: err.message,
          action: {
            label: 'Start fresh',
            onClick: () => {
              metaStore.acknowledgeCorrupt()
              setMeta({})
            },
          },
        })
        return
      }
      reportError(err, 'Could not load clip metadata')
    })
    void refreshTrash()
    if (isTauri()) {
      void sweepDiskTrash(settings.libraryDir)
        .then(() => refreshTrash())
        .catch((err: unknown) => {
          reportError(err, 'Could not sweep expired trash')
        })
    }
    return () => {
      void metaStore.flush()
    }
  }, [metaStore, trashStore])

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
    let cancelled = false
    let timer = 0

    function delayMs(): number {
      if (weavingRef.current || loadingModelRef.current) return 30_000
      if (typeof document !== 'undefined' && document.hasFocus() && engineLoadedRef.current) {
        return 4_000
      }
      return 20_000
    }

    async function tick() {
      if (cancelled) return
      const busy = weavingRef.current || loadingModelRef.current
      if (!busy) {
        await refreshEngine()
      }
      if (cancelled) return
      timer = window.setTimeout(() => {
        void tick()
      }, delayMs())
    }

    void tick()
    const onFocusChange = () => {
      window.clearTimeout(timer)
      void tick()
    }
    window.addEventListener('focus', onFocusChange)
    window.addEventListener('blur', onFocusChange)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('focus', onFocusChange)
      window.removeEventListener('blur', onFocusChange)
    }
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
    setEditStack([])
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
    setWeave((current) => ({
      ...current,
      rite: 0,
      elapsedMs: 0,
      phase: 'loading',
      ratio: undefined,
    }))
    const started = Date.now()
    weaveStartedRef.current = started
    runRef.current = startRun('load', { at: started })
    const controller = new AbortController()
    loadAbortRef.current = controller
    try {
      await loadModel(
        (ratio) => {
          const now = Date.now()
          runRef.current = trackRun(runRef.current, { ratio, phase: 'loading' }, now, {
            kind: 'load',
            startedAt: started,
          })
          setWeave((current) => ({
            ...current,
            elapsedMs: now - started,
            phase: 'loading',
            ratio,
          }))
        },
        { signal: controller.signal, precision: settings.precision },
      )
      if (!engineMockRef.current) {
        // Tagged with what was loaded: fp32 is a longer wait than fp16, and
        // Medium-Base is a different download again, so an untagged average of
        // the three predicts none of them.
        rememberTiming(
          recordLoad(timingRef.current, Date.now() - started, {
            precision: settings.precision,
            model: activePresetPlan.model,
          }),
        )
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
      runRef.current = null
    }
  }

  /**
   * Pull down the un-distilled medium-base checkpoint that Max quality wants.
   * It is a separate multi-GB download, so it is opt-in from Settings rather
   * than something a first Max quality generation silently starts.
   */
  async function installBaseModel() {
    if (installingBase || loadingModel || weaving) return
    setInstallingBase(true)
    const started = Date.now()
    try {
      await loadModel(
        (ratio) => {
          setWeave((current) => ({
            ...current,
            elapsedMs: Date.now() - started,
            phase: 'loading',
            ratio,
          }))
        },
        { precision: settings.precision, model: BASE_MODEL },
      )
      await refreshEngine()
      setEngine((current) => ({ ...current, loaded: true, baseModelReady: true }))
      toast.success('Medium-Base installed.', {
        description: 'Max quality now runs the un-distilled checkpoint, so negative prompts work.',
      })
    } catch (err) {
      const message = reportError(err, 'Medium-Base download failed')
      setError(message)
      toast.error('Medium-Base download failed.', {
        description: `${message} Saved to the error log.`,
      })
    } finally {
      setInstallingBase(false)
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

  function noteWarnings(warnings: string[]) {
    if (!warnings.length) return
    if (queueRunningRef.current) {
      for (const warning of warnings) {
        queueWarningsRef.current.set(warning, (queueWarningsRef.current.get(warning) ?? 0) + 1)
      }
      return
    }
    for (const warning of warnings) {
      toast('Heads up', { description: warning })
    }
  }

  function flushQueueWarnings() {
    const rows = [...queueWarningsRef.current.entries()]
    queueWarningsRef.current.clear()
    if (!rows.length) return
    const total = rows.reduce((sum, [, count]) => sum + count, 0)
    const summary = rows
      .map(([warning, count]) => (count > 1 ? `${warning} (×${count})` : warning))
      .join('\n')
    toast('Heads up', {
      description: `${total} warning${total === 1 ? '' : 's'} during this queue.\n${summary}`,
    })
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
      preset?: QualityPreset
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
    setWeaveStalled(false)
    // What the engine will actually run. A named preset owns its step count and
    // guidance, so the slider is only consulted for Custom -- estimating and
    // recording off the slider logged 8-step samples for 20-step runs.
    const runPlan = resolvePresetPlan(request.preset ?? preset, {
      steps: request.steps ?? steps,
      mode: request.mode,
      baseAvailable: engine.baseModelReady,
    })
    const currentSteps = runPlan.steps
    setError(undefined)
    if (manageBusy) setWeaving(true)
    setWeave({
      rite: 0,
      totalRites: currentSteps,
      elapsedMs: 0,
      phase: 'weaving',
    })
    const startedAt = Date.now()
    weaveStartedRef.current = startedAt
    runRef.current = startRun('generate', {
      at: startedAt,
      seconds: request.seconds,
      totalSteps: currentSteps,
    })
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
          preset: request.preset ?? preset,
        },
        {
          signal: controller.signal,
          stepDelayMs: 60,
          onProgress: (p) => {
            runRef.current = trackRun(runRef.current, p, Date.now(), {
              kind: 'generate',
              startedAt,
              seconds: request.seconds,
              totalSteps: currentSteps,
            })
            setWeaveStalled(false)
            setWeave({
              rite: p.step,
              totalRites: p.total || currentSteps,
              elapsedMs: p.elapsedMs,
              phase: p.phase ?? 'weaving',
              ratio: p.ratio,
            })
          },
          onStall: () => {
            setWeaveStalled(true)
            toast('Generation looks stalled.', {
              description: 'No progress from the worker. Cancel if it does not resume.',
              action: {
                label: 'Cancel',
                onClick: () => requestDispel(),
              },
            })
          },
          expectedStepMs: phaseStepMs(
            getMeasuredPhaseModel(timingRef.current, {
              steps: currentSteps,
              precision: settings.precision,
              cfg: runPlan.cfg,
            }),
            request.seconds,
          ),
        },
      )
      let finalClip = result.clip
      let finalWav = result.wav
      noteWarnings(result.warnings ?? [])
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
        setEditStack([])
        setTrimStart(0)
        setTrimEnd(finalClip.duration)
        setPlayhead(0)
        setLooping(Boolean(request.seamlessLoop && modeSupportsSeamlessLoop(request.mode ?? 'sfx')))
      }
      if (!engineMockRef.current) {
        const finishedAt = Date.now()
        const run = runRef.current
        // A run that had to swap checkpoints first is not a sample of what
        // generating costs -- the load would be folded into every later
        // estimate for a clip of this length.
        const includedLoad = Boolean(run?.sawLoading)
        const measured = run && !includedLoad ? runMeasurements(run, finishedAt) : {}
        if (!includedLoad) {
          rememberTiming(
            recordGenerate(
              timingRef.current,
              request.seconds,
              finishedAt - weaveStartedRef.current,
              {
                steps: finalClip.steps ?? currentSteps,
                precision: settings.precision,
                cfg: runPlan.cfg,
                peakVramGb: result.peakVramGb,
                ...measured,
                at: finishedAt,
              },
            ),
          )
        }
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
      runRef.current = null
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
        preset,
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
      preset,
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
    setTakesParentSeed(undefined)
    setTakesOpen(false)
    setWeaving(true)
    const collected: TakeCandidate[] = []
    const parsedParent = Number(seed)
    const parentSeed = resolveSeed(Number.isFinite(parsedParent) ? parsedParent : -1)
    try {
      for (let i = 0; i < 4; i += 1) {
        const seedValue = deriveTakeSeed(parentSeed, i)
        const outcome = await generateOne(
          {
            prompt: requestPrompt,
            seconds: duration,
            negative: requestNegative,
            mode,
            steps,
            preset,
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
        setTakesParentSeed(parentSeed)
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
            preset: queuePreset ?? item.preset ?? preset,
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
      flushQueueWarnings()
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
        bitrateKbps: needsBitrate(format) ? bitrateKbps : undefined,
        vorbisQuality: format === 'ogg' ? vorbisQuality : undefined,
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
      const format = resolveDefaultFormat(next.defaultExportFormat, isTauri())
      setExportFmt(format)
      if (needsBitrate(format)) {
        setBitrateKbps(format === 'opus' ? next.defaultOpusBitrateKbps : next.defaultMp3BitrateKbps)
      }
      if (format === 'ogg') setVorbisQuality(next.defaultVorbisQuality)
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

  /**
   * Applies a Shape transform to the working buffer.
   *
   * The previous buffer is pushed onto the undo stack rather than written
   * anywhere, so playback and export follow the edit immediately while the
   * library file stays as generated until Save.
   */
  function applyEdit(transform: (buffer: ArrayBuffer) => ArrayBuffer, label: string) {
    if (!wav) return
    try {
      const before = wavDurationSeconds(wav)
      const next = transform(wav)
      if (next === wav) {
        toast(`Nothing to change for ${label}.`)
        return
      }
      const after = wavDurationSeconds(next)
      setEditStack((stack) => [...stack, wav])
      setWav(next)
      // Only a transform that changes the length invalidates the trim; a gain
      // or fade should leave the markers where they were put.
      if (Math.abs(after - before) > 0.001) {
        setTrimStart(0)
        setTrimEnd(after)
        setPlayhead(0)
      } else {
        setTrimEnd((end) => Math.min(end, after))
      }
    } catch (err) {
      const message = reportError(err, `${label} failed`)
      toast.error(`Could not apply ${label}.`, { description: message })
    }
  }

  function undoEdit() {
    const previous = editStack.at(-1)
    if (!previous) return
    setEditStack(editStack.slice(0, -1))
    setWav(previous)
    const seconds = wavDurationSeconds(previous)
    setTrimStart(0)
    setTrimEnd(seconds)
    setPlayhead(0)
  }

  /** Writes the edited audio back over the clip's own file. */
  async function saveEdits() {
    if (!wav || !selectedId) return
    const clip = clipsById.get(selectedId)
    if (!clip) return
    setSavingEdits(true)
    try {
      if (isTauri()) {
        if (!clip.path) {
          toast.error('That clip has no file to write back to.')
          return
        }
        await writeFileBytes(clip.path, wav)
      } else {
        await library.save({ ...clip, duration: wavDurationSeconds(wav) }, wav)
      }
      setEditStack([])
      toast.success('Edits saved to the library.')
      await refreshLibrary()
    } catch (err) {
      const message = reportError(err, 'Could not save edits')
      toast.error('Could not save those edits.', { description: message })
    } finally {
      setSavingEdits(false)
    }
  }

  /**
   * Saves several re-pitched copies of the current clip as new library clips.
   * No GPU time: this is the standard way to stop a repeated one-shot sounding
   * machine-gunned.
   */
  async function makePitchVariants(count: number, spread: number) {
    if (!wav || !selectedId) return
    const clip = clipsById.get(selectedId)
    if (!clip) return
    const offsets = variantSemitones(count, spread)
    let saved = 0
    try {
      for (const semitones of offsets) {
        const buffer = pitchShiftWav(wav, semitones)
        const suffix = variantSuffix(semitones)
        if (isTauri()) {
          if (!clip.path) continue
          const stem = sanitizeClipStem(`${clip.id}-${suffix}`)
          await writeFileBytes(replacePathStem(clip.path, stem), buffer)
        } else {
          await library.save(
            {
              ...clip,
              id: `${clip.id}-${suffix}`,
              duration: wavDurationSeconds(buffer),
              createdAt: new Date().toISOString(),
            },
            buffer,
          )
        }
        saved += 1
      }
      if (saved) {
        toast.success(`Saved ${saved} pitch ${saved === 1 ? 'variant' : 'variants'}.`, {
          description: offsets
            .slice(0, saved)
            .map((value) => `${value > 0 ? '+' : ''}${value} st`)
            .join(', '),
        })
        await refreshLibrary()
      } else {
        toast.error('Could not save variants for this clip.')
      }
    } catch (err) {
      const message = reportError(err, 'Variants failed')
      toast.error('Could not make variants.', { description: message })
    }
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
        await writeEncodedFile({
          buffer: file.buffer,
          path: dest,
          format: request.format,
          bitrateKbps: needsBitrate(request.format) ? bitrateKbps : undefined,
          vorbisQuality: request.format === 'ogg' ? vorbisQuality : undefined,
        })
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
    const id = pendingDelete
    setPendingDelete(null)
    await trashClip(id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Titlebar
        engineLabel={
          engine.mock ? 'mock engine' : engine.loaded ? engine.device : 'model not loaded'
        }
        weaving={weaving}
        loadingModel={loadingModel}
        weavePhase={weave.phase}
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
        <ErrorBoundary name="Library">
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
          meta={meta}
          filter={libraryFilter}
          onFilter={setLibraryFilter}
          onToggleFavorite={(id) => updateMeta(toggleClipFavorite(meta, id))}
          onToggleRejected={(id) => updateMeta(toggleClipRejected(meta, id))}
          onRate={(id, rating) => updateMeta(setClipRating(meta, id, rating))}
          onRename={(id) => setDetailsFor({ id, focus: 'name' })}
          onEditTags={(id) => setDetailsFor({ id, focus: 'tags' })}
          onOpenTrash={() => {
            void refreshTrash()
            setTrashOpen(true)
          }}
          trashCount={trashEntries.length}
          onCompare={(ids) => void openCompare(ids)}
        />
        </ErrorBoundary>
      ) : null}
      {tab === 'generate' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary name="Waveform">
            <ScrollCanvas
              wav={wav}
              weaving={weaving}
              loadingModel={loadingModel}
              modelLoaded={engine.loaded}
              stalled={weaveStalled}
              rite={weave.rite}
              totalRites={weave.totalRites}
              elapsedMs={weave.elapsedMs}
              startedAt={weaveStartedRef.current}
              phase={weave.phase}
              ratio={weave.ratio}
              mode={mode}
              seed={activeClip?.seed}
              completedSubcategoryCount={completedSubcategoryCount}
              historicalEstimateMs={runHistoricalEstimateMs}
              queueTailEstimateMs={runQueueTailMs}
              remainingAt={remainingAt}
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
            </ErrorBoundary>
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
              bitrateKbps={bitrateKbps}
              vorbisQuality={vorbisQuality}
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
              onFormat={(value) => {
                setExportFmt(value)
                if (needsBitrate(value)) {
                  setBitrateKbps(
                    value === 'opus' ? settings.defaultOpusBitrateKbps : settings.defaultMp3BitrateKbps,
                  )
                }
              }}
              onSampleRate={setSampleRate}
              onBitDepth={setBitDepth}
              onBitrateKbps={setBitrateKbps}
              onVorbisQuality={setVorbisQuality}
              onMono={setMono}
              onExport={() => void exportSelectedFormat()}
              onExportFormat={(format) => void exportFormat(format)}
              shape={
                <ShapePanel
                  disabled={!wav || weaving || loadingModel}
                  canUndo={editStack.length > 0}
                  dirty={editStack.length > 0}
                  canSave={Boolean(selectedId)}
                  saving={savingEdits}
                  onFade={(fadeInSec, fadeOutSec) =>
                    applyEdit((buffer) => applyFade(buffer, { fadeInSec, fadeOutSec }), 'fades')
                  }
                  onReverse={() => applyEdit(reverseWav, 'reverse')}
                  onGain={(db) => applyEdit((buffer) => applyGainDb(buffer, db), 'gain')}
                  onNormalize={() => applyEdit((buffer) => normalizePeak(buffer), 'normalize')}
                  onPitch={(semitones) =>
                    applyEdit((buffer) => pitchShiftWav(buffer, semitones), 'pitch shift')
                  }
                  onVariants={(count, spread) => void makePitchVariants(count, spread)}
                  onUndo={undoEdit}
                  onSave={() => void saveEdits()}
                />
              }
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
            loadEstimateMs={estimateLoadMs(timing, {
              precision: settings.precision,
              model: activePresetPlan.model,
              isMock: engine.mock,
            })}
            castEstimateMs={estimateGenerateMs(timing, duration, {
              steps: effectiveSteps,
              cfg: activePresetPlan.cfg,
              precision: settings.precision,
              isMock: engine.mock,
            })}
            queueEstimateMs={estimateQueueMs(timing, queueCostItems(queue), {
              precision: settings.precision,
              isMock: engine.mock,
            })}
            clipEstimateMs={(seconds) =>
              estimateGenerateMs(timing, seconds, {
                steps: effectiveSteps,
                cfg: activePresetPlan.cfg,
                precision: settings.precision,
                isMock: engine.mock,
              })
            }
            generateSeamlessLoop={generateSeamlessLoop}
            onGenerateSeamlessLoop={setGenerateSeamlessLoop}
            preset={preset}
            onPreset={setPreset}
            baseModelReady={engine.baseModelReady}
            queuePreset={queuePreset}
            onQueuePreset={setQueuePreset}
          />
        </div>
      ) : null}
      {tab === 'settings' ? (
        <SettingsPanel
          settings={settings}
          onChange={applySettings}
          baseModelReady={engine.baseModelReady}
          installingBaseModel={installingBase}
          onInstallBaseModel={installBaseModel}
        />
      ) : null}
      {catalogOpen ? (
      <ErrorBoundary name="Catalog">
      <PromptCatalogDialog
        open={catalogOpen}
        catalog={catalog}
        onOpenChange={setCatalogOpen}
        onEnqueue={(effects) => {
          // Stamp the preset in force now, so a queue can mix presets and each
          // item still runs the way it was added.
          const stamped = effects.map((effect) => ({ ...effect, preset }))
          const next = mergeQueue(queueRef.current, stamped)
          updateQueue(next)
        }}
        onUse={(effect) => {
          applyCatalogEffect(effect)
          setCatalogOpen(false)
        }}
      />
      </ErrorBoundary>
      ) : null}
      {takesOpen ? (
      <TakesGrid
        open={takesOpen}
        takes={takes}
        parentSeed={takesParentSeed}
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
      ) : null}
      {trashOpen ? (
      <TrashDialog
        open={trashOpen}
        entries={trashEntries}
        busy={trashBusy}
        onOpenChange={setTrashOpen}
        onRestore={(id) => void restoreFromTrash(id)}
        onPurge={(id) => void purgeFromTrash(id)}
        onEmpty={() => void emptyTrash()}
      />
      ) : null}
      {detailsFor ? (
      <ClipDetailsDialog
        open={Boolean(detailsFor)}
        focus={detailsFor?.focus ?? 'name'}
        meta={detailsFor ? getMeta(meta, detailsFor.id) : {}}
        name={
          detailsFor && clipsById.get(detailsFor.id)
            ? clipDisplayName(clipsById.get(detailsFor.id)!, meta)
            : ''
        }
        renamesFile={isTauri()}
        suggestions={tagSuggestions}
        busy={detailsBusy}
        onOpenChange={(open) => !open && setDetailsFor(null)}
        onSubmit={({ name, tags }) => {
          if (detailsFor) void renameClip(detailsFor.id, name, tags)
        }}
      />
      ) : null}
      {compare ? (
        <ErrorBoundary name="Compare">
        <CompareDialog
          open
          a={compare.a}
          b={compare.b}
          onOpenChange={(open) => !open && setCompare(null)}
        />
        </ErrorBoundary>
      ) : null}
      {commandOpen ? (
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
      ) : null}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <Hint label="Confirm before deleting a library clip.">
              <AlertDialogTitle>Delete this sound?</AlertDialogTitle>
            </Hint>
            <Hint label="The WAV moves to the trash inside the library folder. Export copies on disk are left alone.">
              <AlertDialogDescription>
                The clip moves to the trash. You can restore it from there until the trash is
                emptied.
              </AlertDialogDescription>
            </Hint>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Hint label="Leave this clip in the library.">
              <AlertDialogCancel>Keep</AlertDialogCancel>
            </Hint>
            <Hint label="Move this clip's WAV into the library's trash folder.">
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
