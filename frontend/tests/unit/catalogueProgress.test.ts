import { describe, expect, it } from 'vitest'
import { progressFill, progressText } from '@/scheduler/api/discover'

const progress = {
  percent: 0.4567,
  target: 'Andromeda',
  leastFilter: 'Luminance',
  leastPercent: 0.0459,
}

describe('catalogue progress', () => {
  it('fills in-progress tiles from the measured progress', () => {
    expect(progressFill({ status: 'in-progress', progress })).toBeCloseTo(0.4567)
    expect(progressText({ status: 'in-progress', progress })).toBe(
      '45% complete, least complete Luminance at 4%',
    )
  })

  it('clamps out-of-range values', () => {
    expect(progressFill({ status: 'in-progress', progress: { ...progress, percent: 1.4 } })).toBe(1)
    expect(progressFill({ status: 'in-progress', progress: { ...progress, percent: -1 } })).toBe(0)
  })

  it('says unknown instead of guessing', () => {
    expect(progressFill({ status: 'in-progress' })).toBeNull()
    expect(progressText({ status: 'in-progress' })).toBe('progress unknown')
  })

  it('leaves other states alone', () => {
    for (const status of ['done', 'measuring', 'being-added', 'not-started'] as const) {
      expect(progressFill({ status, progress })).toBeNull()
      expect(progressText({ status, progress })).toBe('')
    }
  })
})
