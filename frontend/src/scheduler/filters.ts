import { r1, type FilterGoal, type Plan, type Target, type Template } from './api/planning'

export interface FilterChoice {
  name: string
  narrowband: boolean
}

export interface FilterGroup {
  label: 'Broadband' | 'Narrowband'
  filters: FilterChoice[]
}

function filterKey(f: string): string {
  return f.trim().toLowerCase().replace(/[\s_-]/g, '')
}

const ALIASES: Record<string, string> = {
  l: 'luminance',
  lum: 'luminance',
  r: 'red',
  g: 'green',
  b: 'blue',
  h: 'ha',
  hα: 'ha',
  halpha: 'ha',
  o3: 'oiii',
  s2: 'sii',
}

function canonical(f: string): string {
  const k = filterKey(f)
  return ALIASES[k] ?? k
}

const NARROWBAND = new Set(['ha', 'oiii', 'sii', 'hb', 'hbeta', 'nii', 'n2'])
const ORDER = ['luminance', 'red', 'green', 'blue', 'ha', 'oiii', 'sii']

export function isNarrowband(f: string): boolean {
  return NARROWBAND.has(canonical(f))
}

export function sameFilter(a: string, b: string): boolean {
  return canonical(a) === canonical(b)
}

function rank(f: string): number {
  const i = ORDER.indexOf(canonical(f))
  return i < 0 ? ORDER.length : i
}

export function sortFilters<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

export function filterChoices(src: {
  filters?: { name: string; narrowband?: boolean }[] | null
  templates?: Pick<Template, 'filter'>[] | null
  plans?: Pick<Plan, 'filter'>[] | null
}): FilterChoice[] {
  const out: FilterChoice[] = []
  const add = (name: string | null | undefined, narrowband?: boolean) => {
    const n = (name ?? '').trim()
    if (!n || out.some((x) => sameFilter(x.name, n))) return
    out.push({ name: n, narrowband: narrowband ?? isNarrowband(n) })
  }
  if (src.filters?.length) src.filters.forEach((f) => add(f.name, f.narrowband))
  else {
    ;(src.templates ?? []).forEach((t) => add(t.filter))
    ;(src.plans ?? []).forEach((p) => add(p.filter))
  }
  return sortFilters(out)
}

export function groupFilters(list: FilterChoice[]): FilterGroup[] {
  const groups: FilterGroup[] = [
    { label: 'Broadband', filters: list.filter((f) => !f.narrowband) },
    { label: 'Narrowband', filters: list.filter((f) => f.narrowband) },
  ]
  return groups.filter((g) => g.filters.length)
}

export function selectedFilters(targets: Pick<Target, 'plans'>[]): string[] {
  const out: string[] = []
  for (const t of targets)
    for (const p of t.plans)
      if (p.enabled && p.filter && !out.some((x) => sameFilter(x, p.filter))) out.push(p.filter)
  return out
}

export function hasFilter(list: string[], name: string): boolean {
  return list.some((x) => sameFilter(x, name))
}

export function withFilter(list: string[], name: string, on: boolean): string[] {
  const rest = list.filter((x) => !sameFilter(x, name))
  return on ? [...rest, name] : rest
}

export interface SubCount {
  kept: number
  taken: number
}

export function filterSubs(targets: Pick<Target, 'plans'>[], name: string): SubCount {
  let kept = 0
  let taken = 0
  for (const t of targets)
    for (const p of t.plans)
      if (sameFilter(p.filter, name)) {
        kept += p.accepted
        taken += p.acquired
      }
  return { kept, taken }
}

export interface QuickPick {
  label: string
  filters: string[]
}

export const QUICK_PICKS: QuickPick[] = [
  { label: 'LRGB', filters: ['Luminance', 'Red', 'Green', 'Blue'] },
  { label: 'Narrowband (H-a, O-III, S-II)', filters: ['H-a', 'O-III', 'S-II'] },
  {
    label: 'All seven',
    filters: ['Luminance', 'Red', 'Green', 'Blue', 'H-a', 'O-III', 'S-II'],
  },
]

export function pickFilters(pick: QuickPick, choices: FilterChoice[]): string[] {
  return pick.filters.flatMap((f) => {
    const c = choices.find((x) => sameFilter(x.name, f))
    return c ? [c.name] : []
  })
}

export function chosenText(n: number): string {
  if (n === 0) return 'Choose at least one filter.'
  return `${n} ${n === 1 ? 'filter' : 'filters'} chosen.`
}

export function stopText(name: string, s: SubCount): string {
  return (
    `Its ${s.kept} kept ${s.kept === 1 ? 'sub' : 'subs'} (of ${s.taken} taken) stay on disk and ` +
    `stay in this project's stacks. If you add ${name} back later, it continues from them.`
  )
}

export interface Fact {
  label: string
  value: string
  measured: boolean
}

function goalNum(v: number): string {
  return Number.isInteger(v) ? String(v) : r1(v)
}

export function goalFact(fg: FilterGoal | undefined, mode: 'snr' | 'depth'): Fact {
  const p = fg?.progress
  const kind = p?.kind ?? mode
  const label = kind === 'depth' ? 'Depth' : 'Signal-to-noise'
  if (!p) return { label, value: 'not measured yet', measured: false }
  if (kind === 'depth')
    return { label, value: `${r1(p.achieved)} of ${goalNum(p.goal)} mag/arcsec²`, measured: true }
  return { label, value: `${r1(p.achieved)} of ${goalNum(p.goal)}`, measured: true }
}

export function keptFact(s: SubCount): Fact {
  return { label: 'Subs kept', value: `${s.kept} of ${s.taken} taken`, measured: true }
}

export function timeFact(fg: FilterGoal | undefined): Fact {
  const label = 'Time still needed'
  const p = fg?.progress
  if (fg?.enough || p?.done)
    return {
      label,
      value: p && p.done && p.progress < 1 ? 'none, plateau reached' : 'none, goal met',
      measured: true,
    }
  if (!p || p.unmeasured || !(p.hoursNeeded >= 0))
    return { label, value: 'not measured yet', measured: false }
  return { label, value: `about ${r1(p.hoursNeeded)} h`, measured: true }
}

export function plateauFact(fg: FilterGoal | undefined): Fact {
  const label = 'Where more time stops helping'
  const pa = fg?.plateauAt
  if (pa && pa.progress !== null && pa.progress !== undefined && pa.progress >= 1)
    return { label, value: 'reached', measured: true }
  if (pa && pa.hours !== null && pa.hours !== undefined)
    return { label, value: `near ${r1(pa.hours)} h`, measured: true }
  return { label, value: 'not measured yet', measured: false }
}

export function emptyHeadline(s: SubCount): string {
  return s.taken ? `not measured yet · ${s.taken} ${s.taken === 1 ? 'sub' : 'subs'} taken` : 'not measured yet · no subs taken'
}
