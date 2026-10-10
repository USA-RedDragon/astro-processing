import { describe, expect, it } from 'vitest'
import {
  filterPercentFor,
  goalTiming,
  GOAL_DRIVEN_PLUGIN,
  legacyGoalNote,
  planBasisFor,
  planCountText,
  planPercentFor,
  projectProgressFor,
  readinessText,
  versionAtLeast,
  type FilterGoal,
  type Plan,
  type Project,
  type Target,
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
  const plan = (extra: Partial<Plan>): Plan => ({
    id: 1,
    guid: 'g',
    templateId: 1,
    template: 'H-a',
    filter: 'H-a',
    exposure: 300,
    exposureRaw: 300,
    desired: 100,
    acquired: 40,
    accepted: 40,
    enabled: true,
    gain: null,
    moonSeparation: 0,
    moonWidth: 0,
    percentComplete: 0,
    completionBasis: 'collecting subs to measure',
    goalDriven: true,
    countPercent: 40,
    countBasis: 'accepted',
    ...extra,
  })

  it('compares dotted versions', () => {
    expect(versionAtLeast('5.8.2.204', GOAL_DRIVEN_PLUGIN)).toBe(true)
    expect(versionAtLeast('5.8.2.210', GOAL_DRIVEN_PLUGIN)).toBe(true)
    expect(versionAtLeast('5.9', GOAL_DRIVEN_PLUGIN)).toBe(true)
    expect(versionAtLeast('5.8.2.203', GOAL_DRIVEN_PLUGIN)).toBe(false)
    expect(versionAtLeast(undefined, GOAL_DRIVEN_PLUGIN)).toBe(false)
    expect(versionAtLeast('dev', GOAL_DRIVEN_PLUGIN)).toBe(false)
  })

  it('shows the desired count and the old rule before plugin 5.8.2.204', () => {
    const g = fg({ readiness: { state: 'collecting', stackSubs: 3, minSubs: 8, subLimit: 32, open: true } })
    expect(readinessText(g, '5.8.2.203')).toBe('')
    expect(planCountText(g, '5.8.2.203')).toBe('')
    expect(legacyGoalNote('5.8.2.203')).toContain('finishes a filter with a goal on its desired count')
    const pl = plan({})
    expect(planPercentFor(pl, '5.8.2.203')).toBe(40)
    expect(planBasisFor(pl, '5.8.2.203')).toBe('accepted')
    expect(planPercentFor(pl, '5.8.2.204')).toBe(0)
    const t = { plans: [pl], goals: [g] } as unknown as Target
    expect(filterPercentFor(t, g, '5.8.2.203')).toEqual({ percent: 40, basis: 'accepted' })
    expect(filterPercentFor(t, g, '5.8.2.204')).toEqual({ percent: 0, basis: 'collecting subs to measure' })
    const p = { progress: 0, targets: [{ active: true, plans: [pl, plan({ id: 2, completionBasis: 'accepted', percentComplete: 70 })] }] } as unknown as Project
    expect(projectProgressFor(p, '5.8.2.203')).toBe(0.4)
    expect(projectProgressFor(p, '5.8.2.204')).toBe(0)
  })
})
