import { describe, expect, it, vi } from 'vitest'
import {
  drawGoblinBand,
  drawGoblinResting,
  drawGoblinTransition,
  getBandLineup,
  getConstructionCrew,
  getGoblinHitTarget,
  getGoblinInteractionPhrase,
} from '@/lib/goblinBand'

function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    setLineDash: vi.fn(),
    rect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
  } as unknown as CanvasRenderingContext2D
}

describe('goblinBand', () => {
  it('does nothing when width or height is 0', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 0,
      height: 0,
      elapsedMs: 1000,
      rite: 2,
      totalRites: 8,
    })
    expect(ctx.save).not.toHaveBeenCalled()
  })

  it('does nothing when visualState is hidden', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 1000,
      visualState: 'hidden',
    })
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  it('draws the goblin band on canvas for sfx mode with default lineup', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 2500,
      rite: 3,
      totalRites: 8,
      phase: 'weaving',
      mode: 'sfx',
      completedCount: 0,
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
  })

  it('draws the resting goblin band when visualState is resting', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 2500,
      visualState: 'resting',
      mode: 'sfx',
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('STAGE READY • RESTING'),
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('draws the resting goblin band directly via drawGoblinResting', () => {
    const ctx = createMockCtx()
    drawGoblinResting({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 2500,
      mode: 'music',
      completedCount: 1,
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.createRadialGradient).toHaveBeenCalled()
  })

  it('draws loading -> resting transition', () => {
    const ctx = createMockCtx()
    drawGoblinTransition({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 1000,
      from: 'loading',
      to: 'resting',
      progress: 0.3,
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('draws resting -> playing transition', () => {
    const ctx = createMockCtx()
    drawGoblinTransition({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 500,
      from: 'resting',
      to: 'playing',
      progress: 0.2,
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalledWith(
      expect.stringMatching(/WAKE UP!|1\.\.\. 2\.\.\.|3\.\.\. 4\.\.\. ROCK!/),
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('draws playing -> resting transition', () => {
    const ctx = createMockCtx()
    drawGoblinTransition({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 500,
      from: 'playing',
      to: 'resting',
      progress: 0.2,
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('FINALE!'),
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('draws the goblin band on canvas with swapped lineup after completing subcategories', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 2500,
      rite: 3,
      totalRites: 8,
      phase: 'weaving',
      mode: 'sfx',
      completedCount: 1,
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
  })

  it('draws the goblin band on canvas for music/ambience mode', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 4000,
      rite: 5,
      totalRites: 8,
      phase: 'loading',
      mode: 'music',
      completedSubcategories: ['combat::sword', 'magic::fire'],
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.createRadialGradient).toHaveBeenCalled()
  })

  it('draws the goblin band building the stage during model loading phase', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 3500,
      rite: 0,
      totalRites: 8,
      phase: 'loading',
      mode: 'sfx',
    })
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('STAGE IN PROGRESS'),
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('returns default lineup when 0 subcategories are complete', () => {
    const defaultLineup = getBandLineup(0)
    expect(defaultLineup).toEqual([
      { member: 'bandana', instrument: 'drums' },
      { member: 'mohawk', instrument: 'guitar' },
      { member: 'singer', instrument: 'mic' },
      { member: 'wizard', instrument: 'wizardStaff' },
      { member: 'puffed', instrument: 'warHorn' },
    ])
  })

  it('switches members and swaps instruments when whole subcategories are complete', () => {
    const lineup1 = getBandLineup(1)
    const lineup2 = getBandLineup(2)

    // At count 1, positions and instruments are swapped from default
    expect(lineup1).not.toEqual(getBandLineup(0))
    expect(lineup1[0].member).toBe('wizard')
    expect(lineup1[0].instrument).toBe('drums')
    expect(lineup1[1].member).toBe('bandana')
    expect(lineup1[1].instrument).toBe('guitar')

    // At count 2, a different swap is returned
    expect(lineup2).not.toEqual(lineup1)
    expect(lineup2[0].member).toBe('mohawk')
    expect(lineup2[1].member).toBe('wizard')
  })

  it('swaps construction crew roles when subcategories are complete', () => {
    const crew0 = getConstructionCrew(0)
    const crew1 = getConstructionCrew(1)
    expect(crew0[0]).toEqual({ member: 'bandana', role: 'carpenter' })
    expect(crew1[0]).toEqual({ member: 'wizard', role: 'carpenter' })
  })

  it('detects goblin hit targets correctly for resting state', () => {
    // Hidden returns null
    expect(getGoblinHitTarget(192, 190, 960, 280, 'hidden')).toBeNull()

    // Hit slot 0 (Drums around x ~ 0.20 * 960 = 192)
    const hit0 = getGoblinHitTarget(192, 200, 960, 280, 'resting', 0)
    expect(hit0).not.toBeNull()
    expect(hit0?.slotIndex).toBe(0)
    expect(hit0?.member).toBe('bandana')
    expect(hit0?.instrument).toBe('drums')

    // Hit slot 1 (Guitar around x ~ 0.37 * 960 = 355)
    const hit1 = getGoblinHitTarget(355, 205, 960, 280, 'resting', 0)
    expect(hit1).not.toBeNull()
    expect(hit1?.slotIndex).toBe(1)
    expect(hit1?.member).toBe('mohawk')
    expect(hit1?.instrument).toBe('guitar')

    // Click far away from any goblin returns null
    const miss = getGoblinHitTarget(50, 50, 960, 280, 'resting', 0)
    expect(miss).toBeNull()
  })

  it('detects goblin hit targets for loading state', () => {
    const hit = getGoblinHitTarget(172, 200, 960, 280, 'loading', 0)
    expect(hit).not.toBeNull()
    expect(hit?.slotIndex).toBe(0)
    expect(hit?.member).toBe('bandana')
    expect(hit?.role).toBe('carpenter')
  })

  it('generates appropriate interaction phrases by state', () => {
    const phraseResting = getGoblinInteractionPhrase(0, 'resting', 'bandana', 'drums')
    expect(phraseResting).toMatch(/drums|mins|snooze|awake|beat|rest/i)

    const phraseLoading = getGoblinInteractionPhrase(0, 'loading', 'bandana', undefined, 'carpenter')
    expect(phraseLoading).toMatch(/hammer|nail|building/i)

    const phrasePlaying = getGoblinInteractionPhrase(0, 'playing', 'bandana', 'drums')
    expect(phrasePlaying).toMatch(/solo|beat|double/i)
  })

  it('renders interactive speech popups when interactions are active', () => {
    const ctx = createMockCtx()
    drawGoblinBand({
      ctx,
      width: 960,
      height: 280,
      elapsedMs: 2500,
      visualState: 'resting',
      mode: 'sfx',
      interactions: {
        0: {
          startTime: Date.now() - 200,
          duration: 1600,
          text: 'Huh?! 5 more mins... 🥁',
        },
      },
    })
    expect(ctx.fillText).toHaveBeenCalledWith(
      'Huh?! 5 more mins... 🥁',
      expect.any(Number),
      expect.any(Number),
    )
  })
})
