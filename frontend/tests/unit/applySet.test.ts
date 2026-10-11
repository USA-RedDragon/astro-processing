import { describe, expect, it } from 'vitest'
import { applySetCount, canApplySet, submitApplySet } from '@/scheduler/applySet'
import type { CommandRecord } from '@/scheduler/api/commands'
import type { ApplySetDraft, GoalEditPayload } from '@/scheduler/api/planning'

const goal: GoalEditPayload = {
  project_id: 7,
  project_name: 'M 34',
  goals: [
    {
      target_id: 11,
      target_guid: 'g-11',
      target_name: 'M 34',
      filter: 'Luminance',
      before: null,
      after: { kind: 0, snr_goal: 10, plateau_stop: true },
    },
  ],
}

const effect = (targetId: number, changes: boolean) => ({
  targetId,
  name: 't' + targetId,
  project: 'p',
  current: '',
  effect: changes ? 'adds Luminance; sets the Luminance goal SNR 10' : 'no change',
  changes,
})

function record(kind: string, status: CommandRecord['status'] = 'queued'): CommandRecord {
  return {
    id: kind,
    kind,
    payload: null,
    author: 'me',
    title: kind,
    category: 'plans',
    destination: 'observatory',
    diffs: null,
    objects: null,
    status,
    attempts: 0,
    created_at: '',
    updated_at: '',
  }
}

describe('apply set draft', () => {
  it('is ready with a plan payload, goal edits, or both', () => {
    expect(canApplySet(null)).toBe(false)
    expect(canApplySet({ effects: [] })).toBe(false)
    expect(canApplySet({ effects: [], goals: null })).toBe(false)
    expect(canApplySet({ effects: [], goals: [] })).toBe(false)
    expect(canApplySet({ effects: [], payload: { a: 1 } })).toBe(true)
    expect(canApplySet({ effects: [effect(1, true)], goals: [goal] })).toBe(true)
  })

  it('counts targets with changes, including goal-only ones', () => {
    const d: ApplySetDraft = { effects: [effect(1, true), effect(2, false), effect(3, true)], goals: [goal] }
    expect(applySetCount(d)).toBe(2)
  })

  it('submits the plan change first, then each goal edit', async () => {
    const sent: [string, unknown][] = []
    const seen: string[] = []
    const ok = await submitApplySet(
      { payload: { set: 1 }, effects: [], goals: [goal, { ...goal, project_id: 8 }] },
      async (k, p) => {
        sent.push([k, p])
        return record(k)
      },
      (r) => seen.push(r.kind),
    )
    expect(ok).toBe(true)
    expect(sent.map((s) => s[0])).toEqual(['exposureplan.applyset', 'goal.edit', 'goal.edit'])
    expect(sent[1]![1]).toEqual(goal)
    expect(seen).toEqual(['exposureplan.applyset', 'goal.edit', 'goal.edit'])
  })

  it('submits goal edits alone when no plan changes', async () => {
    const sent: string[] = []
    await submitApplySet({ effects: [effect(1, true)], goals: [goal] }, async (k) => {
      sent.push(k)
      return record(k)
    }, () => {})
    expect(sent).toEqual(['goal.edit'])
  })

  it('skips goal edits when the plan change fails', async () => {
    const sent: string[] = []
    const ok = await submitApplySet({ payload: {}, effects: [], goals: [goal] }, async (k) => {
      sent.push(k)
      return record(k, 'rejected')
    }, () => {})
    expect(ok).toBe(false)
    expect(sent).toEqual(['exposureplan.applyset'])
    const thrown: string[] = []
    await expect(
      submitApplySet({ payload: {}, effects: [], goals: [goal] }, async (k) => {
        thrown.push(k)
        throw new Error('offline')
      }, () => {}),
    ).rejects.toThrow('offline')
    expect(thrown).toEqual(['exposureplan.applyset'])
  })
})
