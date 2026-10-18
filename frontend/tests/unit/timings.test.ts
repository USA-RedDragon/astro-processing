import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PLOT,
  TREND_WHAT,
  checkText,
  giveOrTake,
  kindLabels,
  kindsIn,
  lateLong,
  lateShort,
  linePath,
  midText,
  plotMarks,
  plotScale,
  pointTiming,
  pointTip,
  predictionText,
  seasonKindText,
  trendChip,
  trendWhy,
  untimedLine,
} from '@/scheduler/timings'
import { getTimings } from '@/scheduler/api/binaries'
import { record, timing } from './fixtures/binaries'

afterEach(() => vi.unstubAllGlobals())

describe('eclipse timing words', () => {
  it('writes minutes against the prediction, with on time for zero', () => {
    expect(lateShort(0.6)).toBe('0.6 late')
    expect(lateShort(-2)).toBe('2.0 early')
    expect(lateShort(0.02)).toBe('on time')
    expect(lateLong(12.34)).toBe('12.3 minutes late')
    expect(lateLong(-0.5)).toBe('0.5 minutes early')
    expect(lateLong(0)).toBe('on time')
    expect(giveOrTake(5.5)).toBe('give or take 5.5')
  })

  it('shows the middle in the site zone with CDT or CST', () => {
    expect(midText('2026-10-12T09:33:00Z')).toBe('Mon Oct 12, 2026, 4:33 AM CDT')
    expect(midText('2026-12-01T10:05:00Z')).toBe('Tue Dec 1, 2026, 4:05 AM CST')
    expect(midText('')).toBe('')
  })

  it('says what the second method found, and nothing when it did not run', () => {
    expect(checkText({ check_minutes: null })).toBe('')
    expect(checkText({ check_minutes: 1.24 })).toBe(
      'A second method puts the middle 1.2 minutes later.',
    )
    expect(checkText({ check_minutes: -3 })).toBe(
      'A second method puts the middle 3.0 minutes earlier.',
    )
    expect(checkText({ check_minutes: 0 })).toBe(
      'A second method puts the middle at the same time.',
    )
  })

  it('names kinds from the record, so alike eclipses keep their A and B names', () => {
    expect(kindLabels(record())).toEqual({ primary: 'Deeper eclipse', secondary: 'Second eclipse' })
    const alike = record({
      timings: [timing({ kind: 'primary', kind_label: 'Eclipse A' })],
      untimed: [],
    })
    expect(kindLabels(alike).primary).toBe('Eclipse A')
    expect(kindsIn([{ kind: 'secondary' }, { kind: 'primary' }, { kind: 'secondary' }])).toEqual([
      'primary',
      'secondary',
    ])
    expect(kindsIn([])).toEqual([])
  })

  it('counts the nights covered but not timed', () => {
    expect(untimedLine(0)).toBe('')
    expect(untimedLine(1)).toBe('1 more eclipse night covered but not timed.')
    expect(untimedLine(3)).toBe('3 more eclipse nights covered but not timed.')
  })

  it('uses the record prediction note, else the period it uses', () => {
    expect(predictionText(record())).toBe('Predictions use a period of 7.25000 days for this star.')
    expect(predictionText(record({ prediction_note: 'Made-up note.' }))).toBe('Made-up note.')
    expect(predictionText(record({ period_text: '' }))).toBe('')
  })

  it('maps trend states to chips and drops the repeated not enough words', () => {
    expect(trendChip('flag')).toEqual({ text: 'Flag', tone: 'warn' })
    expect(trendChip('clear')).toEqual({ text: 'Clear', tone: 'ok' })
    expect(trendChip('need')).toEqual({ text: 'Not enough timings yet', tone: '' })
    expect(trendWhy({ state: 'need', why: 'Not enough timings yet. Needs 3.' })).toBe('Needs 3.')
    expect(
      trendWhy({ state: 'need', why: 'Not tested: only one eclipse per cycle is seen.' }),
    ).toBe('Not tested: only one eclipse per cycle is seen.')
    expect(trendWhy({ state: 'flag', why: 'Not enough timings yet. x' })).toBe(
      'Not enough timings yet. x',
    )
    expect(TREND_WHAT.ephemeris).toContain('predicted times need updating')
  })

  it('writes a season kind line with only the counts that apply', () => {
    const k = {
      kind: 'primary' as const,
      label: 'Deeper eclipse',
      want: 2,
      timed: 0,
      asked: 0,
      needed: 0,
    }
    expect(seasonKindText(k)).toBe('0 of 2 timed')
    expect(seasonKindText({ ...k, timed: 1, asked: 1, needed: 1 })).toBe(
      '1 of 2 timed, 1 asked for, 1 still needed',
    )
  })
})

describe('minutes late plot', () => {
  it('spans whole years, at least two, and is the same early and late', () => {
    const s = plotScale([
      { year: 2026.78, kind: 'secondary', minutes: 0.6, err_minutes: 5.5, used: true },
    ])
    expect([s.x0, s.x1, s.ym]).toEqual([2026, 2028, 10])
    expect(s.yTicks).toEqual([-10, -5, 0, 5, 10])
    expect(s.xTicks).toEqual([2026, 2027, 2028])
    expect(s.sx(2026)).toBe(PLOT.L)
    expect(s.sx(2028)).toBe(PLOT.W - PLOT.R)
    expect(s.sy(0)).toBeCloseTo((PLOT.T + PLOT.H - PLOT.B) / 2)
    expect(s.sy(10)).toBe(PLOT.T)
  })

  it('grows to fit the error bars and the fit line, on round steps', () => {
    const s = plotScale(
      [
        { year: 2024.1, kind: 'primary', minutes: -20, err_minutes: 8, used: true },
        { year: 2026.5, kind: 'primary', minutes: 3, err_minutes: 2, used: false },
      ],
      [
        {
          kind: 'primary',
          points: [
            [2024.1, -35],
            [2026.5, 2],
          ],
        },
      ],
    )
    expect(s.ym).toBe(40)
    expect(s.yTicks).toEqual([-40, -20, 0, 20, 40])
    expect([s.x0, s.x1]).toEqual([2024, 2027])
  })

  it('thins year ticks over a long record', () => {
    const s = plotScale([
      { year: 2010.2, kind: 'primary', minutes: 1, err_minutes: 1, used: true },
      { year: 2029.9, kind: 'primary', minutes: 1, err_minutes: 1, used: true },
    ])
    expect(s.xTicks.length).toBeLessThanOrEqual(9)
    expect(s.xTicks[0]).toBe(2010)
  })

  it('places each point with its error bar, later is higher', () => {
    const pts = [{ year: 2026.5, kind: 'primary' as const, minutes: 4, err_minutes: 2, used: true }]
    const s = plotScale(pts)
    const [m] = plotMarks(pts, s)
    expect(m!.top).toBeCloseTo(s.sy(6))
    expect(m!.bottom).toBeCloseTo(s.sy(2))
    expect(m!.y).toBeLessThan(s.sy(0))
    expect(
      linePath(
        {
          kind: 'primary',
          points: [
            [2026, 0],
            [2027, 5],
          ],
        },
        s,
      ),
    ).toMatch(/^M\d+\.\d \d+\.\dL/)
  })

  it('pairs points with timings only when the lists line up', () => {
    const r = record()
    expect(pointTiming(r, 0)?.id).toBe(1)
    expect(pointTiming({ ...r, timings: [] }, 0)).toBeNull()
    const tip = pointTip(r.points[0]!, pointTiming(r, 0), kindLabels(r))
    expect(tip).toEqual([
      'Second eclipse',
      'Night of 2026-10-11',
      'Middle: Mon Oct 12, 2026, 4:33 AM CDT',
      '0.6 minutes late, give or take 5.5',
      'Luminance, 28 frames',
    ])
    expect(pointTip({ ...r.points[0]!, used: false }, null, kindLabels(r))).toEqual([
      'Second eclipse',
      '0.6 minutes late, give or take 5.5',
      'Left out of the trend checks',
    ])
  })
})

describe('timings API client', () => {
  it('reads one star record from the binaries route', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(record()), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const r = await getTimings(101)
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe(
      '/api/v1/discoveries/binaries/101/timings',
    )
    expect(r.timings[0]!.late_text).toBe('0.6 minutes late')
  })
})
