import type { ApplyResult, GlobalRule, GlobalWeights, WeightDiff } from './api/ruleweights'
import { weightText } from './plan'

export const RULE_WEIGHT_OVERRIDE = 'ruleweight'

export function ruleFor(rules: GlobalRule[], key: string): GlobalRule | undefined {
  return rules.find((r) => r.key === key)
}

export function weightLabel(rules: GlobalRule[], key: string): string {
  return ruleFor(rules, key)?.label ?? key
}

export function weightValue(rule: GlobalRule | undefined, v: number | null | undefined): string {
  if (v === null || v === undefined) return 'not set'
  if (rule?.switch) return v > 0 ? 'on' : 'off'
  return weightText(v)
}

export function forText(r: GlobalRule): string {
  if (r.for === 'mosaic') return 'Mosaic projects take this value.'
  if (r.for === 'single') return 'Single-target projects take this value.'
  if (r.mosaicOnly)
    return 'Every project takes this value, but it scores only mosaic panels, so it changes nothing for single targets.'
  return 'Every project takes this value.'
}

export function changedWeights(
  current: Record<string, number>,
  draft: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(draft)) {
    if (current[k] === undefined || Math.abs(current[k] - v) > 1e-9) out[k] = v
  }
  return out
}

export interface WeightChange {
  key: string
  label: string
  from: string
  to: string
}

export function weightChanges(
  g: Pick<GlobalWeights, 'rules' | 'weights'>,
  draft: Record<string, number>,
): WeightChange[] {
  const changed = changedWeights(g.weights, draft)
  return g.rules
    .filter((r) => r.key in changed)
    .map((r) => ({
      key: r.key,
      label: r.label,
      from: weightValue(r, g.weights[r.key]),
      to: weightValue(r, changed[r.key]),
    }))
}

export function diffText(rules: GlobalRule[], d: WeightDiff): string {
  const r = ruleFor(rules, d.key)
  return `${r?.label ?? d.key} ${weightValue(r, d.project)}, global ${weightValue(r, d.global)}`
}

export function basisText(
  g: Pick<GlobalWeights, 'basis' | 'savedAt' | 'savedBy'>,
  when: (iso: string) => string,
): string {
  if (g.basis === 'saved')
    return g.savedAt ? `Saved ${when(g.savedAt)}${g.savedBy ? ' by ' + g.savedBy : ''}.` : 'Saved.'
  if (g.basis === 'projects')
    return 'Not saved yet. Each value is the one most of your projects use now: mosaic projects for Novelty, mosaics and the rules that score only mosaic panels, single-target projects for Novelty, single targets, and every project for the rest.'
  return "Not saved yet, and there are no projects to read from, so these are Target Scheduler's defaults."
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}

export function applyOutcome(r: ApplyResult): { text: string; sub: string; tone?: 'bad' } {
  const text = r.global ? 'Saved · Global rule weights' : 'Rule weights reset to the global set'
  const parts: string[] = []
  if (r.projects.length)
    parts.push(
      `${plural(r.projects.length, 'project')} ${r.projects.length === 1 ? 'gets' : 'get'} the global weights; Target Scheduler applies them when the current exposure ends.`,
    )
  else if (!r.failed.length) parts.push('Every project already has the global weights.')
  if (r.failed.length) parts.push(`Not sent: ${r.failed.join('; ')}.`)
  return { text, sub: parts.join(' '), tone: r.failed.length ? 'bad' : undefined }
}

export function supportsWeightOverrides(p?: { override_kinds?: string[] | null } | null): boolean {
  return !!p?.override_kinds?.includes(RULE_WEIGHT_OVERRIDE)
}

export function weightsToQuery(w: Record<string, number>): string {
  return Object.entries(w)
    .map(([k, v]) => `${k}=${v}`)
    .join(';')
}

export function weightsFromQuery(q: unknown, rules?: GlobalRule[]): Record<string, number> {
  const out: Record<string, number> = {}
  if (typeof q !== 'string' || !q) return out
  for (const part of q.split(';')) {
    const i = part.lastIndexOf('=')
    if (i <= 0) continue
    const key = part.slice(0, i)
    const v = Number(part.slice(i + 1))
    if (!Number.isFinite(v) || v < 0 || v > 100) continue
    if (rules && !ruleFor(rules, key)) continue
    out[key] = v
  }
  return out
}

export interface SwitchState {
  key: string
  label: string
  description: string
  on: boolean
  set: boolean
  global?: boolean
}

export function ruleApplies(r: GlobalRule, mosaic: boolean): boolean {
  if (r.for === 'mosaic' && !mosaic) return false
  if (r.for === 'single' && mosaic) return false
  return !r.mosaicOnly || mosaic
}

export function switchStates(
  g: Pick<GlobalWeights, 'rules' | 'weights'>,
  diffs: WeightDiff[],
  mosaic: boolean,
): SwitchState[] {
  return g.rules
    .filter((r) => r.switch && ruleApplies(r, mosaic))
    .map((r) => {
      const d = diffs.find((x) => x.key === r.key)
      const v = d ? d.project : g.weights[r.key]
      const set = v !== null && v !== undefined
      return {
        key: r.key,
        label: r.label,
        description: r.description,
        on: set && v > 0,
        set,
        global: d ? d.global > 0 : undefined,
      }
    })
}

export function switchKeys(g: Pick<GlobalWeights, 'rules'> | null | undefined): Set<string> {
  return new Set((g?.rules ?? []).filter((r) => r.switch).flatMap((r) => [r.key, r.rule]))
}
