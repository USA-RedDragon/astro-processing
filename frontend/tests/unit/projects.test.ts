import { describe, expect, it } from 'vitest'
import { emptyFilter, filterActive, matchesFilter, type FilterSubject } from '@/scheduler/projects'

const pelican: FilterSubject = {
  name: 'Pelican',
  description: 'IC 5070',
  priority: 'HIGH',
  state: 'ACTIVE',
  isMosaic: true,
  targetNames: ['Pelican Panel 1', 'Pelican Panel 2'],
}

const m31: FilterSubject = {
  name: 'Andromeda',
  description: '(Aug-Dec)',
  priority: 'Normal',
  state: 'Inactive',
  isMosaic: false,
  targetNames: ['M 31'],
}

describe('matchesFilter', () => {
  it('passes everything with the empty filter', () => {
    expect(matchesFilter(emptyFilter(), pelican)).toBe(true)
    expect(filterActive(emptyFilter())).toBe(false)
  })

  it('searches name, description and target names', () => {
    expect(matchesFilter({ ...emptyFilter(), q: 'ic 50' }, pelican)).toBe(true)
    expect(matchesFilter({ ...emptyFilter(), q: 'm 31' }, m31)).toBe(true)
    expect(matchesFilter({ ...emptyFilter(), q: 'panel 2' }, pelican)).toBe(true)
    expect(matchesFilter({ ...emptyFilter(), q: 'veil' }, pelican)).toBe(false)
  })

  it('compares priority and state across GraphQL and planning casing', () => {
    expect(matchesFilter({ ...emptyFilter(), pri: 'High' }, pelican)).toBe(true)
    expect(matchesFilter({ ...emptyFilter(), pri: 'High' }, m31)).toBe(false)
    expect(matchesFilter({ ...emptyFilter(), state: 'Inactive' }, m31)).toBe(true)
    expect(matchesFilter({ ...emptyFilter(), state: 'Active' }, m31)).toBe(false)
  })

  it('splits single targets from mosaics', () => {
    expect(matchesFilter({ ...emptyFilter(), kind: 'Mosaic' }, pelican)).toBe(true)
    expect(matchesFilter({ ...emptyFilter(), kind: 'Single' }, pelican)).toBe(false)
    expect(matchesFilter({ ...emptyFilter(), kind: 'Single' }, m31)).toBe(true)
    expect(filterActive({ ...emptyFilter(), kind: 'Single' })).toBe(true)
  })
})
