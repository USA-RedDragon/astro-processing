import { describe, expect, it } from 'vitest'
import { progressFill, progressText } from '@/scheduler/api/discover'

const progress = {
  percent: 0.0459,
  target: 'Andromeda',
  leastFilter: 'Luminance',
  enough: false,
}

describe('catalogue progress', () => {
  it('fills in-progress tiles from the least complete filter, not the average', () => {
    expect(progressFill({ status: 'in-progress', progress })).toBeCloseTo(0.0459)
    expect(progressText({ status: 'in-progress', progress })).toBe('4% · Luminance least complete')
  })

  it('clamps out-of-range values', () => {
    expect(progressFill({ status: 'in-progress', progress: { ...progress, percent: 1.4 } })).toBe(1)
    expect(progressFill({ status: 'in-progress', progress: { ...progress, percent: -1 } })).toBe(0)
  })

  it('says not measured instead of guessing from sub counts', () => {
    const unmeasured = {
      ...progress,
      percent: null,
      leastFilter: 'H-a',
      notMeasured: 'collecting subs for the first measurement',
    }
    expect(progressFill({ status: 'in-progress', progress: unmeasured })).toBeNull()
    expect(progressText({ status: 'in-progress', progress: unmeasured })).toBe(
      'needs more · H-a not measured yet (collecting subs for the first measurement)',
    )
    expect(progressText({ status: 'measuring', progress: unmeasured })).toBe(
      'needs more · H-a not measured yet (collecting subs for the first measurement)',
    )
    expect(progressFill({ status: 'measuring', progress: unmeasured })).toBeNull()
  })

  it('says unknown when the stacker sent no progress', () => {
    expect(progressFill({ status: 'in-progress' })).toBeNull()
    expect(progressText({ status: 'in-progress' })).toBe('progress unknown')
  })

  it('leaves other states alone', () => {
    for (const status of ['done', 'being-added', 'not-started'] as const) {
      expect(progressFill({ status, progress })).toBeNull()
      expect(progressText({ status, progress })).toBe('')
    }
  })
})
