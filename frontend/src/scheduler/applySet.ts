import type { CommandRecord } from './api/commands'
import type { ApplySetDraft } from './api/planning'

const FAILED = new Set(['conflict', 'rejected', 'failed', 'cancelled'])

export function applySetGoalEdits(d: ApplySetDraft | null | undefined) {
  return (d?.goals ?? []).filter((g) => g.goals?.length)
}

export function canApplySet(d: ApplySetDraft | null | undefined): boolean {
  if (!d) return false
  return d.payload !== undefined && d.payload !== null ? true : applySetGoalEdits(d).length > 0
}

export function applySetCount(d: ApplySetDraft | null | undefined): number {
  return d?.effects.filter((e) => e.changes).length ?? 0
}

export async function submitApplySet(
  d: ApplySetDraft,
  submit: (kind: string, payload: unknown) => Promise<CommandRecord>,
  notify: (r: CommandRecord) => void,
): Promise<boolean> {
  if (d.payload !== undefined && d.payload !== null) {
    const r = await submit('exposureplan.applyset', d.payload)
    notify(r)
    if (FAILED.has(r.status)) return false
  }
  for (const g of applySetGoalEdits(d)) notify(await submit('goal.edit', g))
  return true
}
