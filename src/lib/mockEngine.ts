import { clampGenerateSeconds } from '@/lib/duration'
import { resolveSeed } from '@/lib/seed'
import {
  DEFAULT_PRESET,
  presetUnavailableMessage,
  resolvePresetPlan,
  resolveQualityPreset,
} from '@/lib/qualityPreset'
import { loopOverlapSeconds, makeSeamlessLoop } from '@/lib/seamlessLoop'
import { generateMockMusicWav, generateMockSfxWav, tagWav, wavDurationSeconds } from '@/lib/wav'
import { modeSupportsSeamlessLoop, resolveGenerateMode } from '@/lib/generateMode'
import { clipWavInfo, extractInstruments } from '@/lib/instruments'
import type {
  Clip,
  EngineStatus,
  GenerateRequest,
  GenerateResult,
  SetupProbe,
  WeaveProgress,
} from '@/lib/types'
import {
  inferClipCategory,
  inferClipIntensity,
  inferClipSubcategory,
} from '@/lib/promptCatalog'

export type GenerateHandlers = {
  onProgress?: (progress: WeaveProgress) => void
  signal?: AbortSignal
  stepDelayMs?: number
}

function randomId(): string {
  return crypto.randomUUID()
}

export function mockProbe(): SetupProbe {
  return {
    ok: true,
    flavor: 'Mock engine is ready. Install CUDA Medium for full quality.',
    technical: 'THUNDER_FX_MOCK_ENGINE=1 — no PyTorch / Flash Attention loaded.',
    device: 'mock',
  }
}

export function mockStatus(): EngineStatus {
  return {
    ready: true,
    mock: true,
    loaded: true,
    device: 'mock',
    message: 'Mock engine (install CUDA Medium for production quality).',
    vramUsedGb: 0.4,
    vramTotalGb: 8,
    vramAllocatedGb: 0.3,
    vramReservedGb: 0.4,
    gpuName: 'mock',
    precision: 'fp32',
  }
}

export async function mockGenerate(
  request: GenerateRequest,
  handlers: GenerateHandlers = {},
): Promise<GenerateResult> {
  const started = Date.now()
  const seed = resolveSeed(request.seed)
  // A caller that pins steps without naming a preset means Custom -- the same
  // thing the Advanced slider does in the UI.
  const preset = request.preset ?? (request.steps == null ? DEFAULT_PRESET : 'custom')
  const plan = resolvePresetPlan(resolveQualityPreset(preset), {
    steps: request.steps,
    sampler: request.sampler,
    mode: resolveGenerateMode(request.mode),
    // The browser build has no checkpoints at all, so an unavailable preset
    // refuses here exactly as the real engine does -- never substitutes.
    baseAvailable: false,
  })
  if (plan.unavailable) {
    throw new Error(presetUnavailableMessage(plan.preset))
  }
  const total = plan.steps
  for (let step = 1; step <= total; step += 1) {
    if (handlers.signal?.aborted) {
      throw new DOMException('Generation cancelled', 'AbortError')
    }
    handlers.onProgress?.({
      step,
      total,
      elapsedMs: Date.now() - started,
      phase: 'weaving',
      ratio: step / total,
    })
    const delay = handlers.stepDelayMs ?? 0
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  const mode = resolveGenerateMode(request.mode)
  const detectedInstruments =
    mode === 'music'
      ? request.instruments?.length
        ? request.instruments
        : extractInstruments(request.prompt)
      : []
  const topInstruments = detectedInstruments.slice(0, 3)

  const clipStub: Clip = {
    id: '',
    prompt: request.prompt.trim(),
    duration: clampGenerateSeconds(request.seconds),
    seed,
    createdAt: new Date().toISOString(),
    cfg: request.cfg,
    steps: total,
    preset: plan.preset,
    sampler: plan.sampler,
    negative: request.negative,
    mode,
  }
  const resolvedCategory = request.category?.trim() || inferClipCategory(clipStub)
  const resolvedSubcategory =
    request.subcategory?.trim() ||
    (mode !== 'music' ? inferClipSubcategory(clipStub) : undefined)
  const resolvedIntensity =
    request.intensity?.trim() ||
    (mode === 'music' ? inferClipIntensity(clipStub) : undefined)

  const loop = modeSupportsSeamlessLoop(mode) && Boolean(request.seamlessLoop)
  const fade = loop ? loopOverlapSeconds(request.seconds) : 0
  const genSeconds = clampGenerateSeconds(request.seconds + fade)
  let wav =
    mode === 'music'
      ? generateMockMusicWav(genSeconds, seed)
      : generateMockSfxWav(genSeconds, seed)
  if (loop) {
    wav = makeSeamlessLoop(wav, fade)
  }
  const wavInfo = clipWavInfo(
    request.prompt,
    mode,
    topInstruments,
    resolvedCategory,
    resolvedIntensity,
  )
  wav = tagWav(wav, wavInfo)

  const clip: Clip = {
    id: randomId(),
    prompt: request.prompt.trim(),
    duration: wavDurationSeconds(wav),
    seed,
    createdAt: new Date().toISOString(),
    cfg: request.cfg,
    steps: total,
    negative: request.negative,
    mode,
    instruments: topInstruments.length ? topInstruments : undefined,
    category: resolvedCategory,
    subcategory: resolvedSubcategory,
    intensity: resolvedIntensity,
  }
  return { clip, wav }
}


export function mockDownloadProgress(
  onProgress: (ratio: number) => void,
  tickMs = 0,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let ratio = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const onAbort = () => {
      if (timer) clearTimeout(timer)
      reject(new DOMException('Model load cancelled', 'AbortError'))
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort)
    const bump = () => {
      if (signal?.aborted) return
      ratio = Math.min(1, ratio + 0.2)
      onProgress(ratio)
      if (ratio >= 1) {
        signal?.removeEventListener('abort', onAbort)
        resolve()
        return
      }
      if (tickMs > 0) timer = setTimeout(bump, tickMs)
      else bump()
    }
    bump()
  })
}
