import { describe, expect, it } from 'vitest'
import {
  countsBadge,
  filterHeadline,
  leastHeadline,
  leastOnCounts,
  leastText,
  ON_COUNTS_TITLE,
  type FilterGoal,
  type Least,
} from '@/scheduler/api/planning'
import { progressText } from '@/scheduler/api/discover'

const least = (l: Partial<Least>): Least => ({ enough: false, progress: null, unmeasured: 1, filters: 4, ...l })

function fg(extra: Partial<FilterGoal>): FilterGoal {
  return {
    filter: 'Luminance',
    stackFilter: 'Luminance',
    goal: null,
    goalSet: false,
    defaultGoal: { kind: 'snr', snr: 10, depth: 25.5, plateauStop: true } as FilterGoal['defaultGoal'],
    measured: false,
    status: 'no-master',
    percentComplete: 0.3,
    completionBasis: 'accepted',
    accepted: 12,
    desired: 40,
    acceptedHours: 1,
    enough: false,
    goalProgress: null,
    notMeasured: 'no goal set',
    ...extra,
  }
}

describe('count-based filters', () => {
  it('lists the filters that run on counts in a badge', () => {
    expect(countsBadge(least({ countBased: ['Luminance'] }))).toBe('Runs on counts: Luminance')
    expect(countsBadge(least({ countBased: ['Luminance', 'Red'] }))).toBe('Runs on counts: Luminance, Red')
    expect(countsBadge(least({ countBased: [] }))).toBe('')
    expect(countsBadge(least({ countBased: null }))).toBe('')
    expect(countsBadge(least({}))).toBe('')
    expect(countsBadge(undefined)).toBe('')
    expect(ON_COUNTS_TITLE).toContain('stops them at their desired sub count')
  })

  it('says the least filter runs on counts instead of not measured yet', () => {
    const l = least({ filter: 'Luminance', notMeasured: 'no goal set', countBased: ['Luminance'] })
    expect(leastOnCounts(l)).toBe(true)
    expect(leastHeadline(l)).toBe('needs more · Luminance runs on counts: no goal set')
    expect(leastText(l)).toBe('Needs more data: Luminance runs on counts: no goal set')
    const old = least({ filter: 'Luminance', notMeasured: 'no goal set' })
    expect(leastText(old)).toBe('Needs more data: Luminance runs on counts: no goal set')
    const listed = least({ filter: 'Luminance', countBased: ['Luminance'] })
    expect(leastOnCounts(listed)).toBe(true)
  })

  it('keeps goal-driven filters on their measurement text', () => {
    const l = least({
      filter: 'Red',
      notMeasured: 'collecting subs for the first measurement',
      countBased: ['Luminance', 'Red'],
    })
    expect(leastOnCounts(l)).toBe(false)
    expect(leastText(l)).toBe('Needs more data: Red not measured yet (collecting subs for the first measurement)')
    expect(leastOnCounts(least({ filter: 'Luminance', progress: 0.4, countBased: ['Luminance'] }))).toBe(false)
    expect(leastOnCounts(least({ filter: 'Luminance', enough: true, countBased: ['Luminance'] }))).toBe(false)
  })

  it('shows accepted of desired subs for a filter with no goal', () => {
    expect(filterHeadline(fg({}))).toBe('runs on counts: no goal set · 12 of 40 subs accepted')
    expect(filterHeadline(fg({ enough: true, accepted: 40 }))).toBe(
      'enough data · runs on counts: no goal set · 40 of 40 subs accepted',
    )
    expect(filterHeadline(fg({ goalSet: true, notMeasured: 'no stack yet' }))).toBe(
      'not measured yet · no stack yet',
    )
  })

  it('says a catalogue entry with no goal runs on counts', () => {
    const e = {
      status: 'in-progress' as const,
      progress: { percent: null, target: 'M 34', leastFilter: 'Luminance', notMeasured: 'no goal set', enough: false },
    }
    expect(progressText(e)).toBe('needs more · Luminance runs on counts: no goal set')
    e.progress.notMeasured = 'no stack yet'
    expect(progressText(e)).toBe('needs more · Luminance not measured yet (no stack yet)')
  })
})
