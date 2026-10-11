import { describe, expect, it } from 'vitest'
import {
  adoptionDecision,
  autoOutcome,
  autoReason,
  keepOrder,
  openLabel,
  splitAdoptions,
  undoAuto,
  type Adoption,
} from '@/scheduler/api/mosaics'

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

const subsRow = (target: string | undefined, suggestion = ''): Adoption => ({
  ...row('auto', 9),
  subject: 'frames:Eagle Nebula',
  project: 'Eagle Nebula',
  kind: 'frames',
  confidence: target ? 'Medium' : 'Low',
  suggestion,
  frames: {
    object: 'Eagle Nebula',
    count: 12,
    target,
    separationDeg: 0.4231,
    within: 1,
    nameMatch: true,
  },
})

describe('splitAdoptions', () => {
  it('counts only proposed rows as open', () => {
    const g = splitAdoptions([
      row('proposed', 1),
      row('auto', 2),
      row('accepted', 3),
      row('rejected', 4),
    ])
    expect(g.open.map((a) => a.id)).toEqual([1])
    expect(g.auto.map((a) => a.id)).toEqual([2])
    expect(g.decided.map((a) => a.id)).toEqual([3, 4])
  })
})

describe('openLabel', () => {
  it('says plainly when nothing is open', () => {
    expect(openLabel(0)).toBe('No decisions open')
    expect(openLabel(1)).toBe('1 decision open')
    expect(openLabel(2)).toBe('2 decisions open')
  })
})

describe('automatic decisions', () => {
  it('undoes an automatic decision back to open', () => {
    expect(undoAuto(row('auto'))).toMatchObject({ before: 'auto', after: 'proposed' })
  })

  it('says what was done and why for attached subs', () => {
    const a = subsRow('Eagle Nebula Panel 1')
    expect(autoOutcome(a)).toBe('Attached 12 subs to Eagle Nebula Panel 1.')
    expect(autoReason(a)).toBe(
      "Eagle Nebula Panel 1 is 0.42° from the subs' mount position, the only Target Scheduler target within 0.5°, and the names match.",
    )
  })

  it('says why subs were kept separate', () => {
    const a = subsRow(
      undefined,
      "The nearest Target Scheduler target, Centarus A, is 20.92° from the subs' mount position, beyond the 0.5° limit. Keep them separate and count their hours on their own.",
    )
    expect(autoOutcome(a)).toBe('Kept 12 subs separate. Their hours count on their own.')
    expect(autoReason(a)).toBe(
      "The nearest Target Scheduler target, Centarus A, is 20.92° from the subs' mount position, beyond the 0.5° limit.",
    )
  })

  it('names the panel count for an adopted mosaic', () => {
    const a = {
      ...row('auto'),
      rule: 'High: every panel overlaps another by 3% or more.',
      panels: [
        { targetGuid: 'a', target: 'P 1', panel: 1, row: 0, col: 0 },
        { targetGuid: 'b', target: 'P 2', panel: 2, row: 0, col: 1 },
      ],
    }
    expect(autoOutcome(a)).toBe('Adopted as a 2-panel mosaic.')
    expect(autoReason(a)).toBe('every panel overlaps another by 3% or more.')
  })
})
