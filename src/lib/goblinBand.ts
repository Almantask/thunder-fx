import type { GenerateMode, WeavePhase } from '@/lib/types'

export type GoblinVisualState = 'hidden' | 'loading' | 'resting' | 'playing'

export type GoblinTransition = {
  from: GoblinVisualState
  to: GoblinVisualState
  progress: number
}

export type GoblinExpression = 'normal' | 'sleep' | 'alert' | 'smile'

export type GoblinInteraction = {
  startTime: number
  duration: number
  text: string
}

export type GoblinHitTarget = {
  slotIndex: number
  member: GoblinMemberId
  instrument?: GoblinInstrumentId
  role?: ConstructionRoleId
  x: number
  y: number
}

export type GoblinBandOptions = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  elapsedMs: number
  rite?: number
  totalRites?: number
  phase?: WeavePhase
  mode?: GenerateMode
  completedCount?: number
  completedSubcategories?: number | string[]
  visualState?: GoblinVisualState
  modelLoaded?: boolean
  transition?: GoblinTransition
  interactions?: Record<number, GoblinInteraction>
}

export type GoblinMemberId = 'bandana' | 'mohawk' | 'singer' | 'wizard' | 'puffed'
export type GoblinInstrumentId = 'drums' | 'guitar' | 'mic' | 'wizardStaff' | 'warHorn'
export type ConstructionRoleId = 'carpenter' | 'sawyer' | 'foreman' | 'craneMage' | 'hauler'

export type BandSlot = {
  member: GoblinMemberId
  instrument: GoblinInstrumentId
}

export type ConstructionSlot = {
  member: GoblinMemberId
  role: ConstructionRoleId
}

// Preset permutations for swapping band members & instruments when subcategories complete
const LINEUP_PRESETS: BandSlot[][] = [
  // 0 completed: Classic standard lineup
  [
    { member: 'bandana', instrument: 'drums' },
    { member: 'mohawk', instrument: 'guitar' },
    { member: 'singer', instrument: 'mic' },
    { member: 'wizard', instrument: 'wizardStaff' },
    { member: 'puffed', instrument: 'warHorn' },
  ],
  // 1 completed: Wizard on Drums, Bandana on Guitar, Mohawk on Vocals, Puffed on Staff, Singer on Horn
  [
    { member: 'wizard', instrument: 'drums' },
    { member: 'bandana', instrument: 'guitar' },
    { member: 'mohawk', instrument: 'mic' },
    { member: 'puffed', instrument: 'wizardStaff' },
    { member: 'singer', instrument: 'warHorn' },
  ],
  // 2 completed: Mohawk on Drums, Wizard on Guitar, Puffed on Vocals, Singer on Staff, Bandana on Horn
  [
    { member: 'mohawk', instrument: 'drums' },
    { member: 'wizard', instrument: 'guitar' },
    { member: 'puffed', instrument: 'mic' },
    { member: 'singer', instrument: 'wizardStaff' },
    { member: 'bandana', instrument: 'warHorn' },
  ],
  // 3 completed: Puffed on Drums, Singer on Guitar, Wizard on Vocals, Bandana on Staff, Mohawk on Horn
  [
    { member: 'puffed', instrument: 'drums' },
    { member: 'singer', instrument: 'guitar' },
    { member: 'wizard', instrument: 'mic' },
    { member: 'bandana', instrument: 'wizardStaff' },
    { member: 'mohawk', instrument: 'warHorn' },
  ],
  // 4 completed: Singer on Drums, Puffed on Guitar, Bandana on Vocals, Mohawk on Staff, Wizard on Horn
  [
    { member: 'singer', instrument: 'drums' },
    { member: 'puffed', instrument: 'guitar' },
    { member: 'bandana', instrument: 'mic' },
    { member: 'mohawk', instrument: 'wizardStaff' },
    { member: 'wizard', instrument: 'warHorn' },
  ],
  // 5 completed: Mohawk on Drums, Singer on Guitar, Wizard on Vocals, Puffed on Staff, Bandana on Horn
  [
    { member: 'mohawk', instrument: 'drums' },
    { member: 'singer', instrument: 'guitar' },
    { member: 'wizard', instrument: 'mic' },
    { member: 'puffed', instrument: 'wizardStaff' },
    { member: 'bandana', instrument: 'warHorn' },
  ],
  // 6 completed: Bandana on Drums, Wizard on Guitar, Singer on Vocals, Puffed on Staff, Mohawk on Horn
  [
    { member: 'bandana', instrument: 'drums' },
    { member: 'wizard', instrument: 'guitar' },
    { member: 'singer', instrument: 'mic' },
    { member: 'puffed', instrument: 'wizardStaff' },
    { member: 'mohawk', instrument: 'warHorn' },
  ],
]

const CONSTRUCTION_PRESETS: ConstructionSlot[][] = [
  // 0 completed: Classic standard roles
  [
    { member: 'bandana', role: 'carpenter' },
    { member: 'mohawk', role: 'sawyer' },
    { member: 'singer', role: 'foreman' },
    { member: 'wizard', role: 'craneMage' },
    { member: 'puffed', role: 'hauler' },
  ],
  // 1 completed: Wizard as Carpenter, Bandana as Sawyer, Mohawk as Foreman, Puffed as Crane Mage, Singer as Hauler
  [
    { member: 'wizard', role: 'carpenter' },
    { member: 'bandana', role: 'sawyer' },
    { member: 'mohawk', role: 'foreman' },
    { member: 'puffed', role: 'craneMage' },
    { member: 'singer', role: 'hauler' },
  ],
  // 2 completed: Mohawk as Carpenter, Wizard as Sawyer, Puffed as Foreman, Singer as Crane Mage, Bandana as Hauler
  [
    { member: 'mohawk', role: 'carpenter' },
    { member: 'wizard', role: 'sawyer' },
    { member: 'puffed', role: 'foreman' },
    { member: 'singer', role: 'craneMage' },
    { member: 'bandana', role: 'hauler' },
  ],
  // 3 completed: Puffed as Carpenter, Singer as Sawyer, Wizard as Foreman, Bandana as Crane Mage, Mohawk as Hauler
  [
    { member: 'puffed', role: 'carpenter' },
    { member: 'singer', role: 'sawyer' },
    { member: 'wizard', role: 'foreman' },
    { member: 'bandana', role: 'craneMage' },
    { member: 'mohawk', role: 'hauler' },
  ],
  // 4 completed: Singer as Carpenter, Puffed as Sawyer, Bandana as Foreman, Mohawk as Crane Mage, Wizard as Hauler
  [
    { member: 'singer', role: 'carpenter' },
    { member: 'puffed', role: 'sawyer' },
    { member: 'bandana', role: 'foreman' },
    { member: 'mohawk', role: 'craneMage' },
    { member: 'wizard', role: 'hauler' },
  ],
]

export function getBandLineup(completedCount = 0): BandSlot[] {
  if (completedCount <= 0) {
    return LINEUP_PRESETS[0]
  }
  const index = ((completedCount - 1) % (LINEUP_PRESETS.length - 1)) + 1
  return LINEUP_PRESETS[index]
}

export function getConstructionCrew(completedCount = 0): ConstructionSlot[] {
  if (completedCount <= 0) {
    return CONSTRUCTION_PRESETS[0]
  }
  const index = ((completedCount - 1) % (CONSTRUCTION_PRESETS.length - 1)) + 1
  return CONSTRUCTION_PRESETS[index]
}

// Deterministic pseudo-random helper based on seed
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/**
 * Draws the energetic, vibing goblin band inside the waveform canvas
 * with rich instrument animations, magical spells, lightning, and visualizer bars.
 * When whole subcategories are completed, band members swap instruments and roles.
 */
export function drawGoblinBand({
  ctx,
  width,
  height,
  elapsedMs,
  rite = 0,
  totalRites = 8,
  phase = 'weaving',
  mode = 'sfx',
  completedCount,
  completedSubcategories,
  visualState,
  transition,
  interactions,
}: GoblinBandOptions): void {
  if (width <= 0 || height <= 0) return

  const count =
    typeof completedCount === 'number'
      ? completedCount
      : Array.isArray(completedSubcategories)
        ? completedSubcategories.length
        : typeof completedSubcategories === 'number'
          ? completedSubcategories
          : 0

  // Tempo: ~135 BPM -> ~444ms per beat
  const beatMs = 444
  const beatTime = elapsedMs / beatMs
  const bounce = Math.abs(Math.sin(beatTime * Math.PI))
  const headBang = Math.sin(beatTime * Math.PI * 2)
  const doubleTime = Math.sin(beatTime * Math.PI * 4)

  const isMusic = mode === 'music'
  const primaryAccent = isMusic ? '#c084fc' : '#e4c36a' // purple for music, bright gold for sfx
  const secondaryAccent = isMusic ? '#38bdf8' : '#e0b15a' // cyan / amber
  const magicRuneColor = isMusic ? 'rgba(192, 132, 252, 0.75)' : 'rgba(228, 195, 106, 0.75)'

  ctx.save()

  const visual = visualState ?? (phase === 'loading' ? 'loading' : 'playing')

  // If transition is in progress, draw the transition animation!
  if (transition && transition.progress < 1) {
    drawGoblinTransition({
      ctx,
      width,
      height,
      elapsedMs,
      from: transition.from,
      to: transition.to,
      progress: Math.max(0, Math.min(1, transition.progress)),
      rite: rite ?? 0,
      totalRites: totalRites ?? 8,
      phase,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount: count,
    })
    ctx.restore()
    return
  }

  // If hidden (e.g. model not loaded), do not draw any goblins or stage!
  if (visual === 'hidden') {
    ctx.restore()
    return
  }

  // If loading the model, show the goblin band actively building the stage!
  if (visual === 'loading' || phase === 'loading') {
    drawGoblinStageBuilding({
      ctx,
      width,
      height,
      elapsedMs,
      rite: rite ?? 0,
      totalRites: totalRites ?? 8,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      beatTime,
      bounce,
      headBang,
      doubleTime,
      completedCount: count,
      interactions,
    })
    ctx.restore()
    return
  }

  // If resting (model loaded, idle), show the resting goblin band!
  if (visual === 'resting') {
    drawGoblinResting({
      ctx,
      width,
      height,
      elapsedMs,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount: count,
      interactions,
    })
    ctx.restore()
    return
  }

  // 1. Stage Background Gradient & Ambient Glow
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height * 0.45,
    20,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.7,
  )
  if (isMusic) {
    bgGrad.addColorStop(0, '#1c1328')
    bgGrad.addColorStop(0.5, '#16101d')
    bgGrad.addColorStop(1, '#0e0914')
  } else {
    bgGrad.addColorStop(0, '#241a12')
    bgGrad.addColorStop(0.5, '#18120e')
    bgGrad.addColorStop(1, '#0d0a08')
  }
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  // 2. Audio Equalizer Bars in the Background
  const numBars = 32
  const barWidth = width / numBars
  const maxBarH = height * 0.38
  for (let i = 0; i < numBars; i++) {
    const distFromCenter = Math.abs(i - numBars / 2) / (numBars / 2)
    const freq = Math.sin(beatTime * 3 + i * 0.45) * 0.5 + 0.5
    const subFreq = Math.cos(beatTime * 6 + i * 0.8) * 0.3 + 0.3
    const barH = (freq * 0.7 + subFreq * 0.3) * (1 - distFromCenter * 0.5) * maxBarH + 4

    const barGrad = ctx.createLinearGradient(0, height * 0.65 - barH, 0, height * 0.65)
    barGrad.addColorStop(0, isMusic ? 'rgba(192, 132, 252, 0.35)' : 'rgba(228, 195, 106, 0.35)')
    barGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

    ctx.fillStyle = barGrad
    ctx.fillRect(i * barWidth + 1, height * 0.65 - barH, barWidth - 2, barH)
  }

  // 3. Stage Floor & Glowing Arcane Sigil Circle with 8 Rite Stones
  const stageY = height * 0.78
  const stageCenterX = width * 0.5
  const stageRadiusX = width * 0.42
  const stageRadiusY = height * 0.18

  // Floor ellipse glow
  ctx.beginPath()
  ctx.ellipse(stageCenterX, stageY, stageRadiusX, stageRadiusY, 0, 0, Math.PI * 2)
  ctx.fillStyle = isMusic ? 'rgba(38, 20, 58, 0.6)' : 'rgba(40, 28, 18, 0.6)'
  ctx.fill()
  ctx.strokeStyle = magicRuneColor
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Inner rotating rune ring
  ctx.save()
  ctx.translate(stageCenterX, stageY)
  ctx.scale(1, stageRadiusY / stageRadiusX)
  ctx.rotate(elapsedMs * 0.0004)
  ctx.beginPath()
  ctx.arc(0, 0, stageRadiusX * 0.75, 0, Math.PI * 2)
  ctx.strokeStyle = isMusic ? 'rgba(56, 189, 248, 0.3)' : 'rgba(228, 195, 106, 0.3)'
  ctx.setLineDash([8, 12])
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  // 8 Rite Stones around the circle
  for (let i = 0; i < totalRites; i++) {
    const angle = (Math.PI * 2 * i) / totalRites - Math.PI / 2 + elapsedMs * 0.0001
    const sx = stageCenterX + Math.cos(angle) * (stageRadiusX * 0.88)
    const sy = stageY + Math.sin(angle) * (stageRadiusY * 0.88)
    const isComplete = i < rite
    const isCurrent = i === rite && phase === 'weaving'

    ctx.beginPath()
    ctx.arc(sx, sy, isCurrent ? 5 + bounce * 2 : 4, 0, Math.PI * 2)
    if (isComplete) {
      ctx.fillStyle = primaryAccent
      ctx.shadowColor = primaryAccent
      ctx.shadowBlur = 10
      ctx.fill()
      ctx.shadowBlur = 0
    } else if (isCurrent) {
      ctx.fillStyle = secondaryAccent
      ctx.shadowColor = secondaryAccent
      ctx.shadowBlur = 8
      ctx.fill()
      ctx.shadowBlur = 0
    } else {
      ctx.fillStyle = '#3a2e24'
      ctx.fill()
    }
  }

  // 4. Band Members (Positioned proportionally across stage, assigned dynamically)
  const stageScale = Math.min(width / 700, height / 220, 1.25)
  const goblinBaseY = stageY + 5

  const lineup = getBandLineup(count)

  // Slot 0: Left Back (x ~ 0.20 * width)
  drawGoblinBandMember({
    ctx,
    member: lineup[0].member,
    instrument: lineup[0].instrument,
    x: width * 0.2,
    y: goblinBaseY - 12 * stageScale,
    scale: stageScale,
    beatTime,
    bounce,
    headBang,
    doubleTime,
    elapsedMs,
    isMusic,
    primaryAccent,
    secondaryAccent,
  })

  // Slot 1: Left Center (x ~ 0.37 * width)
  drawGoblinBandMember({
    ctx,
    member: lineup[1].member,
    instrument: lineup[1].instrument,
    x: width * 0.37,
    y: goblinBaseY,
    scale: stageScale,
    beatTime,
    bounce,
    headBang,
    doubleTime,
    elapsedMs,
    isMusic,
    primaryAccent,
    secondaryAccent,
  })

  // Slot 2: Center Front (x ~ 0.52 * width)
  drawGoblinBandMember({
    ctx,
    member: lineup[2].member,
    instrument: lineup[2].instrument,
    x: width * 0.52,
    y: goblinBaseY + 4 * stageScale,
    scale: stageScale,
    beatTime,
    bounce,
    headBang,
    doubleTime,
    elapsedMs,
    isMusic,
    primaryAccent,
    secondaryAccent,
  })

  // Slot 3: Right Center (x ~ 0.68 * width)
  drawGoblinBandMember({
    ctx,
    member: lineup[3].member,
    instrument: lineup[3].instrument,
    x: width * 0.68,
    y: goblinBaseY,
    scale: stageScale,
    beatTime,
    bounce,
    headBang,
    doubleTime,
    elapsedMs,
    isMusic,
    primaryAccent,
    secondaryAccent,
  })

  // Slot 4: Right Back (x ~ 0.83 * width)
  drawGoblinBandMember({
    ctx,
    member: lineup[4].member,
    instrument: lineup[4].instrument,
    x: width * 0.83,
    y: goblinBaseY - 8 * stageScale,
    scale: stageScale,
    beatTime,
    bounce,
    headBang,
    doubleTime,
    elapsedMs,
    isMusic,
    primaryAccent,
    secondaryAccent,
  })

  // 5. Floating Music Notes & Magical Stardust Particle System
  drawMagicEffects(
    ctx,
    width,
    height,
    elapsedMs,
    primaryAccent,
    secondaryAccent,
    isMusic,
  )

  // 6. Active Interactive Speech Popups
  const xRatios = [0.2, 0.37, 0.52, 0.68, 0.83]
  const yOffsets = [-10 * stageScale, 0, 4 * stageScale, 0, -8 * stageScale]
  for (let i = 0; i < 5; i++) {
    const inter = interactions?.[i]
    if (inter && Date.now() - inter.startTime < inter.duration) {
      const interProg = (Date.now() - inter.startTime) / inter.duration
      drawGoblinInteractionPopup(
        ctx,
        width * xRatios[i],
        goblinBaseY + yOffsets[i] - 38 * stageScale,
        stageScale,
        inter.text,
        interProg,
        primaryAccent,
      )
    }
  }

  ctx.restore()
}

// -------------------------------------------------------------
// Shared Goblin Head & Features
// -------------------------------------------------------------

export function drawGoblinHead(
  ctx: CanvasRenderingContext2D,
  member: GoblinMemberId,
  isMusic: boolean,
  accentColor: string,
  expression: GoblinExpression = 'normal',
): void {
  drawGoblinEars(ctx, 0, 0, 1.1)

  switch (member) {
    case 'bandana': {
      // Head oval
      ctx.fillStyle = '#5c8a42'
      ctx.beginPath()
      ctx.arc(0, 0, 12, 0, Math.PI * 2)
      ctx.fill()

      // Red Bandana
      ctx.fillStyle = '#8b2e2e'
      ctx.fillRect(-12, -9, 24, 6)
      ctx.beginPath()
      ctx.moveTo(10, -6)
      ctx.lineTo(19, -2)
      ctx.lineTo(16, 4)
      ctx.fill()

      if (expression === 'sleep') {
        // Sleepy closed eye slits
        ctx.fillStyle = '#16110d'
        ctx.fillRect(-7, 0, 4, 2)
        ctx.fillRect(3, 0, 4, 2)

        // Calm peaceful smile
        ctx.strokeStyle = '#16110d'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(0, 4, 4, 0.1, Math.PI - 0.1)
        ctx.stroke()
      } else if (expression === 'alert') {
        // Wide glowing alert eyes
        ctx.fillStyle = '#ffea75'
        ctx.beginPath()
        ctx.arc(-5, -1, 3.5, 0, Math.PI * 2)
        ctx.arc(5, -1, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#16110d'
        ctx.beginPath()
        ctx.arc(-5, -1, 1.5, 0, Math.PI * 2)
        ctx.arc(5, -1, 1.5, 0, Math.PI * 2)
        ctx.fill()

        // Surprised / excited open mouth
        ctx.fillStyle = '#16110d'
        ctx.beginPath()
        ctx.ellipse(0, 5, 4, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f3e6c8'
        ctx.fillRect(-3, 2, 2, 2)
        ctx.fillRect(1, 2, 2, 2)
      } else if (expression === 'smile') {
        // Smiling eyes
        ctx.strokeStyle = '#16110d'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(-5, -1, 3, Math.PI, 0)
        ctx.arc(5, -1, 3, Math.PI, 0)
        ctx.stroke()

        // Big toothy grin
        ctx.fillStyle = '#16110d'
        ctx.beginPath()
        ctx.arc(0, 4, 6, 0, Math.PI)
        ctx.fill()
        ctx.fillStyle = '#f3e6c8'
        ctx.fillRect(-4, 3, 2, 3)
        ctx.fillRect(2, 3, 2, 3)
      } else {
        // Eyes (focused, narrow slits)
        ctx.fillStyle = '#ffea75'
        ctx.fillRect(-7, -2, 4, 3)
        ctx.fillRect(3, -2, 4, 3)

        // Grin with sharp fangs
        ctx.fillStyle = '#16110d'
        ctx.beginPath()
        ctx.arc(0, 5, 6, 0, Math.PI)
        ctx.fill()
        ctx.fillStyle = '#f3e6c8'
        ctx.fillRect(-4, 4, 2, 3)
        ctx.fillRect(2, 4, 2, 3)
      }
      break
    }
    case 'mohawk': {
      // Face
      ctx.fillStyle = '#6fa84e'
      ctx.beginPath()
      ctx.arc(0, 0, 11, 0, Math.PI * 2)
      ctx.fill()

      // Wild Spiked Mohawk Hair
      ctx.fillStyle = '#8b2e2e'
      ctx.beginPath()
      ctx.moveTo(-6, -8)
      ctx.lineTo(-3, -22)
      ctx.lineTo(0, -10)
      ctx.lineTo(3, -24)
      ctx.lineTo(6, -8)
      ctx.fill()

      if (expression === 'sleep') {
        // Peaceful curved closed eyes
        ctx.strokeStyle = '#120e0c'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(-4, 0, 2.5, 0.2, Math.PI - 0.2)
        ctx.arc(4, 0, 2.5, 0.2, Math.PI - 0.2)
        ctx.stroke()

        // Little peaceful snore smile
        ctx.beginPath()
        ctx.arc(0, 4, 3, 0.1, Math.PI - 0.1)
        ctx.stroke()
      } else if (expression === 'alert') {
        // Huge alert rocker eyes
        ctx.fillStyle = '#ffea75'
        ctx.beginPath()
        ctx.arc(-4, -1, 3.5, 0, Math.PI * 2)
        ctx.arc(4, -1, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#120e0c'
        ctx.beginPath()
        ctx.arc(-4, -1, 1.5, 0, Math.PI * 2)
        ctx.arc(4, -1, 1.5, 0, Math.PI * 2)
        ctx.fill()

        // Wide rocker scream
        ctx.fillStyle = '#120e0c'
        ctx.beginPath()
        ctx.ellipse(0, 5, 4, 5, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Glowing rocker eyes
        ctx.fillStyle = '#ffea75'
        ctx.beginPath()
        ctx.arc(-4, -1, 2.5, 0, Math.PI * 2)
        ctx.arc(4, -1, 2.5, 0, Math.PI * 2)
        ctx.fill()

        // Rocker grin
        ctx.strokeStyle = '#120e0c'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 4, 5, 0.2, Math.PI - 0.2)
        ctx.stroke()
      }
      break
    }
    case 'singer': {
      // Head shape
      ctx.fillStyle = '#4d7338'
      ctx.beginPath()
      ctx.arc(0, 0, 12, 0, Math.PI * 2)
      ctx.fill()

      // Wild spiky hair
      ctx.fillStyle = '#1c1612'
      ctx.beginPath()
      ctx.moveTo(-10, -6)
      ctx.lineTo(-8, -18)
      ctx.lineTo(-2, -8)
      ctx.lineTo(3, -20)
      ctx.lineTo(8, -7)
      ctx.lineTo(11, -16)
      ctx.lineTo(12, -4)
      ctx.fill()

      if (expression === 'sleep') {
        // Peaceful curved closed eyes
        ctx.strokeStyle = '#120e0c'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(-3, -2, 3, 0.1, Math.PI - 0.1)
        ctx.arc(5, -1, 3, 0.1, Math.PI - 0.1)
        ctx.stroke()

        // Gentle closed resting mouth
        ctx.beginPath()
        ctx.arc(1, 4, 4, 0.2, Math.PI - 0.2)
        ctx.stroke()
      } else if (expression === 'smile') {
        // Happy rocker eyes & smile
        ctx.strokeStyle = '#120e0c'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(-3, -2, 3, Math.PI, 0)
        ctx.arc(5, -1, 3, Math.PI, 0)
        ctx.stroke()

        ctx.fillStyle = '#120e0c'
        ctx.beginPath()
        ctx.arc(1, 4, 6, 0, Math.PI)
        ctx.fill()
        ctx.fillStyle = '#f3e6c8'
        ctx.fillRect(-2, 3, 2, 2)
        ctx.fillRect(2, 3, 2, 2)
      } else {
        // Wide open screaming / singing mouth
        ctx.fillStyle = '#120e0c'
        ctx.beginPath()
        ctx.ellipse(3, 4, 5, 6, 0.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#8b2e2e' // tongue
        ctx.beginPath()
        ctx.arc(4, 7, 3, 0, Math.PI)
        ctx.fill()
        ctx.fillStyle = '#f3e6c8' // upper fangs
        ctx.fillRect(0, 0, 2, 3)
        ctx.fillRect(4, 1, 2, 3)

        // Glowing energetic eyes
        ctx.fillStyle = '#ffea75'
        ctx.beginPath()
        ctx.arc(-3, -3, 3, 0, Math.PI * 2)
        ctx.arc(5, -2, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#1c1612'
        ctx.beginPath()
        ctx.arc(-3, -3, 1, 0, Math.PI * 2)
        ctx.arc(5, -2, 1, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'wizard': {
      // Face
      ctx.fillStyle = '#5c8a42'
      ctx.beginPath()
      ctx.arc(0, 0, 10, 0, Math.PI * 2)
      ctx.fill()

      // Long crooked wizard nose
      ctx.strokeStyle = '#4d7338'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, -2)
      ctx.lineTo(6, 4)
      ctx.stroke()

      if (expression === 'sleep') {
        // Meditative closed slits
        ctx.fillStyle = '#2b3f20'
        ctx.fillRect(-5, -2, 4, 1.5)
        ctx.fillRect(2, -2, 4, 1.5)
      } else if (expression === 'alert') {
        // Blazing glowing magical eyes
        ctx.fillStyle = isMusic ? '#38bdf8' : '#fef08a'
        ctx.shadowColor = ctx.fillStyle
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.arc(-3, -2, 3.2, 0, Math.PI * 2)
        ctx.arc(4, -2, 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      } else {
        // Glowing magical eyes
        ctx.fillStyle = isMusic ? '#38bdf8' : '#ffea75'
        ctx.beginPath()
        ctx.arc(-3, -2, 2.5, 0, Math.PI * 2)
        ctx.arc(4, -2, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Crooked Wizard Hat
      ctx.fillStyle = isMusic ? '#221133' : '#1c1612'
      ctx.beginPath()
      ctx.ellipse(0, -6, 18, 5, 0, 0, Math.PI * 2) // Brim
      ctx.fill()
      ctx.strokeStyle = accentColor
      ctx.lineWidth = 1
      ctx.stroke()

      // Hat cone
      ctx.beginPath()
      ctx.moveTo(-10, -7)
      ctx.lineTo(10, -7)
      ctx.lineTo(6, -26)
      ctx.lineTo(14, -34) // crooked tip
      ctx.lineTo(-2, -24)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'puffed': {
      // Puffed head
      ctx.fillStyle = '#5c8a42'
      ctx.beginPath()
      ctx.ellipse(0, 0, 11, 10, 0, 0, Math.PI * 2)
      ctx.fill()

      if (expression === 'sleep') {
        // Cheeks slightly relaxed
        ctx.fillStyle = '#6fa84e'
        ctx.beginPath()
        ctx.arc(-5, 2, 3, 0, Math.PI * 2)
        ctx.arc(5, 2, 3, 0, Math.PI * 2)
        ctx.fill()

        // Peaceful closed eyes
        ctx.strokeStyle = '#120e0c'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(-4, -1, 2.5, 0.1, Math.PI - 0.1)
        ctx.arc(4, -1, 2.5, 0.1, Math.PI - 0.1)
        ctx.stroke()
      } else {
        // Cheeks puffed out
        ctx.fillStyle = '#6fa84e'
        ctx.beginPath()
        ctx.arc(-6, 2, 4, 0, Math.PI * 2)
        ctx.arc(6, 2, 4, 0, Math.PI * 2)
        ctx.fill()

        if (expression === 'alert') {
          // Alert round eyes
          ctx.fillStyle = '#ffea75'
          ctx.beginPath()
          ctx.arc(-5, -2, 3, 0, Math.PI * 2)
          ctx.arc(5, -2, 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#120e0c'
          ctx.beginPath()
          ctx.arc(-5, -2, 1.2, 0, Math.PI * 2)
          ctx.arc(5, -2, 1.2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // Closed focused eyes
          ctx.strokeStyle = '#120e0c'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(-7, -2)
          ctx.lineTo(-3, -4)
          ctx.moveTo(3, -4)
          ctx.lineTo(7, -2)
          ctx.stroke()
        }
      }
      break
    }
  }
}

// -------------------------------------------------------------
// Modular Band Member Rendering
// -------------------------------------------------------------

type DrawBandMemberParams = {
  ctx: CanvasRenderingContext2D
  member: GoblinMemberId
  instrument: GoblinInstrumentId
  x: number
  y: number
  scale: number
  beatTime: number
  bounce: number
  headBang: number
  doubleTime: number
  elapsedMs: number
  isMusic: boolean
  primaryAccent: string
  secondaryAccent: string
}

function drawGoblinBandMember({
  ctx,
  member,
  instrument,
  x,
  y,
  scale,
  beatTime,
  bounce,
  headBang,
  doubleTime,
  elapsedMs,
  isMusic,
  primaryAccent,
  secondaryAccent,
}: DrawBandMemberParams): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)

  switch (instrument) {
    case 'drums': {
      const drumLeftHit = Math.abs(Math.sin(beatTime * Math.PI)) > 0.75
      const drumRightHit = Math.abs(Math.cos(beatTime * Math.PI)) > 0.75

      // Drum kit base
      // Snare / Bass Skull Drum
      ctx.fillStyle = '#2b1f16'
      ctx.beginPath()
      ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c4a35a'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Left Tom
      ctx.fillStyle = '#201812'
      ctx.beginPath()
      ctx.ellipse(-26, -10, 14, 8, -0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8b6f38'
      ctx.stroke()

      // Right Tom
      ctx.fillStyle = '#201812'
      ctx.beginPath()
      ctx.ellipse(26, -10, 14, 8, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8b6f38'
      ctx.stroke()

      // Cymbal on right stand
      ctx.beginPath()
      ctx.moveTo(38, 0)
      ctx.lineTo(42, -35)
      ctx.strokeStyle = '#735c34'
      ctx.lineWidth = 2
      ctx.stroke()

      const cymbalWobble = Math.sin(beatTime * Math.PI * 2) * 0.12
      ctx.save()
      ctx.translate(42, -35)
      ctx.rotate(cymbalWobble)
      ctx.fillStyle = '#e4c36a'
      ctx.beginPath()
      ctx.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Goblin Body behind drums
      const bodyBob = bounce * 4
      ctx.translate(0, -22 - bodyBob)

      // Goblin Torso
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#1c1510'
      ctx.fillRect(-11, -12, 22, 22)
      ctx.fillStyle = member === 'singer' ? '#c4a35a' : '#8b2e2e'
      ctx.fillRect(-8, -10, 16, 4)

      // Goblin Head
      const headRock = Math.sin(beatTime * Math.PI * 2) * 0.15
      ctx.save()
      ctx.translate(0, -18)
      ctx.rotate(headRock)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      ctx.restore()

      // Drumming Arms & Sticks
      // Left Arm
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-10, -6)
      const leftStickTipY = drumLeftHit ? 14 : 2
      ctx.lineTo(-20, 2)
      ctx.lineTo(-24, leftStickTipY)
      ctx.stroke()
      // Drumstick
      ctx.strokeStyle = '#d4b46a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-16, 0)
      ctx.lineTo(-26, leftStickTipY + 4)
      ctx.stroke()

      // Right Arm
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(10, -6)
      const rightStickTipY = drumRightHit ? 14 : 2
      ctx.lineTo(20, 2)
      ctx.lineTo(24, rightStickTipY)
      ctx.stroke()
      // Drumstick
      ctx.strokeStyle = '#d4b46a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(16, 0)
      ctx.lineTo(26, rightStickTipY + 4)
      ctx.stroke()

      // Sparks when drum hit
      if (drumLeftHit || drumRightHit) {
        ctx.fillStyle = isMusic ? '#38bdf8' : '#e4c36a'
        const sparkX = drumLeftHit ? -24 : 24
        for (let s = 0; s < 3; s++) {
          ctx.fillRect(sparkX + (s - 1) * 4, 16 - s * 3, 2, 2)
        }
      }
      break
    }

    case 'guitar': {
      const bodyTilt = Math.sin(beatTime * Math.PI) * 0.1
      const bodyBob = Math.abs(headBang) * 5

      ctx.rotate(bodyTilt)
      ctx.translate(0, -bodyBob)

      // Legs in rock stance
      ctx.strokeStyle = '#261e18'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(-6, -10)
      ctx.lineTo(-15, 0)
      ctx.moveTo(6, -10)
      ctx.lineTo(15, 0)
      ctx.stroke()

      // Torso
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#1c1612'
      ctx.fillRect(-10, -32, 20, 24)

      // Spiked shoulder pads
      ctx.fillStyle = '#8b2e2e'
      ctx.beginPath()
      ctx.moveTo(-13, -32)
      ctx.lineTo(-18, -38)
      ctx.lineTo(-7, -32)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(13, -32)
      ctx.lineTo(18, -38)
      ctx.lineTo(7, -32)
      ctx.fill()

      // Guitar / Spiked Lute
      ctx.save()
      ctx.translate(2, -18)
      ctx.rotate(-0.55 + headBang * 0.08)

      // Guitar body (spiked fantasy shape)
      ctx.fillStyle = '#5a1e1e'
      ctx.beginPath()
      ctx.moveTo(-16, -10)
      ctx.lineTo(16, -18)
      ctx.lineTo(24, 4)
      ctx.lineTo(4, 18)
      ctx.lineTo(-18, 14)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Guitar neck & headstock
      ctx.fillStyle = '#3a2a1a'
      ctx.fillRect(-45, -8, 38, 5)
      ctx.fillStyle = '#8b2e2e'
      ctx.beginPath()
      ctx.moveTo(-45, -12)
      ctx.lineTo(-54, -6)
      ctx.lineTo(-45, 0)
      ctx.fill()

      // Strings with glow
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-50, -6)
      ctx.lineTo(18, -6)
      ctx.stroke()

      // Lightning arcs from strings on rock beats
      if (Math.abs(doubleTime) > 0.6) {
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, -6)
        ctx.lineTo(6, -14)
        ctx.lineTo(12, -4)
        ctx.lineTo(18, -12)
        ctx.stroke()
      }
      ctx.restore()

      // Strumming Arm
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3
      const strumY = Math.sin(doubleTime * Math.PI) * 5
      ctx.beginPath()
      ctx.moveTo(10, -28)
      ctx.lineTo(14, -18 + strumY)
      ctx.lineTo(6, -16 + strumY)
      ctx.stroke()

      // Fretboard Arm
      ctx.beginPath()
      ctx.moveTo(-10, -28)
      ctx.lineTo(-24, -26)
      ctx.lineTo(-30, -22)
      ctx.stroke()

      // Head
      ctx.save()
      ctx.translate(0, -38)
      ctx.rotate(headBang * 0.25)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      ctx.restore()
      break
    }

    case 'mic': {
      const singBob = bounce * 6
      ctx.translate(0, -singBob)

      // Boots & Legs
      ctx.fillStyle = '#1c1612'
      ctx.fillRect(-9, -10, 6, 12)
      ctx.fillRect(3, -10, 6, 12)

      // Torso
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#261e18'
      ctx.fillRect(-11, -34, 22, 25)
      ctx.fillStyle = '#c4a35a'
      ctx.fillRect(-10, -22, 20, 3) // Gold belt

      // Mic Stand & Skull Mic
      ctx.strokeStyle = '#5a4632'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(12, 0)
      ctx.lineTo(8, -28)
      ctx.stroke()

      // Skull Microphone head
      ctx.fillStyle = '#e8d9c4'
      ctx.beginPath()
      ctx.arc(8, -32, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#2a2218'
      ctx.fillRect(6, -34, 2, 2)
      ctx.fillRect(9, -34, 2, 2)

      // Singer's Right Arm gripping mic
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(9, -30)
      ctx.lineTo(12, -28)
      ctx.lineTo(8, -32)
      ctx.stroke()

      // Singer's Left Arm throwing horns \m/
      const armRaise = Math.sin(beatTime * Math.PI * 2) * 0.2
      ctx.save()
      ctx.translate(-10, -30)
      ctx.rotate(-0.8 + armRaise)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(-8, -14)
      ctx.lineTo(-4, -22)
      ctx.stroke()
      // Horns hand gesture
      ctx.fillStyle = '#5c8a42'
      ctx.fillRect(-7, -26, 6, 5)
      ctx.fillRect(-8, -30, 2, 5) // index finger
      ctx.fillRect(-3, -30, 2, 5) // pinky finger
      ctx.restore()

      // Head
      ctx.save()
      ctx.translate(0, -40)
      const headBob = Math.sin(beatTime * Math.PI * 2) * 0.15
      ctx.rotate(headBob)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      ctx.restore()
      break
    }

    case 'wizardStaff': {
      const floatY = Math.sin(elapsedMs * 0.003) * 6 - bounce * 3
      ctx.translate(0, floatY)

      // Flowing wizard robes
      const robeSway = Math.sin(elapsedMs * 0.004) * 0.08
      ctx.save()
      ctx.rotate(robeSway)
      ctx.fillStyle = isMusic ? '#341d4a' : '#2b1e16'
      ctx.beginPath()
      ctx.moveTo(-10, -32)
      ctx.lineTo(10, -32)
      ctx.lineTo(16, 0)
      ctx.lineTo(-16, 0)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      // Wizard Staff
      ctx.strokeStyle = '#5a3d24'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-18, 4)
      ctx.lineTo(-20, -48)
      ctx.stroke()

      // Glowing Crystal / Orb atop staff
      const staffGlow = Math.sin(elapsedMs * 0.006) * 0.3 + 0.7
      const orbX = -20
      const orbY = -52
      ctx.save()
      ctx.shadowColor = primaryAccent
      ctx.shadowBlur = 12 * staffGlow
      ctx.fillStyle = primaryAccent
      ctx.beginPath()
      ctx.arc(orbX, orbY, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.restore()

      // Rotating Arcane Rune Rings around staff orb
      ctx.save()
      ctx.translate(orbX, orbY)
      ctx.rotate(elapsedMs * 0.002)
      ctx.strokeStyle = secondaryAccent
      ctx.lineWidth = 1
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.arc(0, 0, 15, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Wizard Arms
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3
      // Holding staff
      ctx.beginPath()
      ctx.moveTo(-8, -26)
      ctx.lineTo(-18, -32)
      ctx.stroke()

      // Casting spell hand
      const castPulse = Math.sin(elapsedMs * 0.005)
      ctx.beginPath()
      ctx.moveTo(8, -26)
      ctx.lineTo(18, -24 + castPulse * 4)
      ctx.lineTo(24, -30 + castPulse * 4)
      ctx.stroke()

      // Head
      ctx.save()
      ctx.translate(0, -36)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      ctx.restore()
      break
    }

    case 'warHorn': {
      const hornBob = bounce * 5
      ctx.translate(0, -hornBob)

      // Torso
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#1c1612'
      ctx.fillRect(-9, -28, 18, 24)

      // Arms holding horn
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-8, -22)
      ctx.lineTo(-4, -16)
      ctx.lineTo(6, -18)
      ctx.stroke()

      // Curved War Horn / Brass Instrument
      ctx.save()
      ctx.translate(-2, -26)
      ctx.rotate(-0.35 + Math.sin(beatTime * Math.PI) * 0.1)

      ctx.fillStyle = '#c4a35a'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(16, 4, 28, -12)
      ctx.lineTo(34, -8)
      ctx.quadraticCurveTo(18, 14, -2, 4)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#e4c36a'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Horn Bell
      ctx.beginPath()
      ctx.ellipse(31, -10, 6, 12, 0.4, 0, Math.PI * 2)
      ctx.fillStyle = '#8b6f38'
      ctx.fill()
      ctx.stroke()

      // Acoustic Blast Rings pulsing from horn
      const blastPulse = (beatTime * 1.5) % 1
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 2 * (1 - blastPulse)
      ctx.globalAlpha = 0.9 * (1 - blastPulse)
      ctx.beginPath()
      ctx.ellipse(
        34 + blastPulse * 28,
        -12 - blastPulse * 16,
        6 + blastPulse * 14,
        12 + blastPulse * 24,
        0.4,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.restore()

      // Head
      ctx.save()
      ctx.translate(0, -32)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      ctx.restore()
      break
    }
  }

  ctx.restore()
}

function drawGoblinEars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  earScale = 1,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(earScale, earScale)

  // Left Pointed Ear
  ctx.fillStyle = '#4d7338'
  ctx.beginPath()
  ctx.moveTo(-6, -2)
  ctx.quadraticCurveTo(-18, -12, -24, -4)
  ctx.quadraticCurveTo(-16, 4, -6, 4)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#7ca85e'
  ctx.beginPath()
  ctx.ellipse(-14, -1, 5, 2, -0.4, 0, Math.PI * 2)
  ctx.fill()

  // Gold Earring on left ear
  ctx.strokeStyle = '#e4c36a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(-22, -3, 2.5, 0, Math.PI * 2)
  ctx.stroke()

  // Right Pointed Ear
  ctx.fillStyle = '#4d7338'
  ctx.beginPath()
  ctx.moveTo(6, -2)
  ctx.quadraticCurveTo(18, -12, 24, -4)
  ctx.quadraticCurveTo(16, 4, 6, 4)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#7ca85e'
  ctx.beginPath()
  ctx.ellipse(14, -1, 5, 2, 0.4, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// -------------------------------------------------------------
// Magic Particles & Floating Music Notes
// -------------------------------------------------------------

const MUSIC_NOTES = ['♪', '♫', '♬', '✦', '✧', '𝄞']

function drawMagicEffects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  primaryColor: string,
  secondaryColor: string,
  isMusic: boolean,
): void {
  const noteCount = 14
  ctx.font = 'bold 15px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let i = 0; i < noteCount; i++) {
    const seed = i * 7919
    const speed = 0.0003 + (i % 4) * 0.0001
    const progress = (elapsedMs * speed + pseudoRandom(seed)) % 1

    const spawnX = width * (0.2 + pseudoRandom(seed + 1) * 0.6)
    const driftX = Math.sin(elapsedMs * 0.002 + i) * 35
    const px = spawnX + driftX
    const py = height * 0.75 - progress * (height * 0.7)

    const alpha = Math.sin(progress * Math.PI) * 0.85
    if (alpha <= 0.05) continue

    const char = MUSIC_NOTES[i % MUSIC_NOTES.length]
    const color = i % 2 === 0 ? primaryColor : secondaryColor

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.fillStyle = color
    ctx.fillText(char, px, py)
    ctx.shadowBlur = 0
    ctx.restore()
  }

  // Floating Stardust / Spark Particles
  const sparkCount = 20
  for (let s = 0; s < sparkCount; s++) {
    const seed = s * 4391
    const progress = (elapsedMs * 0.00025 + pseudoRandom(seed)) % 1
    const px = width * (0.15 + pseudoRandom(seed + 2) * 0.7) + Math.cos(elapsedMs * 0.003 + s) * 20
    const py = height * 0.85 - progress * (height * 0.8)
    const sparkAlpha = Math.sin(progress * Math.PI) * 0.65
    const size = 1.5 + pseudoRandom(seed + 3) * 2.5

    ctx.fillStyle = s % 3 === 0 ? '#ffea75' : isMusic ? '#38bdf8' : '#e4c36a'
    ctx.globalAlpha = sparkAlpha
    ctx.fillRect(px, py, size, size)
  }
  ctx.globalAlpha = 1
}

// =============================================================
// STAGE CONSTRUCTION ANIMATION (DURING MODEL LOADING)
// =============================================================

type StageBuildingParams = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  elapsedMs: number
  rite: number
  totalRites: number
  mode: GenerateMode
  isMusic: boolean
  primaryAccent: string
  secondaryAccent: string
  magicRuneColor: string
  beatTime: number
  bounce: number
  headBang: number
  doubleTime: number
  completedCount?: number
  interactions?: Record<number, GoblinInteraction>
}

function drawGoblinStageBuilding({
  ctx,
  width,
  height,
  elapsedMs,
  isMusic,
  primaryAccent,
  secondaryAccent,
  magicRuneColor,
  beatTime,
  bounce,
  headBang,
  doubleTime,
  completedCount = 0,
  interactions,
}: StageBuildingParams): void {
  // 1. Construction Workshop Background
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height * 0.45,
    30,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  )
  if (isMusic) {
    bgGrad.addColorStop(0, '#22132e')
    bgGrad.addColorStop(0.5, '#160c20')
    bgGrad.addColorStop(1, '#0c0612')
  } else {
    bgGrad.addColorStop(0, '#281a10')
    bgGrad.addColorStop(0.5, '#19110b')
    bgGrad.addColorStop(1, '#0d0805')
  }
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  const stageScale = Math.min(width / 720, height / 230, 1.2)
  const stageY = height * 0.78
  const stageCenterX = width * 0.5

  // 2. Hanging Work Lanterns (Swaying with physics)
  drawHangingLantern(ctx, width * 0.12, 0, height * 0.32, elapsedMs * 0.0018, '#fbbf24')
  drawHangingLantern(ctx, width * 0.88, 0, height * 0.3, elapsedMs * 0.0022 + 1.2, '#f59e0b')

  // 3. Wooden Scaffolding Towers & Unfinished Stage Framework
  drawConstructionScaffolding(ctx, width, height, stageY, stageScale)

  // 4. Construction Banner Hanging from Scaffolding Top
  drawConstructionBanner(ctx, stageCenterX, height * 0.14, stageScale, primaryAccent, elapsedMs)

  // 5. Unfinished Stage Floor with Wooden Planks & Toolboxes
  drawUnfinishedStageFloor(ctx, width, stageY, stageScale)

  // 6. The 5 Goblin Construction Band Members (swapped based on completed subcategories)
  const goblinBaseY = stageY + 2 * stageScale
  const crew = getConstructionCrew(completedCount)
  const xRatios = [0.18, 0.34, 0.5, 0.68, 0.85]

  for (let i = 0; i < 5; i++) {
    drawGoblinConstructionMember({
      ctx,
      member: crew[i].member,
      role: crew[i].role,
      x: width * xRatios[i],
      y: goblinBaseY,
      scale: stageScale,
      beatTime,
      bounce,
      headBang,
      doubleTime,
      elapsedMs,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
    })

    if (interactions?.[i]) {
      const inter = interactions[i]
      const isInteracting = Date.now() - inter.startTime < inter.duration
      if (isInteracting) {
        const interProg = (Date.now() - inter.startTime) / inter.duration
        drawGoblinInteractionPopup(
          ctx,
          width * xRatios[i],
          goblinBaseY - 36 * stageScale,
          stageScale,
          inter.text,
          interProg,
          primaryAccent,
        )
      }
    }
  }

  // 7. Flying Sawdust, Sparks & Work Magic Dust
  drawConstructionSawdustAndSparks(ctx, width, height, elapsedMs, isMusic)
}

function drawHangingLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  chainLength: number,
  swayTime: number,
  glowColor: string,
): void {
  const swayAngle = Math.sin(swayTime) * 0.08
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(swayAngle)

  // Chain
  ctx.strokeStyle = '#4a3d32'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, chainLength)
  ctx.stroke()

  // Lantern Cap
  ctx.fillStyle = '#2c2016'
  ctx.strokeStyle = '#634b35'
  ctx.lineWidth = 1
  ctx.fillRect(-8, chainLength, 16, 4)
  ctx.strokeRect(-8, chainLength, 16, 4)

  // Glowing Lantern Glass
  ctx.fillStyle = glowColor
  ctx.shadowColor = glowColor
  ctx.shadowBlur = 12
  ctx.fillRect(-6, chainLength + 4, 12, 14)
  ctx.shadowBlur = 0

  // Metal Cage Grate
  ctx.strokeStyle = '#1a120c'
  ctx.strokeRect(-6, chainLength + 4, 12, 14)
  ctx.beginPath()
  ctx.moveTo(0, chainLength + 4)
  ctx.lineTo(0, chainLength + 18)
  ctx.stroke()

  // Lantern Bottom
  ctx.fillStyle = '#2c2016'
  ctx.fillRect(-7, chainLength + 18, 14, 3)

  ctx.restore()
}

function drawConstructionScaffolding(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stageY: number,
  scale: number,
): void {
  ctx.save()

  const timberColor = '#4a3220'
  const timberHighlight = '#66472e'
  const ropeColor = '#b58c54'

  ctx.lineWidth = 4 * scale
  ctx.strokeStyle = timberColor

  // Left Scaffolding Tower
  const leftX1 = width * 0.08
  const leftX2 = width * 0.22
  const topY = height * 0.16

  // Vertical posts
  ctx.beginPath()
  ctx.moveTo(leftX1, stageY + 15)
  ctx.lineTo(leftX1, topY)
  ctx.moveTo(leftX2, stageY + 15)
  ctx.lineTo(leftX2, topY)
  // Cross bracing
  ctx.moveTo(leftX1, stageY)
  ctx.lineTo(leftX2, topY + 40 * scale)
  ctx.moveTo(leftX2, stageY)
  ctx.lineTo(leftX1, topY + 40 * scale)
  // Horizontal bars
  ctx.moveTo(leftX1 - 10, topY + 40 * scale)
  ctx.lineTo(leftX2 + 10, topY + 40 * scale)
  ctx.moveTo(leftX1 - 10, topY)
  ctx.lineTo(leftX2 + 10, topY)
  ctx.stroke()

  // Right Scaffolding Tower
  const rightX1 = width * 0.78
  const rightX2 = width * 0.92

  ctx.beginPath()
  ctx.moveTo(rightX1, stageY + 15)
  ctx.lineTo(rightX1, topY)
  ctx.moveTo(rightX2, stageY + 15)
  ctx.lineTo(rightX2, topY)
  // Cross bracing
  ctx.moveTo(rightX1, stageY)
  ctx.lineTo(rightX2, topY + 40 * scale)
  ctx.moveTo(rightX2, stageY)
  ctx.lineTo(rightX1, topY + 40 * scale)
  // Horizontal bars
  ctx.moveTo(rightX1 - 10, topY + 40 * scale)
  ctx.lineTo(rightX2 + 10, topY + 40 * scale)
  ctx.moveTo(rightX1 - 10, topY)
  ctx.lineTo(rightX2 + 10, topY)
  ctx.stroke()

  // Main Heavy Header Crossbeam across top
  ctx.fillStyle = timberHighlight
  ctx.strokeStyle = timberColor
  ctx.lineWidth = 2
  ctx.fillRect(leftX1 - 15, topY - 4 * scale, rightX2 - leftX1 + 30, 8 * scale)
  ctx.strokeRect(leftX1 - 15, topY - 4 * scale, rightX2 - leftX1 + 30, 8 * scale)

  // Rope knots at joints
  ctx.fillStyle = ropeColor
  const joints = [
    [leftX1, topY],
    [leftX2, topY],
    [leftX1, topY + 40 * scale],
    [leftX2, topY + 40 * scale],
    [rightX1, topY],
    [rightX2, topY],
    [rightX1, topY + 40 * scale],
    [rightX2, topY + 40 * scale],
  ]
  for (const [jx, jy] of joints) {
    if (jx != null && jy != null) {
      ctx.beginPath()
      ctx.arc(jx, jy, 4 * scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Leaning wooden ladder on right scaffolding
  ctx.save()
  ctx.translate(rightX1 - 18 * scale, stageY + 5)
  ctx.rotate(-0.2)
  ctx.strokeStyle = '#735133'
  ctx.lineWidth = 2.5 * scale
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -75 * scale)
  ctx.moveTo(12 * scale, 0)
  ctx.lineTo(12 * scale, -75 * scale)
  for (let r = 10; r < 75; r += 12) {
    ctx.moveTo(0, -r * scale)
    ctx.lineTo(12 * scale, -r * scale)
  }
  ctx.stroke()
  ctx.restore()

  // Hanging Pulley Wheel on header beam
  const pulleyX = width * 0.62
  ctx.strokeStyle = '#2a2016'
  ctx.lineWidth = 2 * scale
  ctx.beginPath()
  ctx.arc(pulleyX, topY + 10 * scale, 6 * scale, 0, Math.PI * 2)
  ctx.stroke()

  // Dangling rope with hook
  ctx.strokeStyle = ropeColor
  ctx.beginPath()
  ctx.moveTo(pulleyX, topY + 16 * scale)
  ctx.lineTo(pulleyX, topY + 42 * scale)
  ctx.stroke()
  ctx.strokeStyle = '#8a7968'
  ctx.lineWidth = 2 * scale
  ctx.beginPath()
  ctx.arc(pulleyX - 2 * scale, topY + 45 * scale, 3 * scale, 0, Math.PI)
  ctx.stroke()

  ctx.restore()
}

function drawConstructionBanner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  accentColor: string,
  elapsedMs: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  const bannerSway = Math.sin(elapsedMs * 0.0015) * 0.03
  ctx.rotate(bannerSway)

  const bannerW = 230 * scale
  const bannerH = 24 * scale

  // Wooden Signboard Planks
  ctx.fillStyle = '#3a2718'
  ctx.strokeStyle = '#5a3d24'
  ctx.lineWidth = 2
  ctx.fillRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH)
  ctx.strokeRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH)

  // Iron corner brackets with rivets
  ctx.fillStyle = '#8c7660'
  const rivets = [
    [-bannerW / 2 + 5, -bannerH / 2 + 5],
    [bannerW / 2 - 5, -bannerH / 2 + 5],
    [-bannerW / 2 + 5, bannerH / 2 - 5],
    [bannerW / 2 - 5, bannerH / 2 - 5],
  ]
  for (const [rx, ry] of rivets) {
    if (rx != null && ry != null) {
      ctx.beginPath()
      ctx.arc(rx, ry, 2 * scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Yellow Hazard Stripes on edges
  ctx.fillStyle = '#eab308'
  ctx.fillRect(-bannerW / 2 + 8, -bannerH / 2 + 2, 8 * scale, bannerH - 4)
  ctx.fillRect(bannerW / 2 - 16 * scale, -bannerH / 2 + 2, 8 * scale, bannerH - 4)

  // Text: "STAGE IN PROGRESS"
  ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = accentColor
  ctx.shadowColor = accentColor
  ctx.shadowBlur = 4
  ctx.fillText('⚡ STAGE IN PROGRESS · GOBLIN CREW ⚡', 0, 0)
  ctx.shadowBlur = 0

  ctx.restore()
}

function drawUnfinishedStageFloor(
  ctx: CanvasRenderingContext2D,
  width: number,
  stageY: number,
  scale: number,
): void {
  ctx.save()

  const plankCount = 20
  const plankW = (width * 0.88) / plankCount
  const startX = width * 0.06

  ctx.fillStyle = '#261a12'
  ctx.fillRect(startX - 10, stageY + 6 * scale, width * 0.88 + 20, 18 * scale)

  for (let p = 0; p < plankCount; p++) {
    const px = startX + p * plankW
    const isPlaced = p % 6 !== 4
    const plankColor = p % 2 === 0 ? '#543b27' : '#694a31'

    if (isPlaced) {
      ctx.fillStyle = plankColor
      ctx.strokeStyle = '#2b1b10'
      ctx.lineWidth = 1.5
      ctx.fillRect(px, stageY - 2 * scale, plankW - 2, 10 * scale)
      ctx.strokeRect(px, stageY - 2 * scale, plankW - 2, 10 * scale)

      // Nail dots
      ctx.fillStyle = '#9e8b77'
      ctx.fillRect(px + 3, stageY, 2, 2)
      ctx.fillRect(px + plankW - 6, stageY, 2, 2)
    }
  }

  // Wooden Toolbox on left side
  ctx.fillStyle = '#854d0e'
  ctx.fillRect(width * 0.08, stageY - 6 * scale, 22 * scale, 12 * scale)
  ctx.fillStyle = '#451a03'
  ctx.fillRect(width * 0.08 + 2, stageY - 4 * scale, 18 * scale, 3 * scale)
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 1.5 * scale
  ctx.beginPath()
  ctx.moveTo(width * 0.08 + 5, stageY - 6 * scale)
  ctx.lineTo(width * 0.08 + 5, stageY - 12 * scale)
  ctx.lineTo(width * 0.08 + 17 * scale, stageY - 12 * scale)
  ctx.lineTo(width * 0.08 + 17 * scale, stageY - 6 * scale)
  ctx.stroke()

  // Lumber stack on right side
  for (let l = 0; l < 4; l++) {
    ctx.fillStyle = l % 2 === 0 ? '#785332' : '#5c3e24'
    ctx.fillRect(width * 0.9 - l * 2, stageY - (l * 4 + 4) * scale, 24 * scale, 4 * scale)
  }

  ctx.restore()
}

// -------------------------------------------------------------
// Modular Construction Crew Member Rendering
// -------------------------------------------------------------

type DrawConstructionMemberParams = {
  ctx: CanvasRenderingContext2D
  member: GoblinMemberId
  role: ConstructionRoleId
  x: number
  y: number
  scale: number
  beatTime: number
  bounce: number
  headBang: number
  doubleTime: number
  elapsedMs: number
  isMusic: boolean
  primaryAccent: string
  secondaryAccent: string
  magicRuneColor: string
}

function drawGoblinConstructionMember({
  ctx,
  member,
  role,
  x,
  y,
  scale,
  beatTime,
  bounce,
  headBang,
  doubleTime,
  elapsedMs,
  isMusic,
  primaryAccent,
  secondaryAccent,
  magicRuneColor,
}: DrawConstructionMemberParams): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)

  switch (role) {
    case 'carpenter': {
      const hammerCycle = (beatTime * 1.5) % 1
      const hammerAngle = hammerCycle < 0.65 ? -0.8 + hammerCycle * 2.6 : 0.9 - (hammerCycle - 0.65) * 4.8
      const isImpact = hammerCycle > 0.6 && hammerCycle < 0.72

      // Boots & Pants
      ctx.fillStyle = '#1c1612'
      ctx.fillRect(-10, -8, 7, 10)
      ctx.fillRect(3, -8, 7, 10)

      // Torso with Leather Carpenter Apron
      ctx.fillStyle = '#3a2b1f'
      ctx.fillRect(-11, -30, 22, 24)
      ctx.fillStyle = '#854d0e'
      ctx.fillRect(-9, -26, 18, 20) // Apron
      // Toolbelt with Nails
      ctx.fillStyle = '#451a03'
      ctx.fillRect(-10, -14, 20, 4)
      ctx.fillStyle = '#d4d4d8'
      ctx.fillRect(-6, -12, 2, 4)
      ctx.fillRect(-2, -12, 2, 4)
      ctx.fillRect(2, -12, 2, 4)

      // Head
      ctx.save()
      ctx.translate(0, -32 + headBang * 3)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      // Carpenter pencil in mouth
      ctx.fillStyle = '#eab308'
      ctx.fillRect(-7, 2, 14, 2)
      ctx.restore()

      // Arms & Heavy Hammer
      ctx.save()
      ctx.translate(6, -26)
      ctx.rotate(hammerAngle)
      ctx.fillStyle = '#5c8a42'
      ctx.fillRect(-2, -4, 5, 14)
      ctx.fillStyle = '#a16207'
      ctx.fillRect(0, -22, 4, 32)
      ctx.fillStyle = '#3f3f46'
      ctx.strokeStyle = '#71717a'
      ctx.lineWidth = 1
      ctx.fillRect(-5, -28, 14, 8)
      ctx.strokeRect(-5, -28, 14, 8)
      ctx.restore()

      // Hammer Impact Spark Explosion
      if (isImpact) {
        ctx.save()
        ctx.translate(14, 0)
        ctx.fillStyle = '#fef08a'
        ctx.shadowColor = primaryAccent
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(0, 0, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        for (let sp = 0; sp < 6; sp++) {
          const ang = (Math.PI * 2 * sp) / 6
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(Math.cos(ang) * 14, Math.sin(ang) * 14)
          ctx.stroke()
        }
        ctx.shadowBlur = 0
        ctx.restore()
      }

      // Crate of Skull Drums next to Carpenter
      ctx.fillStyle = '#451a03'
      ctx.fillRect(-26, -14, 14, 14)
      ctx.strokeStyle = '#78350f'
      ctx.strokeRect(-26, -14, 14, 14)
      ctx.fillStyle = '#f5ede0'
      ctx.beginPath()
      ctx.arc(-19, -10, 4, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'sawyer': {
      const sawStroke = Math.sin(beatTime * Math.PI * 3.5) * 14

      // Wooden Sawhorse on the right
      ctx.strokeStyle = '#5c4028'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(14, 0)
      ctx.lineTo(24, -18)
      ctx.lineTo(34, 0)
      ctx.stroke()
      // Plank resting on sawhorse
      ctx.fillStyle = '#854d0e'
      ctx.fillRect(8, -22, 34, 6)

      // Goblin Legs
      ctx.fillStyle = '#1c1612'
      ctx.fillRect(-12, -8, 6, 10)
      ctx.save()
      ctx.translate(2, -4)
      ctx.rotate(-0.35)
      ctx.fillRect(0, -6, 6, 12)
      ctx.restore()

      // Torso
      ctx.fillStyle = '#261e18'
      ctx.fillRect(-10, -32, 20, 26)

      // Head
      ctx.save()
      ctx.translate(0, -34)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      ctx.restore()

      // Hands & Large Jagged Timber Saw
      ctx.save()
      ctx.translate(12 + sawStroke, -20)
      ctx.fillStyle = '#71717a'
      ctx.strokeStyle = '#d4d4d8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-18, -4)
      ctx.lineTo(24, -4)
      ctx.lineTo(28, 4)
      ctx.lineTo(-14, 4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Saw Teeth
      ctx.fillStyle = '#a1a1aa'
      for (let st = -12; st <= 22; st += 4) {
        ctx.beginPath()
        ctx.moveTo(st, 4)
        ctx.lineTo(st + 2, 8)
        ctx.lineTo(st + 4, 4)
        ctx.fill()
      }

      // Handles
      ctx.fillStyle = '#78350f'
      ctx.fillRect(-22, -8, 5, 14)
      ctx.fillRect(26, -8, 5, 14)

      // Arms
      ctx.fillStyle = '#5c8a42'
      ctx.fillRect(-16, -10, 6, 8)
      ctx.restore()

      // Golden Sawdust
      ctx.fillStyle = '#fde047'
      for (let sd = 0; sd < 6; sd++) {
        const spX = 24 + Math.sin(doubleTime * 3 + sd) * 8
        const spY = -18 - Math.abs(Math.sin(doubleTime * 4 + sd)) * 14
        ctx.fillRect(spX, spY, 2, 2)
      }

      // Spiked Lute leaning safely against wood stack
      ctx.save()
      ctx.translate(-22, -2)
      ctx.rotate(-0.35)
      ctx.fillStyle = '#1e140d'
      ctx.beginPath()
      ctx.ellipse(0, -6, 7, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#3a2012'
      ctx.fillRect(-2, -28, 4, 24)
      ctx.restore()
      break
    }

    case 'foreman': {
      const foremanBob = bounce * 5

      // Boots & Legs
      ctx.fillStyle = '#1c1612'
      ctx.fillRect(-9, -8 + foremanBob, 6, 10)
      ctx.fillRect(3, -8, 6, 10)

      // Torso & Safety Vest
      ctx.fillStyle = '#261e18'
      ctx.fillRect(-11, -32, 22, 25)
      ctx.fillStyle = '#ea580c'
      ctx.fillRect(-10, -31, 20, 20)
      ctx.fillStyle = '#f4f4f5'
      ctx.fillRect(-10, -22, 20, 3)

      // Left Hand holding Blueprint Scroll
      ctx.save()
      ctx.translate(-14, -22)
      ctx.rotate(-0.2)
      ctx.fillStyle = '#1e3a8a'
      ctx.strokeStyle = '#93c5fd'
      ctx.lineWidth = 1
      ctx.fillRect(-8, -12, 16, 22)
      ctx.strokeRect(-8, -12, 16, 22)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.beginPath()
      ctx.moveTo(-6, -4)
      ctx.lineTo(6, -4)
      ctx.moveTo(-6, 2)
      ctx.lineTo(6, 2)
      ctx.stroke()
      ctx.restore()

      // Head
      ctx.save()
      ctx.translate(0, -33 + foremanBob)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      // Hardhat on foreman
      ctx.fillStyle = '#eab308'
      ctx.strokeStyle = '#ca8a04'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(0, -8, 13, 7, 0, Math.PI, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillRect(-14, -8, 28, 3)
      ctx.restore()

      // Right Hand holding Megaphone
      ctx.save()
      ctx.translate(8, -26 + foremanBob)
      ctx.rotate(0.15)
      ctx.fillStyle = '#5c8a42'
      ctx.fillRect(-3, -3, 6, 6)
      ctx.fillStyle = '#d97706'
      ctx.strokeStyle = '#b45309'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(18, -9)
      ctx.lineTo(18, 9)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Sound pulse & exclamation mark
      const shoutPulse = (beatTime * 2) % 1
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1.5 * (1 - shoutPulse)
      ctx.globalAlpha = 1 - shoutPulse
      ctx.beginPath()
      ctx.arc(22 + shoutPulse * 16, 0, 4 + shoutPulse * 10, -0.6, 0.6)
      ctx.stroke()
      ctx.globalAlpha = 1

      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = secondaryAccent
      ctx.fillText('!', 24 + shoutPulse * 14, -10)
      ctx.restore()
      break
    }

    case 'craneMage': {
      const hoverOffset = Math.sin(elapsedMs * 0.003) * 12 * scale
      ctx.translate(0, -18 * scale + hoverOffset)

      // Levitation Aura
      ctx.save()
      ctx.translate(0, 10)
      ctx.scale(1, 0.3)
      ctx.beginPath()
      ctx.arc(0, 0, 16, 0, Math.PI * 2)
      ctx.fillStyle = isMusic ? 'rgba(192, 132, 252, 0.4)' : 'rgba(234, 179, 8, 0.4)'
      ctx.shadowColor = primaryAccent
      ctx.shadowBlur = 10
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.restore()

      // Wizard Robes
      ctx.fillStyle = '#2e1840'
      ctx.beginPath()
      ctx.moveTo(-10, -18)
      ctx.lineTo(10, -18)
      ctx.lineTo(14 + Math.sin(beatTime * 3) * 3, 6)
      ctx.lineTo(-14 + Math.sin(beatTime * 3 + 1) * 3, 6)
      ctx.closePath()
      ctx.fill()

      // Head
      ctx.save()
      ctx.translate(0, -26)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)
      ctx.restore()

      // Raised Staff
      ctx.save()
      ctx.translate(-6, -18)
      ctx.rotate(-0.4)
      ctx.fillStyle = '#543b24'
      ctx.fillRect(-2, -36, 4, 48)

      // Glowing Crystal Orb
      const orbX = 0
      const orbY = -38
      ctx.fillStyle = primaryAccent
      ctx.shadowColor = primaryAccent
      ctx.shadowBlur = 15
      ctx.beginPath()
      ctx.arc(orbX, orbY, 6 + bounce * 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.restore()

      // Floating Timber Beam in mid-air
      const beamX = -25
      const beamY = -65 + Math.sin(elapsedMs * 0.002) * 5
      const beamW = 90
      const beamH = 10

      ctx.strokeStyle = magicRuneColor
      ctx.lineWidth = 3
      ctx.shadowColor = primaryAccent
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(-16, -42)
      ctx.quadraticCurveTo(-10, -70, beamX + beamW / 2, beamY + 5)
      ctx.stroke()
      ctx.shadowBlur = 0

      ctx.fillStyle = '#785332'
      ctx.strokeStyle = '#4a3220'
      ctx.lineWidth = 1.5
      ctx.fillRect(beamX, beamY, beamW, beamH)
      ctx.strokeRect(beamX, beamY, beamW, beamH)

      // Arcane Rune Rings
      ctx.save()
      ctx.translate(beamX + beamW / 2, beamY + beamH / 2)
      ctx.rotate(elapsedMs * 0.001)
      ctx.strokeStyle = isMusic ? 'rgba(56, 189, 248, 0.6)' : 'rgba(234, 179, 8, 0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.arc(0, 0, 22, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      break
    }

    case 'hauler': {
      const waddle = Math.sin(beatTime * Math.PI * 2) * 0.12
      const haulerBob = bounce * 4

      // Heavy Stomping Legs
      ctx.fillStyle = '#1c1612'
      ctx.fillRect(-10, -8 + haulerBob, 7, 10)
      ctx.fillRect(3, -8, 7, 10)

      // Torso bent forward
      ctx.save()
      ctx.translate(0, -22)
      ctx.rotate(0.2 + waddle)
      ctx.fillStyle = '#261e18'
      ctx.fillRect(-12, -10, 24, 22)

      // Stack of 3 Heavy Lumber Logs
      for (let log = 0; log < 3; log++) {
        ctx.fillStyle = log % 2 === 0 ? '#694a31' : '#543b27'
        ctx.strokeStyle = '#2b1a10'
        ctx.lineWidth = 1.5
        ctx.fillRect(-32 + log * 4, -28 + log * 9, 36, 8)
        ctx.strokeRect(-32 + log * 4, -28 + log * 9, 36, 8)
      }
      ctx.strokeStyle = '#b58c54'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-18, -30)
      ctx.lineTo(-14, 0)
      ctx.stroke()

      // Head
      ctx.save()
      ctx.translate(8, -14)
      drawGoblinHead(ctx, member, isMusic, primaryAccent)

      // Metal Whistle in mouth
      ctx.fillStyle = '#cbd5e1'
      ctx.strokeStyle = '#64748b'
      ctx.lineWidth = 1
      ctx.fillRect(5, 0, 8, 4)
      ctx.strokeRect(5, 0, 8, 4)

      // Whistle Blast Sound Rings
      const whistlePulse = (beatTime * 2.5) % 1
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1.5 * (1 - whistlePulse)
      ctx.globalAlpha = 1 - whistlePulse
      ctx.beginPath()
      ctx.arc(16 + whistlePulse * 14, 2, 3 + whistlePulse * 8, -0.7, 0.7)
      ctx.stroke()
      ctx.globalAlpha = 1

      // Sweat droplets popping off brow
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.arc(-6, -8 - haulerBob, 2, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
      ctx.restore()
      break
    }
  }

  ctx.restore()
}

function drawConstructionSawdustAndSparks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  isMusic: boolean,
): void {
  const particleCount = 28
  for (let p = 0; p < particleCount; p++) {
    const seed = p * 6173
    const speed = 0.0003 + (p % 5) * 0.0001
    const progress = (elapsedMs * speed + pseudoRandom(seed)) % 1

    const startX = width * (0.1 + pseudoRandom(seed + 1) * 0.8)
    const driftX = Math.sin(elapsedMs * 0.002 + p) * 25
    const px = startX + driftX
    const py = height * 0.2 + progress * (height * 0.65)

    const alpha = Math.sin(progress * Math.PI) * 0.75
    if (alpha <= 0.05) continue

    const isSpark = p % 4 === 0
    ctx.save()
    ctx.globalAlpha = alpha

    if (isSpark) {
      ctx.fillStyle = isMusic ? '#38bdf8' : '#fef08a'
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 4
      ctx.fillRect(px, py, 2.5, 2.5)
    } else {
      ctx.fillStyle = p % 2 === 0 ? '#fde047' : '#ca8a04'
      ctx.fillRect(px, py, 2, 2)
    }

    ctx.restore()
  }
}

// =============================================================
// GOBLIN BAND RESTING STATE (WHEN MODEL LOADED & IDLE)
// =============================================================

function drawSleepZzz(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  elapsedMs: number,
  color = '#fde047',
): void {
  const zzzCount = 3
  for (let i = 0; i < zzzCount; i++) {
    const cycle = (elapsedMs * 0.0006 + i * 0.33) % 1
    const px = x + Math.sin(cycle * Math.PI * 2) * 8 + i * 5
    const py = y - cycle * 24
    const alpha = Math.sin(cycle * Math.PI) * 0.85
    if (alpha <= 0.05) continue

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.font = `italic bold ${8 + i * 3}px monospace`
    ctx.fillText(i === 2 ? 'Z' : 'z', px, py)
    ctx.restore()
  }
}

function drawGoblinAlertIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  bounce: number,
): void {
  ctx.save()
  ctx.translate(x, y - 8 * bounce)
  ctx.scale(scale, scale)

  // Glowing bubble
  ctx.fillStyle = '#ffea75'
  ctx.shadowColor = '#ffea75'
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.arc(0, 0, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Exclamation point
  ctx.fillStyle = '#16110d'
  ctx.fillRect(-1.5, -5, 3, 5)
  ctx.fillRect(-1.5, 2, 3, 3)

  ctx.restore()
}

export function drawGoblinInteractionPopup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  text: string,
  progress: number,
  primaryAccent: string,
): void {
  const p = Math.max(0, Math.min(1, progress))
  const floatY = y - p * 24 * scale
  const alpha = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1
  const popScale = (p < 0.15 ? 0.75 + (p / 0.15) * 0.25 : 1) * scale

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.translate(x, floatY)
  ctx.scale(popScale, popScale)

  ctx.font = 'bold 11px monospace'
  const textW =
    typeof ctx.measureText === 'function' ? ctx.measureText(text).width : text.length * 7
  const boxW = Math.max(48, textW + 16)
  const boxH = 22

  // Bubble container
  ctx.fillStyle = '#1e140d'
  ctx.strokeStyle = primaryAccent
  ctx.lineWidth = 1.5
  ctx.shadowColor = primaryAccent
  ctx.shadowBlur = 8
  ctx.fillRect(-boxW / 2, -boxH - 8, boxW, boxH)
  ctx.strokeRect(-boxW / 2, -boxH - 8, boxW, boxH)
  ctx.shadowBlur = 0

  // Bubble tail pointing downward to goblin
  ctx.fillStyle = '#1e140d'
  ctx.beginPath()
  ctx.moveTo(-5, -8)
  ctx.lineTo(0, -1)
  ctx.lineTo(5, -8)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = primaryAccent
  ctx.beginPath()
  ctx.moveTo(-5, -8)
  ctx.lineTo(0, -1)
  ctx.lineTo(5, -8)
  ctx.stroke()

  // Text
  ctx.fillStyle = '#fef08a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, -boxH / 2 - 8)

  // Floating sparkle particles
  for (let s = 0; s < 3; s++) {
    const sAngle = (s * Math.PI * 2) / 3 + p * Math.PI
    const sx = Math.cos(sAngle) * (boxW * 0.55)
    const sy = -boxH / 2 - 8 + Math.sin(sAngle) * 12
    ctx.fillStyle = primaryAccent
    ctx.beginPath()
    ctx.arc(sx, sy, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

export function getGoblinHitTarget(
  canvasX: number,
  canvasY: number,
  width: number,
  height: number,
  visualState: GoblinVisualState = 'resting',
  completedCount = 0,
): GoblinHitTarget | null {
  if (visualState === 'hidden' || width <= 0 || height <= 0) return null

  if (visualState === 'loading') {
    const stageScale = Math.min(width / 720, height / 230, 1.2)
    const stageY = height * 0.78
    const goblinBaseY = stageY + 2 * stageScale
    const crew = getConstructionCrew(completedCount)
    const xRatios = [0.18, 0.34, 0.5, 0.68, 0.85]

    for (let i = 0; i < 5; i++) {
      const gx = width * xRatios[i]
      const gy = goblinBaseY - 20 * stageScale
      const hitRadius = 42 * stageScale
      const dist = Math.hypot(canvasX - gx, canvasY - gy)
      if (dist <= hitRadius) {
        return {
          slotIndex: i,
          member: crew[i].member,
          role: crew[i].role,
          x: gx,
          y: gy,
        }
      }
    }
    return null
  }

  // Resting or Playing
  const stageScale = Math.min(width / 700, height / 220, 1.25)
  const stageY = height * 0.78
  const goblinBaseY = stageY + 5
  const lineup = getBandLineup(completedCount)
  const xRatios = [0.2, 0.37, 0.52, 0.68, 0.83]
  const yOffsets = [-10 * stageScale, 0, 4 * stageScale, 0, -8 * stageScale]

  for (let i = 0; i < 5; i++) {
    const gx = width * xRatios[i]
    const gy = goblinBaseY + yOffsets[i] - 18 * stageScale
    const hitRadius = 42 * stageScale
    const dist = Math.hypot(canvasX - gx, canvasY - gy)
    if (dist <= hitRadius) {
      return {
        slotIndex: i,
        member: lineup[i].member,
        instrument: lineup[i].instrument,
        x: gx,
        y: gy,
      }
    }
  }

  return null
}

export function getGoblinInteractionPhrase(
  _slotIndex: number,
  visualState: GoblinVisualState,
  _member: GoblinMemberId,
  instrument?: GoblinInstrumentId,
  role?: ConstructionRoleId,
): string {
  if (visualState === 'loading') {
    switch (role) {
      case 'carpenter':
        return 'Hammer time! 🔨'
      case 'sawyer':
        return 'Measure twice! 🪚'
      case 'foreman':
        return 'On schedule! 📋'
      case 'craneMage':
        return 'Heavy lifting! ✨'
      case 'hauler':
        return 'Goblin power! 💪'
      default:
        return 'Building stage! 🏗️'
    }
  }

  if (visualState === 'playing') {
    switch (instrument) {
      case 'drums':
        return 'DRUM SOLO! 🥁🔥'
      case 'guitar':
        return 'SHREDDING! ⚡🎸'
      case 'mic':
        return 'YEAAAH! 🤘🎤'
      case 'wizardStaff':
        return 'MANA BLAST! 🌌🔮'
      case 'warHorn':
        return 'SONIC BOOM! 🎺💥'
      default:
        return 'ROCK ON! 🤘🔥'
    }
  }

  // Resting state
  switch (instrument) {
    case 'drums':
      return 'Huh?! 5 more mins... 🥁'
    case 'guitar':
      return 'Cheers! ☕'
    case 'mic':
      return 'Mi-mi-mi! 🎤'
    case 'wizardStaff':
      return 'Arcane spark! ✨'
    case 'warHorn':
      return 'TOOT! 🎺💨'
    default:
      return 'Resting... 💤'
  }
}

export function playGoblinInteractionSound(
  slotIndex: number,
  visualState: GoblinVisualState = 'resting',
): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    const now = ctx.currentTime
    const baseFreqs = [220, 330, 440, 587, 260]
    const freq = baseFreqs[slotIndex % 5]

    if (visualState === 'resting') {
      osc.type = slotIndex === 3 ? 'sine' : slotIndex === 0 ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(freq, now)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.3, now + 0.15)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
      osc.start(now)
      osc.stop(now + 0.25)
    } else if (visualState === 'loading') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(freq * 1.5, now)
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.1)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      osc.start(now)
      osc.stop(now + 0.12)
    } else {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(freq, now)
      osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.08)
      osc.frequency.linearRampToValueAtTime(freq * 2, now + 0.18)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
    }
  } catch {
    /* AudioContext not available or blocked, ignore */
  }
}

function drawRestingStageBackdrop(
  ctx: CanvasRenderingContext2D,
  stageCenterX: number,
  y: number,
  scale: number,
  primaryAccent: string,
  elapsedMs: number,
): void {
  ctx.save()
  ctx.translate(stageCenterX, y)
  ctx.scale(scale, scale)

  // Hanging chains
  ctx.strokeStyle = '#4a3828'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-100, -20)
  ctx.lineTo(-100, 0)
  ctx.moveTo(100, -20)
  ctx.lineTo(100, 0)
  ctx.stroke()

  // Sign Board
  ctx.fillStyle = '#1e140c'
  ctx.strokeStyle = '#5a422d'
  ctx.lineWidth = 2
  ctx.fillRect(-110, 0, 220, 24)
  ctx.strokeRect(-110, 0, 220, 24)

  // Inner border
  ctx.strokeStyle = primaryAccent
  ctx.lineWidth = 1
  ctx.strokeRect(-106, 3, 212, 18)

  // Corner rivets
  ctx.fillStyle = primaryAccent
  ctx.fillRect(-108, 2, 3, 3)
  ctx.fillRect(105, 2, 3, 3)
  ctx.fillRect(-108, 19, 3, 3)
  ctx.fillRect(105, 19, 3, 3)

  // Text: "STAGE READY • RESTING"
  ctx.fillStyle = primaryAccent
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('STAGE READY • RESTING', 0, 12)

  // Subtle breathing rune glow on the sides
  const runeGlow = Math.sin(elapsedMs * 0.002) * 0.3 + 0.7
  ctx.fillStyle = `rgba(228, 195, 106, ${runeGlow * 0.5})`
  ctx.fillText('ᚱ', -90, 12)
  ctx.fillText('ᚱ', 90, 12)

  ctx.restore()
}

type DrawRestingMemberParams = {
  ctx: CanvasRenderingContext2D
  member: GoblinMemberId
  instrument: GoblinInstrumentId
  x: number
  y: number
  scale: number
  elapsedMs: number
  isMusic: boolean
  primaryAccent: string
  secondaryAccent: string
  slotIndex: number
  expression?: GoblinExpression
}

function drawGoblinRestingMember({
  ctx,
  member,
  instrument,
  x,
  y,
  scale,
  elapsedMs,
  isMusic,
  primaryAccent,
  secondaryAccent,
  slotIndex,
  expression = 'sleep',
}: DrawRestingMemberParams): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)

  const breath = Math.sin(elapsedMs * 0.0016 + slotIndex * 1.3) * 0.5 + 0.5
  const breathY = breath * 2.5

  switch (instrument) {
    case 'drums': {
      // Drum kit base resting on stage
      // Bass drum
      ctx.fillStyle = '#2b1f16'
      ctx.beginPath()
      ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8b6f38'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Left & Right Toms
      ctx.fillStyle = '#201812'
      ctx.beginPath()
      ctx.ellipse(-26, -10, 14, 8, -0.2, 0, Math.PI * 2)
      ctx.ellipse(26, -10, 14, 8, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#634b35'
      ctx.stroke()

      // Still Cymbal on stand
      ctx.beginPath()
      ctx.moveTo(38, 0)
      ctx.lineTo(42, -35)
      ctx.strokeStyle = '#5a422d'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#b38f38'
      ctx.beginPath()
      ctx.ellipse(42, -35, 16, 5, 0, 0, Math.PI * 2)
      ctx.fill()

      // Crossed drumsticks resting on the snare
      ctx.strokeStyle = '#fef08a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-10, -5)
      ctx.lineTo(8, 5)
      ctx.moveTo(10, -5)
      ctx.lineTo(-8, 5)
      ctx.stroke()

      // Drummer Slumped forward asleep
      ctx.translate(0, -18 + breathY)

      // Torso
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#1c1510'
      ctx.fillRect(-11, -10, 22, 20)

      // Folded arms resting forward
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(-10, -2)
      ctx.lineTo(0, 4)
      ctx.lineTo(10, -2)
      ctx.stroke()

      // Head resting forward
      ctx.save()
      ctx.translate(0, -14)
      ctx.rotate(0.08 * Math.sin(elapsedMs * 0.0012))
      drawGoblinHead(ctx, member, isMusic, primaryAccent, expression)
      ctx.restore()

      // Zzz sleep bubbles
      if (expression === 'sleep') {
        drawSleepZzz(ctx, 4, -32, elapsedMs)
      }
      break
    }

    case 'guitar': {
      // Guitar amp cabinet behind
      ctx.fillStyle = '#1e140d'
      ctx.strokeStyle = '#42301f'
      ctx.lineWidth = 1.5
      ctx.fillRect(-32, -38, 22, 38)
      ctx.strokeRect(-32, -38, 22, 38)
      // Amp power light (soft warm amber)
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.arc(-28, -32, 1.5, 0, Math.PI * 2)
      ctx.fill()

      // Guitar on stand
      ctx.save()
      ctx.translate(-22, -8)
      ctx.rotate(0.2)
      // Guitar body
      ctx.fillStyle = isMusic ? '#6b21a8' : '#8b2e2e'
      ctx.beginPath()
      ctx.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2)
      ctx.fill()
      // Neck
      ctx.strokeStyle = '#c4a35a'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(0, -10)
      ctx.lineTo(0, -32)
      ctx.stroke()
      ctx.restore()

      // Goblin sitting cross-legged on stage
      ctx.translate(2, -12 + breathY)

      // Torso
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#18120d'
      ctx.fillRect(-10, -10, 20, 20)

      // Cross-legged sitting legs
      ctx.fillStyle = '#2d2218'
      ctx.beginPath()
      ctx.ellipse(0, 10, 14, 6, 0, 0, Math.PI * 2)
      ctx.fill()

      // Holding a warm mug of grog
      ctx.fillStyle = '#5c8a42' // hands
      ctx.fillRect(-8, 0, 4, 4)
      ctx.fillRect(4, 0, 4, 4)

      // Goblin Mug
      ctx.fillStyle = '#78350f'
      ctx.strokeStyle = '#c4a35a'
      ctx.lineWidth = 1
      ctx.fillRect(-4, -2, 8, 9)
      ctx.strokeRect(-4, -2, 8, 9)

      // Rising steam from mug
      const steamCycle = (elapsedMs * 0.0015) % 1
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.4)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(0, -3)
      ctx.quadraticCurveTo(Math.sin(elapsedMs * 0.003) * 4, -10 - steamCycle * 8, Math.cos(elapsedMs * 0.003) * 3, -16 - steamCycle * 8)
      ctx.stroke()

      // Head
      ctx.save()
      ctx.translate(0, -18)
      ctx.rotate(Math.sin(elapsedMs * 0.001) * 0.05)
      drawGoblinHead(ctx, member, isMusic, primaryAccent, expression === 'sleep' ? 'smile' : expression)
      ctx.restore()
      break
    }

    case 'mic': {
      // Wooden Stage Roadcase / Equipment Trunk
      ctx.fillStyle = '#1f150e'
      ctx.strokeStyle = '#5a422d'
      ctx.lineWidth = 1.5
      ctx.fillRect(-18, -14, 36, 14)
      ctx.strokeRect(-18, -14, 36, 14)
      // Roadcase metal corner protectors
      ctx.fillStyle = '#8b6f38'
      ctx.fillRect(-18, -14, 4, 4)
      ctx.fillRect(14, -14, 4, 4)
      ctx.fillRect(-18, -4, 4, 4)
      ctx.fillRect(14, -4, 4, 4)

      // Mic Stand standing to the right
      ctx.strokeStyle = '#524132'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(24, 0)
      ctx.lineTo(24, -36)
      ctx.stroke()
      // Mic head
      ctx.fillStyle = '#c4a35a'
      ctx.beginPath()
      ctx.ellipse(24, -36, 4, 6, 0, 0, Math.PI * 2)
      ctx.fill()

      // Singer lounging back against roadcase
      ctx.translate(0, -16 + breathY)

      // Torso lounging back
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#18120d'
      ctx.fillRect(-10, -10, 20, 20)

      // Hands clasped behind head
      ctx.strokeStyle = '#5c8a42'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-10, -8)
      ctx.lineTo(-15, -16)
      ctx.lineTo(-6, -18)
      ctx.moveTo(10, -8)
      ctx.lineTo(15, -16)
      ctx.lineTo(6, -18)
      ctx.stroke()

      // Head tilted back in peaceful snooze
      ctx.save()
      ctx.translate(0, -16)
      ctx.rotate(-0.08 + Math.sin(elapsedMs * 0.0015) * 0.04)
      drawGoblinHead(ctx, member, isMusic, primaryAccent, expression)
      ctx.restore()

      // Floating Zzz
      if (expression === 'sleep') {
        drawSleepZzz(ctx, 6, -34, elapsedMs + 600)
      }
      break
    }

    case 'wizardStaff': {
      // Wizard Staff planted securely into floor
      ctx.strokeStyle = '#6b4f2c'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(-18, 0)
      ctx.lineTo(-18, -42)
      ctx.stroke()

      // Crystal head with gentle slow pulse
      const crystalGlow = Math.sin(elapsedMs * 0.002) * 0.3 + 0.7
      ctx.fillStyle = isMusic ? '#38bdf8' : '#e4c36a'
      ctx.shadowColor = ctx.fillStyle
      ctx.shadowBlur = 10 * crystalGlow
      ctx.beginPath()
      ctx.ellipse(-18, -44, 6, 9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // Rotating mini star ring around crystal
      ctx.save()
      ctx.translate(-18, -44)
      ctx.rotate(elapsedMs * 0.001)
      ctx.strokeStyle = secondaryAccent
      ctx.lineWidth = 1
      ctx.setLineDash([3, 5])
      ctx.beginPath()
      ctx.arc(0, 0, 11, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Levitating / Hovering Wizard in Lotus Meditation Pose
      const hoverY = Math.sin(elapsedMs * 0.002) * 4
      ctx.translate(6, -20 + hoverY)

      // Robe & Torso
      ctx.fillStyle = isMusic ? '#2d1840' : '#22160d'
      ctx.beginPath()
      ctx.ellipse(0, 0, 12, 14, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = primaryAccent
      ctx.lineWidth = 1
      ctx.stroke()

      // Crossed meditation legs
      ctx.fillStyle = isMusic ? '#221133' : '#1c1612'
      ctx.beginPath()
      ctx.ellipse(0, 10, 13, 5, 0, 0, Math.PI * 2)
      ctx.fill()

      // Hands on knees in meditation
      ctx.fillStyle = '#5c8a42'
      ctx.beginPath()
      ctx.arc(-11, 6, 3, 0, Math.PI * 2)
      ctx.arc(11, 6, 3, 0, Math.PI * 2)
      ctx.fill()

      // Serene Head
      ctx.save()
      ctx.translate(0, -18)
      drawGoblinHead(ctx, member, isMusic, primaryAccent, expression)
      ctx.restore()

      // Soft magical motes orbiting wizard
      const moteAngle = elapsedMs * 0.0012
      ctx.fillStyle = isMusic ? '#38bdf8' : '#fef08a'
      ctx.beginPath()
      ctx.arc(Math.cos(moteAngle) * 16, Math.sin(moteAngle) * 8 - 4, 1.5, 0, Math.PI * 2)
      ctx.arc(Math.cos(moteAngle + Math.PI) * 16, Math.sin(moteAngle + Math.PI) * 8 - 4, 1.5, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case 'warHorn': {
      // Big Brass War Horn lying on the stage as a comfortable lounger/pillow
      ctx.save()
      ctx.translate(0, -6)
      ctx.rotate(-0.1)

      ctx.fillStyle = '#c4a35a'
      ctx.beginPath()
      ctx.moveTo(-28, 6)
      ctx.quadraticCurveTo(0, 8, 20, -2)
      ctx.lineTo(24, 6)
      ctx.quadraticCurveTo(0, 14, -28, 12)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#e4c36a'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Horn bell on right
      ctx.fillStyle = '#8b6f38'
      ctx.beginPath()
      ctx.ellipse(22, 2, 6, 10, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      // Goblin curled up snoozing against the horn
      ctx.translate(-8, -14 + breathY)

      // Torso curled up
      ctx.fillStyle = member === 'wizard' ? (isMusic ? '#341d4a' : '#2b1e16') : '#18120d'
      ctx.beginPath()
      ctx.ellipse(0, 0, 12, 10, -0.3, 0, Math.PI * 2)
      ctx.fill()

      // Head resting comfortably
      ctx.save()
      ctx.translate(4, -12)
      ctx.rotate(-0.15)
      drawGoblinHead(ctx, member, isMusic, primaryAccent, expression)
      ctx.restore()

      // Floating Zzz
      if (expression === 'sleep') {
        drawSleepZzz(ctx, 12, -28, elapsedMs + 1200)
      }
      break
    }
  }

  ctx.restore()
}

export type GoblinRestingParams = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  elapsedMs: number
  mode?: GenerateMode
  isMusic?: boolean
  primaryAccent?: string
  secondaryAccent?: string
  magicRuneColor?: string
  completedCount?: number
  interactions?: Record<number, GoblinInteraction>
}

export function drawGoblinResting({
  ctx,
  width,
  height,
  elapsedMs,
  mode = 'sfx',
  isMusic = mode === 'music',
  primaryAccent = isMusic ? '#c084fc' : '#e4c36a',
  secondaryAccent = isMusic ? '#38bdf8' : '#e0b15a',
  magicRuneColor = isMusic ? 'rgba(192, 132, 252, 0.5)' : 'rgba(228, 195, 106, 0.5)',
  completedCount = 0,
  interactions,
}: GoblinRestingParams): void {
  // 1. Cozy Stage Background Gradient (Warm ambient tavern / mystic hearth)
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height * 0.48,
    30,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  )
  if (isMusic) {
    bgGrad.addColorStop(0, '#1a1024')
    bgGrad.addColorStop(0.5, '#120a1a')
    bgGrad.addColorStop(1, '#08040d')
  } else {
    bgGrad.addColorStop(0, '#22160d')
    bgGrad.addColorStop(0.5, '#160e09')
    bgGrad.addColorStop(1, '#0d0805')
  }
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  const stageScale = Math.min(width / 700, height / 220, 1.25)
  const stageY = height * 0.78
  const stageCenterX = width * 0.5
  const stageRadiusX = width * 0.42
  const stageRadiusY = height * 0.18

  // 2. Hanging Warm Cozy Lanterns
  drawHangingLantern(ctx, width * 0.12, 0, height * 0.3, elapsedMs * 0.001, '#f59e0b')
  drawHangingLantern(ctx, width * 0.88, 0, height * 0.28, elapsedMs * 0.0012 + 1.5, '#fbbf24')

  // 3. Resting Stage Backdrop Banner
  drawRestingStageBackdrop(ctx, stageCenterX, height * 0.15, stageScale, primaryAccent, elapsedMs)

  // 4. Polished Stage Floor with Calm Faint Rune Sigil
  ctx.beginPath()
  ctx.ellipse(stageCenterX, stageY, stageRadiusX, stageRadiusY, 0, 0, Math.PI * 2)
  ctx.fillStyle = isMusic ? 'rgba(32, 18, 48, 0.65)' : 'rgba(36, 24, 16, 0.65)'
  ctx.fill()
  ctx.strokeStyle = magicRuneColor
  ctx.lineWidth = 1.2
  ctx.stroke()

  // Inner faint rune ring with gentle breathing pulse
  const runeBreath = Math.sin(elapsedMs * 0.0015) * 0.15 + 0.25
  ctx.save()
  ctx.translate(stageCenterX, stageY)
  ctx.scale(1, stageRadiusY / stageRadiusX)
  ctx.beginPath()
  ctx.arc(0, 0, stageRadiusX * 0.75, 0, Math.PI * 2)
  ctx.strokeStyle = isMusic
    ? `rgba(56, 189, 248, ${runeBreath})`
    : `rgba(228, 195, 106, ${runeBreath})`
  ctx.setLineDash([8, 14])
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  // 8 Rite Stones in dimmed amber/purple sleep state
  const totalRites = 8
  for (let i = 0; i < totalRites; i++) {
    const angle = (Math.PI * 2 * i) / totalRites - Math.PI / 2
    const sx = stageCenterX + Math.cos(angle) * (stageRadiusX * 0.88)
    const sy = stageY + Math.sin(angle) * (stageRadiusY * 0.88)

    ctx.beginPath()
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#3a2b1f'
    ctx.fill()
  }

  // 5. The 5 Resting Goblins (positioned across stage, respecting subcategory swapped lineup)
  const goblinBaseY = stageY + 5
  const lineup = getBandLineup(completedCount)
  const xRatios = [0.2, 0.37, 0.52, 0.68, 0.83]
  const yOffsets = [-10 * stageScale, 0, 4 * stageScale, 0, -8 * stageScale]

  for (let i = 0; i < 5; i++) {
    const inter = interactions?.[i]
    const isInteracting = !!inter && Date.now() - inter.startTime < inter.duration
    const expression = isInteracting ? 'alert' : 'sleep'
    const gx = width * xRatios[i]
    const gy = goblinBaseY + yOffsets[i]

    drawGoblinRestingMember({
      ctx,
      member: lineup[i].member,
      instrument: lineup[i].instrument,
      x: gx,
      y: gy,
      scale: stageScale,
      elapsedMs,
      isMusic,
      primaryAccent,
      secondaryAccent,
      slotIndex: i,
      expression,
    })

    if (isInteracting && inter) {
      const interProg = (Date.now() - inter.startTime) / inter.duration
      drawGoblinInteractionPopup(
        ctx,
        gx,
        gy - 38 * stageScale,
        stageScale,
        inter.text,
        interProg,
        primaryAccent,
      )
    }
  }

  // 6. Cozy Floating Embers & Motes
  const emberCount = 14
  for (let e = 0; e < emberCount; e++) {
    const seed = e * 4861
    const progress = (elapsedMs * 0.00025 + pseudoRandom(seed)) % 1
    const ex = width * (0.15 + pseudoRandom(seed + 1) * 0.7) + Math.sin(elapsedMs * 0.001 + e) * 15
    const ey = height * 0.75 - progress * (height * 0.5)
    const alpha = Math.sin(progress * Math.PI) * 0.5
    if (alpha <= 0.05) continue

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = isMusic ? '#c084fc' : '#f59e0b'
    ctx.beginPath()
    ctx.arc(ex, ey, 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

export type GoblinTransitionParams = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  elapsedMs: number
  from: GoblinVisualState
  to: GoblinVisualState
  progress: number
  rite?: number
  totalRites?: number
  phase?: WeavePhase
  mode?: GenerateMode
  isMusic?: boolean
  primaryAccent?: string
  secondaryAccent?: string
  magicRuneColor?: string
  completedCount?: number
}

export function drawGoblinTransition({
  ctx,
  width,
  height,
  elapsedMs,
  from,
  to,
  progress,
  rite = 0,
  totalRites = 8,
  phase = 'weaving',
  mode = 'sfx',
  isMusic = mode === 'music',
  primaryAccent = isMusic ? '#c084fc' : '#e4c36a',
  secondaryAccent = isMusic ? '#38bdf8' : '#e0b15a',
  magicRuneColor = isMusic ? 'rgba(192, 132, 252, 0.75)' : 'rgba(228, 195, 106, 0.75)',
  completedCount = 0,
}: GoblinTransitionParams): void {
  const p = Math.max(0, Math.min(1, progress))
  const stageScale = Math.min(width / 700, height / 220, 1.25)
  const stageY = height * 0.78
  const stageCenterX = width * 0.5
  const goblinBaseY = stageY + 5

  // TRANSITION: LOADING (BUILDING) -> RESTING
  if (from === 'loading' && to === 'resting') {
    // 1. Blend background from workshop to cozy tavern
    drawGoblinResting({
      ctx,
      width,
      height,
      elapsedMs,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount,
    })

    // 2. Fading scaffolding sliding upward/away
    if (p < 0.6) {
      const scaffoldAlpha = 1 - p / 0.6
      ctx.save()
      ctx.globalAlpha = scaffoldAlpha
      drawConstructionScaffolding(ctx, width, height, stageY, stageScale)
      ctx.restore()
    }

    // 3. Workers wiping brow, cheering, stretching, and settling into resting poses
    if (p < 0.7) {
      const crew = getConstructionCrew(completedCount)
      const cheerBob = Math.sin(p * Math.PI * 4) * 4
      const stretchAlpha = 1 - p / 0.7

      ctx.save()
      ctx.globalAlpha = stretchAlpha
      // Overlay celebration banner
      ctx.fillStyle = primaryAccent
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('STAGE COMPLETE! TIME TO REST 🍺', stageCenterX, height * 0.28 - p * 15)

      // Workers celebrating / stretching
      for (let i = 0; i < 5; i++) {
        const xPos = width * (0.18 + i * 0.17)
        ctx.save()
        ctx.translate(xPos, goblinBaseY - cheerBob)
        ctx.scale(stageScale, stageScale)
        drawGoblinHead(ctx, crew[i].member, isMusic, primaryAccent, 'smile')
        ctx.restore()
      }
      ctx.restore()
    }
    return
  }

  // TRANSITION: RESTING -> PLAYING (WEAVING)
  if (from === 'resting' && to === 'playing') {
    // 1. Stage floor & lighting powering up
    const isLate = p > 0.6
    if (isLate) {
      // Draw active band rocking with high energy
      drawGoblinBand({
        ctx,
        width,
        height,
        elapsedMs,
        rite,
        totalRites,
        phase: 'weaving',
        mode,
        completedCount,
        visualState: 'playing',
      })
      // Blast flash transition overlay
      const flashAlpha = Math.max(0, 1 - (p - 0.6) / 0.4) * 0.4
      ctx.save()
      ctx.fillStyle = isMusic ? `rgba(192, 132, 252, ${flashAlpha})` : `rgba(254, 240, 138, ${flashAlpha})`
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
      return
    }

    // 2. Early phase: Startled awake with "!" Alert Icons & Count-In
    drawGoblinResting({
      ctx,
      width,
      height,
      elapsedMs,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount,
    })

    const lineup = getBandLineup(completedCount)
    const alertBounce = Math.abs(Math.sin(p * Math.PI * 4))

    // Pop alert "!" icons above all 5 goblins
    for (let i = 0; i < 5; i++) {
      const xPos = width * (0.2 + i * 0.16)
      drawGoblinAlertIcon(ctx, xPos, goblinBaseY - 32 * stageScale, stageScale, alertBounce)

      // Alert wide eyes on goblins
      ctx.save()
      ctx.translate(xPos, goblinBaseY - 14 * stageScale)
      ctx.scale(stageScale, stageScale)
      drawGoblinHead(ctx, lineup[i].member, isMusic, primaryAccent, 'alert')
      ctx.restore()
    }

    // Count in text banner
    ctx.save()
    ctx.fillStyle = primaryAccent
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'center'
    ctx.shadowColor = primaryAccent
    ctx.shadowBlur = 8
    const countText = p < 0.2 ? 'WAKE UP!' : p < 0.4 ? '1... 2...' : '3... 4... ROCK!'
    ctx.fillText(countText, stageCenterX, height * 0.3)
    ctx.restore()
    return
  }

  // TRANSITION: PLAYING -> RESTING
  if (from === 'playing' && to === 'resting') {
    // 1. Early phase (0 to 0.45): Final Triumph Chord & Crowd Bow
    if (p < 0.45) {
      drawGoblinBand({
        ctx,
        width,
        height,
        elapsedMs,
        rite: totalRites,
        totalRites,
        phase: 'weaving',
        mode,
        completedCount,
        visualState: 'playing',
      })

      // Celebration finishing banner
      ctx.save()
      ctx.fillStyle = primaryAccent
      ctx.font = 'bold 15px monospace'
      ctx.textAlign = 'center'
      ctx.shadowColor = primaryAccent
      ctx.shadowBlur = 10
      ctx.fillText('FINALE! 🤘✨', stageCenterX, height * 0.26)
      ctx.restore()
      return
    }

    // 2. Later phase (0.45 to 1.0): Settling into resting stage
    drawGoblinResting({
      ctx,
      width,
      height,
      elapsedMs,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount,
    })

    // Fading triumph glow
    const settleAlpha = 1 - (p - 0.45) / 0.55
    ctx.save()
    ctx.globalAlpha = Math.max(0, settleAlpha * 0.5)
    ctx.fillStyle = primaryAccent
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('GREAT SET • RESTING', stageCenterX, height * 0.28)
    ctx.restore()
    return
  }

  // TRANSITION: HIDDEN -> LOADING
  if (from === 'hidden' && to === 'loading') {
    ctx.save()
    ctx.globalAlpha = p
    drawGoblinStageBuilding({
      ctx,
      width,
      height,
      elapsedMs,
      rite,
      totalRites,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      beatTime: elapsedMs / 444,
      bounce: Math.abs(Math.sin((elapsedMs / 444) * Math.PI)),
      headBang: Math.sin((elapsedMs / 444) * Math.PI * 2),
      doubleTime: Math.sin((elapsedMs / 444) * Math.PI * 4),
      completedCount,
    })
    ctx.restore()
    return
  }

  // TRANSITION: RESTING -> HIDDEN
  if (from === 'resting' && to === 'hidden') {
    ctx.save()
    ctx.globalAlpha = 1 - p
    drawGoblinResting({
      ctx,
      width,
      height,
      elapsedMs,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount,
    })
    ctx.restore()
    return
  }

  // TRANSITION: PLAYING -> HIDDEN
  if (from === 'playing' && to === 'hidden') {
    ctx.save()
    ctx.globalAlpha = Math.max(0, 1 - p)
    drawGoblinBand({
      ctx,
      width,
      height,
      elapsedMs,
      rite: totalRites,
      totalRites,
      phase: 'weaving',
      mode,
      completedCount,
      visualState: 'playing',
    })
    ctx.restore()
    return
  }

  // TRANSITION: HIDDEN -> PLAYING
  if (from === 'hidden' && to === 'playing') {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, p))
    drawGoblinBand({
      ctx,
      width,
      height,
      elapsedMs,
      rite,
      totalRites,
      phase,
      mode,
      completedCount,
      visualState: 'playing',
    })
    ctx.restore()
    return
  }

  // TRANSITION: HIDDEN -> RESTING
  if (from === 'hidden' && to === 'resting') {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, p))
    drawGoblinResting({
      ctx,
      width,
      height,
      elapsedMs,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount,
    })
    ctx.restore()
    return
  }

  // Fallback / default interpolation
  if (to === 'resting') {
    drawGoblinResting({
      ctx,
      width,
      height,
      elapsedMs,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      completedCount,
    })
  } else if (to === 'loading') {
    drawGoblinStageBuilding({
      ctx,
      width,
      height,
      elapsedMs,
      rite,
      totalRites,
      mode,
      isMusic,
      primaryAccent,
      secondaryAccent,
      magicRuneColor,
      beatTime: elapsedMs / 444,
      bounce: Math.abs(Math.sin((elapsedMs / 444) * Math.PI)),
      headBang: Math.sin((elapsedMs / 444) * Math.PI * 2),
      doubleTime: Math.sin((elapsedMs / 444) * Math.PI * 4),
      completedCount,
    })
  } else {
    drawGoblinBand({
      ctx,
      width,
      height,
      elapsedMs,
      rite,
      totalRites,
      phase,
      mode,
      completedCount,
      visualState: to,
    })
  }
}
