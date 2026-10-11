import { describe, expect, it } from 'vitest'
import {
  filterHeadline,
  goalTiming,
  GOAL_DRIVEN_PLUGIN,
  leastHeadline,
  leastRank,
  leastText,
  leastValue,
  legacyGoalNote,
  planCountText,
  readinessText,
  versionAtLeast,
  type FilterGoal,
  type Least,
} from '@/scheduler/api/planning'

const V = '5.8.2.204'

function fg(extra: Partial<FilterGoal>): FilterGoal {
  return {
    filter: 'H-a',
    stackFilter: 'H-a',
    goal: null,
    goalSet: true,
    defaultGoal: { kind: 'snr', snr: 10, depth: 25.5, plateauStop: true } as FilterGoal['defaultGoal'],
    measured: false,
    status: 'no-master',
    percentComplete: 0,
    completionBasis: 'collecting subs to measure',
    accepted: 400,
    desired: 300,
    acceptedHours: 0,
    enough: false,
    goalProgress: null,
    ...extra,
  }
}

describe('goal readiness text', () => {
  it('counts the first subs the measurement needs', () => {
    const g = fg({ readiness: { state: 'collecting', stackSubs: 3, minSubs: 8, subLimit: 32, open: true } })
    expect(readinessText(g, V)).toBe('collecting the first 8 subs to measure (3 of 8)')
    expect(planCountText(g, V)).toBe('goal-driven · collecting the first 8 subs to measure (3 of 8)')
    expect(goalTiming(g, V)).toBe('collecting the first 8 subs to measure (3 of 8)')
  })

  it('waits for the first measurement once enough subs are stacked', () => {
    const g = fg({ readiness: { state: 'collecting', stackSubs: 9, minSubs: 8, subLimit: 32, open: false } })
    expect(readinessText(g, V)).toBe('9 subs stacked, waiting for the first measurement')
  })

  it('names the reason and the bound for a goal that cannot be measured', () => {
    const reason = 'no depth: the master has no plate solution to calibrate against'
    const open = fg({ readiness: { state: 'unmeasurable', reason, stackSubs: 20, minSubs: 8, subLimit: 32, open: true } })
    expect(readinessText(open, V)).toBe(`${reason}; imaging stops at 32 subs (20 so far)`)
    const stopped = fg({ readiness: { state: 'unmeasurable', reason, stackSubs: 33, minSubs: 8, subLimit: 32, open: false } })
    expect(readinessText(stopped, V)).toBe(`${reason}; stopped at 33 subs`)
  })

  it('shows measured progress and never the desired count for a goal-driven plan', () => {
    const g = fg({
      measured: true,
      status: 'measured',
      readiness: { state: 'measured', stackSubs: 40, minSubs: 8, subLimit: 32, open: true },
      progress: { progress: 0.42, done: false, hoursNeeded: 3 } as FilterGoal['progress'],
    })
    expect(readinessText(g, V)).toBe('')
    expect(planCountText(g, V)).toBe('goal-driven · 42% of its goal')
    expect(planCountText(g, V)).not.toContain('300')
  })

  it('leaves count-based filters alone', () => {
    expect(planCountText(fg({ goalSet: false }), V)).toBe('')
    expect(readinessText(fg({ goalSet: false }), V)).toBe('')
  })
})

describe('plugin version gate', () => {
  it('compares dotted versions', () => {
    expect(versionAtLeast('5.8.2.204', GOAL_DRIVEN_PLUGIN)).toBe(true)
    expect(versionAtLeast('5.8.2.210', GOAL_DRIVEN_PLUGIN)).toBe(true)
    expect(versionAtLeast('5.9', GOAL_DRIVEN_PLUGIN)).toBe(true)
    expect(versionAtLeast('5.8.2.203', GOAL_DRIVEN_PLUGIN)).toBe(false)
    expect(versionAtLeast(undefined, GOAL_DRIVEN_PLUGIN)).toBe(false)
    expect(versionAtLeast('dev', GOAL_DRIVEN_PLUGIN)).toBe(false)
  })

  it('keeps the old rule note before plugin 5.8.2.204', () => {
    const g = fg({ readiness: { state: 'collecting', stackSubs: 3, minSubs: 8, subLimit: 32, open: true } })
    expect(readinessText(g, '5.8.2.203')).toBe('')
    expect(planCountText(g, '5.8.2.203')).toBe('')
    expect(legacyGoalNote('5.8.2.203')).toContain('finishes a filter with a goal on its desired count')
  })
})

describe('least complete filter', () => {
  const least = (extra: Partial<Least>): Least => ({
    enough: false,
    progress: 0.0459,
    target: 'Andromeda',
    filter: 'Luminance',
    unmeasured: 0,
    filters: 5,
    ...extra,
  })

  it('names the weakest filter instead of an average', () => {
    const l = least({})
    expect(leastValue(l)).toBeCloseTo(0.0459)
    expect(leastHeadline(l)).toBe('4% · Luminance least complete')
    expect(leastText(l)).toBe('Needs more data: Luminance is least complete at 4% of its goal')
  })

  it('says not measured with the reason, never a sub count', () => {
    const l = least({ progress: null, filter: 'H-a', notMeasured: 'collecting subs for the first measurement', unmeasured: 1 })
    expect(leastValue(l)).toBeNull()
    expect(leastHeadline(l)).toBe('needs more · H-a not measured yet')
    expect(leastText(l)).toBe('Needs more data: H-a not measured yet (collecting subs for the first measurement)')
  })

  it('reads enough data when every filter is done', () => {
    const l = least({ enough: true, progress: 1 })
    expect(leastValue(l)).toBe(1)
    expect(leastHeadline(l)).toBe('enough data')
    expect(leastText(l)).toBe('Enough data in every filter')
  })

  it('ranks no plans, then not measured, then measured, then enough', () => {
    const ranks = [
      least({ filters: 0 }),
      least({ progress: null }),
      least({ progress: 0.2 }),
      least({ enough: true, progress: 1 }),
    ].map(leastRank)
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    expect(leastHeadline(least({ filters: 0 }))).toBe('no enabled exposure plans')
  })

  it('describes each filter as enough or needs more', () => {
    expect(filterHeadline(fg({ goalProgress: 0.487 }))).toBe('needs more · 48% of its goal')
    expect(
      filterHeadline(fg({ enough: true, goalProgress: 1, progress: { progress: 0.6, done: true } as FilterGoal['progress'] })),
    ).toBe('enough data · plateau reached')
    expect(
      filterHeadline(fg({ enough: true, goalProgress: 1, progress: { progress: 1.3, done: true } as FilterGoal['progress'] })),
    ).toBe('enough data · goal met')
    expect(filterHeadline(fg({ notMeasured: 'no goal set' }))).toBe('not measured yet · no goal set')
  })
})
