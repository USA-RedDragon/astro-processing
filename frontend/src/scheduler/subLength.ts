import type { PickFilter } from './api/planning'
import type {
  Bucket,
  SubLengthCandidate,
  SubLengthMode,
  SubLengthRow,
  SubLengthState,
} from './api/sublength'

export const BUCKETS: Bucket[] = ['dark', 'low', 'mid', 'bright']

export interface LengthPart {
  bucket: Bucket
  exposure: number
  basis: string
  source: string
  candidates: SubLengthCandidate[]
}

export type LengthState = 'auto' | 'would' | 'site' | 'unmeasured'

export interface LengthView {
  state: LengthState
  text: string
  compact: string
  parts: LengthPart[]
  note: string
}

export interface Fallback {
  exposure: number | null
  plan?: boolean
}

export function seconds(v: number): string {
  return `${Math.round(v * 10) / 10} s`
}

export function compactLengths(parts: Pick<LengthPart, 'bucket' | 'exposure'>[]): string {
  const groups: { exposure: number; buckets: Bucket[] }[] = []
  for (const p of parts) {
    const last = groups[groups.length - 1]
    if (last && last.exposure === p.exposure) last.buckets.push(p.bucket)
    else groups.push({ exposure: p.exposure, buckets: [p.bucket] })
  }
  return groups.map((g) => `${seconds(g.exposure)} (${g.buckets.join(', ')})`).join(' / ')
}

function fallbackText(f: Fallback): string {
  const what = f.plan ? "the plan's length" : 'the template length'
  return f.exposure && f.exposure > 0 ? `${what} (${seconds(f.exposure)})` : what
}

function because(parts: LengthPart[]): string {
  const sources = [...new Set(parts.map((p) => p.source).filter(Boolean))]
  const on = sources.length ? ` measured on ${sources.join(' and ')}` : ' measured'
  const each = parts.length > 1 ? 'each is' : 'it is'
  return `because ${each} the shortest length with a full dark set within 5% of the best SNR per hour for the sky${on}`
}

function missingBuckets(parts: LengthPart[]): Bucket[] {
  const have = new Set(parts.map((p) => p.bucket))
  return BUCKETS.filter((b) => !have.has(b))
}

function ordered(parts: LengthPart[]): LengthPart[] {
  return [...parts]
    .filter((p) => p.exposure > 0)
    .sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket))
}

export function lengthView(
  mode: SubLengthMode | null,
  rawParts: LengthPart[],
  fallback: Fallback,
  opts: { site?: boolean; note?: string } = {},
): LengthView {
  const parts = ordered(rawParts)
  const fb = fallbackText(fallback)
  const note = opts.note ?? ''
  if (!parts.length)
    return {
      state: 'unmeasured',
      text: `Chosen automatically once measured; not measured yet; ${fb} is used until then.`,
      compact: 'not measured yet',
      parts,
      note,
    }
  const compact = compactLengths(parts)
  const why = because(parts)
  if (opts.site)
    return {
      state: 'site',
      text: `Not computed for this target yet. From the sky at this site it would be ${compact} ${why}; ${fb} is used until then.`,
      compact,
      parts,
      note,
    }
  if (mode === 'on') {
    const missing = missingBuckets(parts)
    const rest = missing.length
      ? `; ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not measured yet, so ${fb} is used there`
      : ''
    return {
      state: 'auto',
      text: `Chosen automatically: ${compact} ${why}${rest}.`,
      compact,
      parts,
      note,
    }
  }
  return {
    state: 'would',
    text: `Would be chosen automatically: ${compact} ${why}; until publishing is on, ${fb} is used.`,
    compact,
    parts,
    note,
  }
}

export function normFilter(f: string): string {
  return f.toLowerCase().replace(/α/g, 'a').replace(/[^a-z0-9]/g, '')
}

function rowPart(r: SubLengthRow): LengthPart {
  return {
    bucket: r.bucket,
    exposure: r.exposure,
    basis: r.basis,
    source: r.sky_source,
    candidates: r.candidates ?? [],
  }
}

export function rowsFor(
  rows: SubLengthRow[] | null | undefined,
  filter: string,
  gain: number | null,
  guid?: string,
): SubLengthRow[] {
  const f = normFilter(filter)
  return (rows ?? []).filter(
    (r) =>
      (guid === undefined || r.target_guid === guid) &&
      normFilter(r.filter) === f &&
      (gain === null || r.gain === gain),
  )
}

function oneGain(rows: SubLengthRow[]): SubLengthRow[] {
  if (!rows.length) return rows
  const g = rows[0]!.gain
  return rows.filter((r) => r.gain === g)
}

function stateNote(s: SubLengthState | null): string {
  if (!s) return ''
  if (s.error) return `The stacker did not answer: ${s.error}.`
  if (s.result?.reason) return `The stacker says: ${s.result.reason}.`
  return ''
}

export function planLengthView(
  s: SubLengthState | null,
  plan: { filter: string; gain: number | null; exposure: number; exposureRaw?: number },
  guid: string,
): LengthView {
  const fallback: Fallback = { exposure: plan.exposure, plan: (plan.exposureRaw ?? -1) > 0 }
  const res = s?.result ?? null
  const note = stateNote(s)
  if (!res) return lengthView(null, [], fallback, { note })
  const own = oneGain(rowsFor(res.rows, plan.filter, plan.gain, guid))
  if (own.length) return lengthView(res.mode, own.map(rowPart), fallback, { note })
  const site = oneGain(rowsFor(res.site, plan.filter, plan.gain))
  if (site.length) return lengthView(res.mode, site.map(rowPart), fallback, { site: true, note })
  return lengthView(res.mode, [], fallback, { note })
}

export function pickLengthView(
  s: SubLengthState | null,
  f: Pick<PickFilter, 'automatic' | 'lengths' | 'lengthBasis'>,
  templateExposure: number | null,
): LengthView {
  const site = s?.result?.site ?? []
  const parts: LengthPart[] = (f.lengths ?? []).map((l) => {
    const row = site.find(
      (r) =>
        r.gain === l.gain && r.bucket === l.bucket && r.exposure === l.exposure && r.basis === l.basis,
    )
    return {
      bucket: l.bucket,
      exposure: l.exposure,
      basis: l.basis,
      source: row?.sky_source ?? 'every target at this site',
      candidates: row?.candidates ?? [],
    }
  })
  return lengthView(f.automatic ? 'on' : 'off', parts, { exposure: templateExposure }, {
    note: f.lengthBasis ?? '',
  })
}

export function candidateText(c: SubLengthCandidate): string {
  const parts = [`${Math.round(Math.sqrt(Math.max(0, c.efficiency)) * 1000) / 10}% of ideal SNR per hour`]
  parts.push(c.darks ? 'full dark set' : 'no dark set')
  if (c.saturated_share !== null && c.saturated_share !== undefined)
    parts.push(`${Math.round(c.saturated_share * 1000) / 10}% of stars saturated`)
  if (c.blocked) parts.push(`not used: ${c.blocked}`)
  return parts.join(' · ')
}

export function siteLengthView(
  s: SubLengthState | null,
  filter: string,
  gain: number | null,
  templateExposure: number | null,
): LengthView {
  const res = s?.result ?? null
  const fallback: Fallback = { exposure: templateExposure }
  const note = stateNote(s)
  if (!res) return lengthView(null, [], fallback, { note })
  const site = oneGain(rowsFor(res.site, filter, gain))
  return lengthView(res.mode, site.map(rowPart), fallback, { note })
}

export function publishText(s: SubLengthState | null): string {
  const res = s?.result ?? null
  if (!res)
    return s?.error
      ? `Sub lengths could not be read from the stacker (${s.error}), so the scheduler uses the template lengths.`
      : 'Sub lengths are not measured yet, so the scheduler uses the template lengths.'
  if (res.mode === 'on')
    return 'Publishing is on: the scheduler uses the chosen length wherever the sky is measured, and the template length elsewhere.'
  if (res.mode === 'dry-run')
    return 'Publishing is a dry run: lengths are worked out but not sent, so the scheduler uses the template lengths.'
  return 'Publishing is off: lengths are worked out but not sent, so the scheduler uses the template lengths.'
}

export function lengthsNote(views: LengthView[]): string {
  if (!views.length) return ''
  const states = new Set(views.map((v) => v.state))
  if (states.has('auto'))
    return 'Sub lengths are chosen automatically per moon glare where the sky is measured, and the template length is used elsewhere.'
  if (states.has('would'))
    return 'Sub lengths would be chosen automatically; until publishing is on, the template lengths are used.'
  return 'Sub lengths are chosen automatically once measured; not measured yet, so the template lengths are used until then.'
}

export function reviewLengths(items: { name: string; view: LengthView }[]): string {
  if (!items.length) return ''
  const list = items
    .map((i) => (i.view.parts.length ? `${i.name} (${i.view.compact})` : i.name))
    .join(', ')
  return `${list}. ${lengthsNote(items.map((i) => i.view))}`
}
