import {
  leastOnCounts,
  leastPanel,
  leastRank,
  leastText,
  leastValue,
  plateauTitle,
  plateauWhere,
  type Least,
  type Project,
  type Snapshot,
  type Target,
} from '@/scheduler/api/planning'

export type PlanningState = 'loading' | 'ok' | 'failed'

export interface CardCircle {
  show: boolean
  percent: number | null
  caption: string
  title: string
  plateau?: CardPlateau
}

export interface CardPlateau {
  percent: number | null
  text: string
  title: string
}

export function plateauCaption(percent: number | null): string {
  if (percent === null) return 'plateau not measured'
  return percent >= 100 ? 'plateau reached' : `${percent}% to plateau`
}

export function cardPlateau(l: Least | null | undefined, mosaic = false): CardPlateau | undefined {
  const p = l?.plateau
  if (!l?.filters || !p) return undefined
  const measured = p.progress !== null && p.progress !== undefined
  return {
    percent: measured ? Math.floor(Math.max(0, Math.min(1, p.progress!)) * 100) : null,
    text: plateauWhere(p, mosaic),
    title: plateauTitle(p, mosaic),
  }
}

export function cardCircle(l: Least | null | undefined, state: PlanningState, mosaic = false): CardCircle {
  if (state === 'loading') return { show: false, percent: null, caption: '', title: '' }
  if (state === 'failed')
    return {
      show: true,
      percent: null,
      caption: 'progress unknown',
      title: 'Progress unknown: the stacker planning snapshot did not load',
    }
  if (!l)
    return {
      show: true,
      percent: null,
      caption: 'not measured yet',
      title: 'Not measured yet: the stacker has no planning data for this',
    }
  const title = leastText(l, mosaic)
  const panel = mosaic ? leastPanel(l) : ''
  const f = panel && l.filter ? `${panel} ${l.filter}` : l.filter
  if (!l.filters) return { show: true, percent: null, caption: 'no enabled exposure plans', title }
  const v = leastValue(l)
  const plateau = cardPlateau(l, mosaic)
  if (l.enough) return { show: true, percent: 100, caption: 'enough data', title, plateau }
  if (leastOnCounts(l)) return { show: true, percent: null, caption: `${f} runs on counts`, title, plateau }
  if (v === null)
    return { show: true, percent: null, caption: `${f ?? 'a filter'} not measured yet`, title, plateau }
  const percent = Math.min(99, Math.floor(Math.max(0, v) * 100))
  return { show: true, percent, caption: `${f} least complete`, title, plateau }
}

export function hasEnoughData(l: Least | null | undefined): boolean {
  return !!l && l.filters > 0 && l.enough
}

export function planningProject(snap: Snapshot | null | undefined, id: string | number): Project | undefined {
  return snap?.projects.find((p) => String(p.id) === String(id))
}

export function planningTarget(snap: Snapshot | null | undefined, id: string | number): Target | undefined {
  for (const p of snap?.projects ?? []) {
    const t = p.targets.find((t) => String(t.id) === String(id))
    if (t) return t
  }
  return undefined
}

export function sortByLeast<T extends { id: string | number }>(
  items: T[],
  snap: Snapshot | null | undefined,
  direction: string,
): T[] {
  const sign = direction === 'ASC' ? 1 : -1
  const rank = (it: T): number | null => {
    const p = planningProject(snap, it.id)
    return p ? leastRank(p.least) : null
  }
  return items
    .map((it, i) => ({ it, i, r: rank(it) }))
    .sort((a, b) => {
      if (a.r === null || b.r === null) {
        if (a.r === b.r) return a.i - b.i
        return a.r === null ? 1 : -1
      }
      return sign * (a.r - b.r) || a.i - b.i
    })
    .map((x) => x.it)
}
