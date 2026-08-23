import { generateMockMusicWav, generateMockSfxWav, tagMusicWav, wavDurationSeconds } from '@/lib/wav'
import { extractInstruments, musicWavInfo } from '@/lib/instruments'
import type {
  Clip,
  EngineStatus,
  GenerateRequest,
  GenerateResult,
  SetupProbe,
  WeaveProgress,
} from '@/lib/types'
import { TOTAL_RITES } from '@/lib/types'

export type GenerateHandlers = {
  onProgress?: (progress: WeaveProgress) => void
  signal?: AbortSignal
  stepDelayMs?: number
}

function randomId(): string {
  return crypto.randomUUID()
}

function pickSeed(seed: number): number {
  if (seed > 0) return seed
  return 1 + Math.floor(Math.random() * 2_147_483_646)
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
  }
}

export async function mockGenerate(
  request: GenerateRequest,
  handlers: GenerateHandlers = {},
): Promise<GenerateResult> {
  const started = Date.now()
  const seed = pickSeed(request.seed)
  for (let step = 1; step <= TOTAL_RITES; step += 1) {
    if (handlers.signal?.aborted) {
      throw new DOMException('Generation cancelled', 'AbortError')
    }
    handlers.onProgress?.({
      step,
      total: TOTAL_RITES,
      elapsedMs: Date.now() - started,
      phase: 'weaving',
      ratio: step / TOTAL_RITES,
    })
    const delay = handlers.stepDelayMs ?? 0
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  const mode = request.mode === 'music' ? 'music' : 'sfx'
  const instruments =
    mode === 'music' ? (request.instruments ?? extractInstruments(request.prompt)) : []
  let wav =
    mode === 'music'
      ? generateMockMusicWav(request.seconds, seed)
      : generateMockSfxWav(request.seconds, seed)
  if (mode === 'music') {
    wav = tagMusicWav(wav, musicWavInfo(request.prompt, instruments))
  }
  const clip: Clip = {
    id: randomId(),
    prompt: request.prompt.trim(),
    duration: wavDurationSeconds(wav),
    seed,
    createdAt: new Date().toISOString(),
    cfg: request.cfg,
    negative: request.negative,
    mode,
    instruments: instruments.length ? instruments : undefined,
  }
  return { clip, wav }
}

export function mockDownloadProgress(
  onProgress: (ratio: number) => void,
  tickMs = 0,
): Promise<void> {
  return new Promise((resolve) => {
    let ratio = 0
    const bump = () => {
      ratio = Math.min(1, ratio + 0.2)
      onProgress(ratio)
      if (ratio >= 1) {
        resolve()
        return
      }
      if (tickMs > 0) setTimeout(bump, tickMs)
      else bump()
    }
    bump()
  })
}
