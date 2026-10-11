import { describe, expect, it } from 'vitest'
import { seamSeverity, type Seam, type SeamLimits } from '@/scheduler/api/mosaics'

const limits: SeamLimits = {
  levelSigma: 0.2,
  stepSigma: 0.3,
  noiseRatio: 1.5,
  minBlocks: 400,
  registrationP90Px: 1.5,
  minStarMatches: 5,
  colourMismatch: 0.1,
  gapFraction: 0.02,
}

const seam = (over: Partial<Seam>): Seam => ({
  project: 'North America Nebula',
  filter: 'H-a',
  panelA: 1,
  panelB: 2,
  level: 0,
  difference: 0,
  slopeX: 0,
  slopeY: 0,
  step: 0.1,
  profile: '',
  noiseA: 1,
  noiseB: 1,
  noiseRatio: 1.02,
  samples: 75083,
  ok: true,
  problems: '',
  measuredAt: '2026-10-10T14:24:37Z',
  ...over,
})

describe('seamSeverity', () => {
  it('names the gradient step when the step is what fails', () => {
    const s = seamSeverity(
      seam({
        step: 5.64,
        ok: false,
        starMatches: 521,
        registrationP90Px: 0.16,
        colourMismatch: -0.06,
      }),
      limits,
    )
    expect(s.value).toBe('5.64σ step')
    expect(s.severity).toBeCloseTo(5.64 / 0.3)
  })

  it('names the noise ratio when the noise is what fails', () => {
    expect(seamSeverity(seam({ noiseRatio: 4.4, ok: false }), limits).value).toBe('4.4× noise')
  })

  it('names misregistered stars and colour', () => {
    expect(
      seamSeverity(seam({ starMatches: 40, registrationP90Px: 2.7, ok: false }), limits).value,
    ).toBe('2.70 px p90')
    expect(seamSeverity(seam({ colourMismatch: 0.32, ok: false }), limits).value).toBe(
      '+32% colour',
    )
  })

  it('ignores registration with too few star matches', () => {
    expect(seamSeverity(seam({ starMatches: 2, registrationP90Px: 9 }), limits).value).toBe(
      '1.0× noise',
    )
  })

  it('falls back to the noise ratio without limits', () => {
    expect(seamSeverity(seam({ ok: false }), null)).toEqual({ severity: 1, value: '1.0× noise' })
  })
})
