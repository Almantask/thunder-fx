import { bench, describe } from 'vitest'
import { generateMockSfxWav, parseWav, waveformPeaks } from '@/lib/wav'
import { resamplePcm } from '@/lib/audioExport'
import { pitchShiftWav } from '@/lib/audioEdit'

const eightSeconds = generateMockSfxWav(8, 7)
const parsed = parseWav(eightSeconds)

describe('audio hot path', () => {
  bench('parseWav 8 s', () => {
    parseWav(eightSeconds)
  })

  bench('waveformPeaks 8 s / 240 buckets', () => {
    waveformPeaks(eightSeconds, 240)
  })

  bench('resamplePcm 44.1 → 48 kHz', () => {
    resamplePcm(parsed.pcm, parsed.channels, parsed.sampleRate, 48_000)
  })

  bench('pitchShiftWav +2 st', () => {
    pitchShiftWav(eightSeconds, 2)
  })
})
