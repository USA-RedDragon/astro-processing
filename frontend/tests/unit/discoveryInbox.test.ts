import { describe, expect, it } from 'vitest'
import {
  catalogText,
  changeText,
  countText,
  nightList,
  nightRows,
  nightsLine,
  runResult,
  seenText,
  sinceOf,
  sparkOf,
  starLine,
  subsVsRef,
  depthText,
} from '@/scheduler/discoveryInbox'
import { candidate, cygnus, nova, run } from './fixtures/discoveries'

describe('source cards', () => {
  it('says how the Cygnus spot faded across its three nights', () => {
    const s = cygnus()
    expect(changeText(s)).toBe('Fainter by 0.41 to 0.67 mag on 3 nights')
    expect(starLine(s)).toBe('Star there: Gaia G 18.06 · not in any variable-star catalog')
    expect(nightsLine(s)).toBe('Oct 5, 6, 7 · seen on 3 of the 4 nights it was compared')
  })

  it('lists a source that went both ways night by night', () => {
    const s = cygnus({
      nights: [
        {
          night: '2026-10-13',
          candidates: [candidate({ night: '2026-10-13', delta_mag: 0.11, ref_mag: 15.5 })],
        },
        {
          night: '2026-10-10',
          candidates: [candidate({ night: '2026-10-10', delta_mag: -0.077, ref_mag: 15.5 })],
        },
      ],
    })
    expect(changeText(s)).toBe('0.08 mag brighter on Oct 10, 0.11 mag fainter on Oct 13')
  })

  it('calls the M 31 nova a new source inside the galaxy, not compared again', () => {
    const s = nova()
    expect(changeText(s)).toBe('New source on Oct 11')
    expect(starLine(s)).toBe(
      'No cataloged star there · inside Andromeda Galaxy, 5.7′ from its center · not in any variable-star catalog',
    )
    expect(seenText(s)).toBe('not compared again since')
  })

  it('does not claim a catalog check that did not happen', () => {
    expect(catalogText(cygnus({ checked: ['SkyBoT'] }))).toBe('Variable-star catalog not checked')
  })

  it('keeps the low-confidence group out of a night with a confident one', () => {
    const rows = nightRows(cygnus())
    expect(rows.map((r) => r.night)).toEqual(['2026-10-07', '2026-10-06', '2026-10-05'])
    expect(rows[1]!.groups).toEqual(['S-II'])
    expect(rows[2]!.groups).toEqual(['S-II', 'H-a'])
    expect(rows[2]!.best.id).toBe(15111)
  })

  it('plots each confident group per night, fainter down, and nothing unmeasured', () => {
    const spark = sparkOf(cygnus())!
    expect(spark.points).toHaveLength(4)
    expect(spark.points.every((p) => p.y > 45)).toBe(true)
    expect(spark.labels.map((l) => l.text)).toEqual(['Oct 5', 'Oct 6', 'Oct 7'])
    const up = sparkOf(nova())!
    expect(up.points[0]!.y).toBeLessThan(45)
    const none = cygnus({
      nights: [{ night: '2026-10-07', candidates: [candidate({ delta_mag: null })] }],
    })
    expect(sparkOf(none)).toBeNull()
  })
})

describe('chips and ranges', () => {
  const counts = {
    look: 3,
    known: 1199,
    movers: 49,
    new_movers: 0,
    low: 1265,
    vetted: 0,
    all: 2516,
  }
  it('counts each view, moving objects by known and new', () => {
    expect(countText('known', counts)).toBe('1,199')
    expect(countText('movers', counts)).toBe('49 known')
    expect(countText('movers', { ...counts, new_movers: 2 })).toBe('2 new · 47 known')
  })

  it('turns a range into the first night it covers', () => {
    const now = new Date('2026-10-14T05:00:00Z')
    expect(sinceOf('30', now)).toBe('2026-09-14')
    expect(sinceOf('7', now)).toBe('2026-10-07')
    expect(sinceOf('all', now)).toBe('all')
  })

  it('names nights compactly', () => {
    expect(nightList(['2026-10-07', '2026-10-05', '2026-10-06'])).toBe('Oct 5, 6, 7')
    expect(nightList(['2026-09-30', '2026-10-01'])).toBe('Sep 30, Oct 1')
    expect(nightList(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-09'])).toBe(
      'Oct 1 to Oct 9',
    )
  })
})

describe('recent nights', () => {
  it('sums up a finished comparison', () => {
    const r = run({
      needs_look: 3,
      classes: { known_variable: 138, low_confidence: 40 },
      tracks: 2,
    })
    expect(runResult(r)).toBe(
      '3 need a look · 138 known variables · 2 moving objects · 40 low confidence',
    )
    expect(subsVsRef(r)).toBe('16 vs 48')
    expect(depthText(r)).toBe('20.2')
  })

  it('says why a night was not compared', () => {
    const r = run({ state: 'skipped', error: 'too few subs', depth: null })
    expect(runResult(r)).toBe('Skipped: too few subs')
    expect(subsVsRef(r)).toBe('not compared')
    expect(depthText(r)).toBe('not measured')
    expect(runResult(run({ classes: {}, tracks: 0 }))).toBe('No changes')
  })
})
