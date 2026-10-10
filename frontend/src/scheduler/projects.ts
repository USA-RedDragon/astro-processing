export interface ProjectFilter {
  q: string
  pri: string
  state: string
  kind: string
}

export interface FilterSubject {
  name: string
  description?: string | null
  priority?: string | null
  state?: string | null
  isMosaic: boolean
  targetNames: string[]
}

export const emptyFilter = (): ProjectFilter => ({ q: '', pri: 'All', state: 'All', kind: 'All' })

export function filterActive(f: ProjectFilter): boolean {
  return f.q.trim() !== '' || f.pri !== 'All' || f.state !== 'All' || f.kind !== 'All'
}

const same = (a: string | null | undefined, b: string) =>
  (a ?? '').toLowerCase() === b.toLowerCase()

export function matchesFilter(f: ProjectFilter, p: FilterSubject): boolean {
  const q = f.q.trim().toLowerCase()
  if (q) {
    const hit =
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      p.targetNames.some((t) => t.toLowerCase().includes(q))
    if (!hit) return false
  }
  if (f.pri !== 'All' && !same(p.priority, f.pri)) return false
  if (f.state !== 'All' && !same(p.state, f.state)) return false
  if (f.kind === 'Mosaic' && !p.isMosaic) return false
  if (f.kind === 'Single' && p.isMosaic) return false
  return true
}
