import { describe, expect, it } from 'vitest'
import { adoptionDecision, keepOrder, type Adoption } from '@/scheduler/api/mosaics'

const row = (status: Adoption['status'], id = 5): Adoption => ({
  id,
  subject: 'project:abc',
  project: 'Elephant Trunk',
  kind: 'mosaic',
  confidence: 'High',
  rule: '',
  issue: '',
  suggestion: '',
  status,
  clean: false,
})

describe('adoptionDecision', () => {
  it('accepts a proposed row in one decision', () => {
    expect(adoptionDecision(row('proposed'), 'accepted')).toEqual({
      id: 5,
      subject: 'project:abc',
      title: 'Elephant Trunk',
      before: 'proposed',
      after: 'accepted',
    })
  })

  it('switches an accepted row to rejected', () => {
    expect(adoptionDecision(row('accepted'), 'rejected')).toMatchObject({
      before: 'accepted',
      after: 'rejected',
    })
  })

  it('makes a row undecided when the same choice is pressed again', () => {
    expect(adoptionDecision(row('rejected'), 'rejected')).toMatchObject({
      before: 'rejected',
      after: 'proposed',
    })
  })

  it('confirms an automatic adoption as accepted', () => {
    expect(adoptionDecision(row('auto'), 'accepted')).toMatchObject({
      before: 'auto',
      after: 'accepted',
    })
  })
})

describe('keepOrder', () => {
  it('keeps a decided row where it was and puts new rows last', () => {
    const before = [row('proposed', 1), row('proposed', 2), row('proposed', 3)]
    const after = [row('proposed', 1), row('proposed', 3), row('proposed', 4), row('accepted', 2)]
    expect(keepOrder(before, after).map((a) => a.id)).toEqual([1, 2, 3, 4])
  })

  it('uses the server order on first load', () => {
    const after = [row('proposed', 3), row('accepted', 1)]
    expect(keepOrder([], after).map((a) => a.id)).toEqual([3, 1])
  })
})
