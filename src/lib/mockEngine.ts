import { generateMockSfxWav, wavDurationSeconds } from '@/lib/wav'
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
    flavor: 'The brazier catches. A mock weave is ready until CUDA Medium is installed.',
    technical: 'THUNDER_FX_MOCK_ENGINE=1 — no PyTorch / Flash Attention loaded.',
    device: 'mock',
  }
}

export function mockStatus(): EngineStatus {
  return {
    ready: true,
    mock: true,
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
      throw new DOMException('Cast dispelled', 'AbortError')
    }
    handlers.onProgress?.({
      step,
      total: TOTAL_RITES,
      elapsedMs: Date.now() - started,
    })
    const delay = handlers.stepDelayMs ?? 0
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  const wav = generateMockSfxWav(request.seconds, seed)
  const clip: Clip = {
    id: randomId(),
    prompt: request.prompt.trim(),
    duration: wavDurationSeconds(wav),
    seed,
    createdAt: new Date().toISOString(),
    cfg: request.cfg,
    negative: request.negative,
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
