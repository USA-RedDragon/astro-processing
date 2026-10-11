import { describe, expect, it } from 'vitest'
import {
  backfillHead,
  completionLabel,
  mastersText,
  progressFill,
  progressText,
  summaryCounts,
} from '@/scheduler/api/discover'

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
    for (const status of ['done', 'being-added', 'scheduled', 'not-started'] as const) {
      expect(progressFill({ status, progress })).toBeNull()
      expect(progressText({ status, progress })).toBe('')
    }
  })
})

describe('master measurement counts', () => {
  it('does not count masters with too few subs as measured', () => {
    expect(mastersText({ filters: 3, measured: 3, short: 3 })).toBe(
      '0 of 3 masters measured, 3 with too few subs to measure',
    )
    expect(mastersText({ filters: 5, measured: 5, short: 1 })).toBe(
      '4 of 5 masters measured, 1 with too few subs to measure',
    )
  })

  it('subtracts failed measurements from the backfill count', () => {
    expect(backfillHead({ total: 527, measured: 527, current: 527, failed: 291 })).toBe(
      'Goal measurements: 236 of 527 masters measured, 291 with too few subs to measure',
    )
    expect(backfillHead({ total: 10, measured: 8, current: 6, failed: 0 })).toBe(
      'Goal measurements: 8 of 10 masters measured (6 of the 8 checked on the current method)',
    )
  })
})

describe('scheduled with nothing captured', () => {
  it('counts scheduled objects apart from not started', () => {
    const c = { inProgress: 2, measuring: 1, beingAdded: 0, scheduled: 7, notStarted: 99 }
    expect(summaryCounts(c)).toBe('2 in progress · 1 measuring · 7 scheduled · 99 not started')
    expect(summaryCounts({ ...c, beingAdded: 1 })).toBe(
      '2 in progress · 1 measuring · 1 being added · 7 scheduled · 99 not started',
    )
  })

  it('labels the scheduled state', () => {
    expect(completionLabel.scheduled).toBe('Scheduled')
    expect(new Set(Object.values(completionLabel)).size).toBe(Object.keys(completionLabel).length)
  })
})
