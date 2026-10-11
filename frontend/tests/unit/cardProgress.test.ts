import { describe, expect, it } from 'vitest'
import type { Least, Project, Snapshot, Target } from '@/scheduler/api/planning'
import { cardCircle, hasEnoughData, planningProject, planningTarget, sortByLeast } from '@/scheduler/leastCards'

const least = (l: Partial<Least>): Least => ({ enough: false, progress: null, unmeasured: 0, filters: 3, ...l })

const target = (id: number, l: Least): Target => ({ id, name: `T${id}`, least: l, goals: [] }) as unknown as Target

const project = (id: number, l: Least, targets: Target[] = []): Project =>
  ({ id, name: `P${id}`, least: l, targets }) as unknown as Project

describe('cardCircle', () => {
  it('names the weakest panel of a mosaic', () => {
    const l = least({ progress: 0.42, filter: 'Red', target: 'IC 1318 Panel 10' })
    expect(cardCircle(l, 'ok', true)).toMatchObject({ percent: 42, caption: 'Panel 10 Red least complete' })
    expect(cardCircle(l, 'ok', true).title).toBe('Needs more data: Panel 10 Red is least complete at 42% of its goal')
    const n = least({ filter: 'Luminance', target: 'Sadr Panel 3', notMeasured: 'no stack yet' })
    expect(cardCircle(n, 'ok', true).title).toBe('Needs more data: Panel 3 Luminance not measured yet (no stack yet)')
    expect(cardCircle(l, 'ok').caption).toBe('Red least complete')
  })

  it('shows 100% and enough data when every filter is done', () => {
    const c = cardCircle(least({ enough: true, progress: 1, filter: 'Ha' }), 'ok')
    expect(c).toMatchObject({ show: true, percent: 100, caption: 'enough data' })
    expect(c.title).toBe('Enough data in every filter')
  })

  it('floors the least complete filter and names it', () => {
    const c = cardCircle(least({ progress: 0.487, filter: 'Luminance' }), 'ok')
    expect(c).toMatchObject({ show: true, percent: 48, caption: 'Luminance least complete' })
    expect(c.title).toContain('Luminance is least complete at 48%')
  })

  it('never shows 100% while a filter needs more', () => {
    expect(cardCircle(least({ progress: 1, filter: 'OIII' }), 'ok').percent).toBe(99)
  })

  it('shows no number when the least filter is not measured yet', () => {
    const c = cardCircle(least({ filter: 'SII', notMeasured: 'no goal set' }), 'ok')
    expect(c).toMatchObject({ show: true, percent: null, caption: 'SII not measured yet' })
    expect(c.title).toContain('(no goal set)')
  })

  it('shows no number without enabled plans', () => {
    expect(cardCircle(least({ filters: 0 }), 'ok')).toMatchObject({
      percent: null,
      caption: 'no enabled exposure plans',
    })
  })

  it('shows not measured yet when the snapshot has no match', () => {
    expect(cardCircle(undefined, 'ok')).toMatchObject({ show: true, percent: null, caption: 'not measured yet' })
  })

  it('shows progress unknown when the snapshot failed to load', () => {
    expect(cardCircle(least({ enough: true }), 'failed')).toMatchObject({
      show: true,
      percent: null,
      caption: 'progress unknown',
    })
  })

  it('hides the circle while loading', () => {
    expect(cardCircle(undefined, 'loading').show).toBe(false)
  })
})

describe('hasEnoughData', () => {
  it('needs enabled filters that are all done', () => {
    expect(hasEnoughData(least({ enough: true }))).toBe(true)
    expect(hasEnoughData(least({ enough: true, filters: 0 }))).toBe(false)
    expect(hasEnoughData(least({ progress: 0.9 }))).toBe(false)
    expect(hasEnoughData(null)).toBe(false)
  })
})

const snap: Snapshot = {
  projects: [
    project(1, least({ progress: 0.2, filter: 'Ha' }), [target(11, least({ progress: 0.3 }))]),
    project(2, least({ enough: true }), [target(21, least({ enough: true }))]),
    project(3, least({ filter: 'L' })),
    project(4, least({ filters: 0 })),
  ],
} as unknown as Snapshot

describe('planning lookups', () => {
  it('matches GraphQL string ids', () => {
    expect(planningProject(snap, '2')?.name).toBe('P2')
    expect(planningTarget(snap, '11')?.name).toBe('T11')
    expect(planningTarget(snap, 99)).toBeUndefined()
    expect(planningProject(null, 1)).toBeUndefined()
  })
})

describe('sortByLeast', () => {
  const items = [{ id: '9' }, { id: '3' }, { id: '1' }, { id: '4' }, { id: '2' }]

  it('puts enough data first when descending, unknown last', () => {
    expect(sortByLeast(items, snap, 'DESC').map((i) => i.id)).toEqual(['2', '1', '3', '4', '9'])
  })

  it('puts no plans first when ascending, unknown still last', () => {
    expect(sortByLeast(items, snap, 'ASC').map((i) => i.id)).toEqual(['4', '3', '1', '2', '9'])
  })

  it('keeps the given order without a snapshot', () => {
    expect(sortByLeast(items, null, 'DESC').map((i) => i.id)).toEqual(['9', '3', '1', '4', '2'])
  })
})
