import { describe, expect, it } from 'vitest'
import { goalTiming, planCountText, readinessText, type FilterGoal } from '@/scheduler/api/planning'

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
    expect(readinessText(g)).toBe('collecting the first 8 subs to measure (3 of 8)')
    expect(planCountText(g)).toBe('goal-driven · collecting the first 8 subs to measure (3 of 8)')
    expect(goalTiming(g)).toBe('collecting the first 8 subs to measure (3 of 8)')
  })

  it('waits for the first measurement once enough subs are stacked', () => {
    const g = fg({ readiness: { state: 'collecting', stackSubs: 9, minSubs: 8, subLimit: 32, open: false } })
    expect(readinessText(g)).toBe('9 subs stacked, waiting for the first measurement')
  })

  it('names the reason and the bound for a goal that cannot be measured', () => {
    const reason = 'no depth: the master has no plate solution to calibrate against'
    const open = fg({ readiness: { state: 'unmeasurable', reason, stackSubs: 20, minSubs: 8, subLimit: 32, open: true } })
    expect(readinessText(open)).toBe(`${reason}; imaging stops at 32 subs (20 so far)`)
    const stopped = fg({ readiness: { state: 'unmeasurable', reason, stackSubs: 33, minSubs: 8, subLimit: 32, open: false } })
    expect(readinessText(stopped)).toBe(`${reason}; stopped at 33 subs`)
  })

  it('shows measured progress and never the desired count for a goal-driven plan', () => {
    const g = fg({
      measured: true,
      status: 'measured',
      readiness: { state: 'measured', stackSubs: 40, minSubs: 8, subLimit: 32, open: true },
      progress: { progress: 0.42, done: false, hoursNeeded: 3 } as FilterGoal['progress'],
    })
    expect(readinessText(g)).toBe('')
    expect(planCountText(g)).toBe('goal-driven · 42% of its goal')
    expect(planCountText(g)).not.toContain('300')
  })

  it('leaves count-based filters alone', () => {
    expect(planCountText(fg({ goalSet: false }))).toBe('')
    expect(readinessText(fg({ goalSet: false }))).toBe('')
  })
})
