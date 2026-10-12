import { describe, expect, it } from 'vitest'

import type { MoonKeepRow, MoonKeepSlot, MoonKeepView } from '@/scheduler/api/moonkeep'
import {
  brightSpans,
  filterChoices,
  grid,
  inUse,
  notUsedText,
  nowNote,
  pct,
  replayText,
  tonightNote,
  under,
} from '@/scheduler/moonKeep'

const cls = (plans: number, skipped: number, high = 0.03) => ({
  targets: plans,
  plans,
  skipped,
  unknown: 0,
  skip: plans > 0 && skipped === plans,
  rate: high / 2,
  rate_high: skipped ? high : 0,
})

function slot(
  at: string,
  bb: ReturnType<typeof cls> | null,
  nb: ReturnType<typeof cls> | null,
  illum = 0.95,
): MoonKeepSlot {
  return {
    at,
    illumination: illum,
    altitude: bb || nb ? 50 : -5,
    sun_altitude: -30,
    broadband: bb,
    narrowband: nb,
  }
}

function row(p: Partial<MoonKeepRow>): MoonKeepRow {
  return {
    filter: '',
    narrowband: false,
    moon_down: false,
    illum_bin: 4,
    alt_bin: 2,
    sep_bin: 1,
    illum_from: 0.9,
    illum_to: 1,
    alt_from: 35,
    alt_to: 90,
    sep_from: 45,
    sep_to: 75,
    subs: 676,
    kept: 14,
    nights: 34,
    rate: 0.02,
    low: 0.007,
    high: 0.048,
    worth: 0.03,
    usable: true,
    skip: true,
    ...p,
  }
}

function view(night: MoonKeepSlot[], over: Partial<MoonKeepView> = {}): MoonKeepView {
  return {
    computed_at: '2026-10-12T19:30:00Z',
    mode: 'on',
    rules: {
      skip_below: 0.05,
      confidence: 0.95,
      min_subs: 30,
      min_nights: 3,
      good_night_quality: 0.3,
      floor_degrees: 20,
      prior_strength: 40,
      illum_edges: [0, 0.25, 0.5, 0.75, 0.9, 1],
      alt_edges: [0, 15, 35, 90],
      sep_edges: [20, 45, 75, 110, 180],
    },
    subs: 19555,
    kept: 10026,
    nights: 335,
    from: '2024-12-21T00:00:00Z',
    to: '2026-10-08T00:00:00Z',
    rows: [
      row({}),
      row({
        moon_down: true,
        illum_from: 0,
        alt_from: -90,
        alt_to: 0,
        sep_from: 0,
        sep_to: 180,
        subs: 7732,
        kept: 6070,
        rate: 0.78,
        skip: false,
      }),
      row({ filter: 'Red', subs: 190, kept: 2, rate: 0.012, high: 0.03 }),
      row({
        sep_bin: 2,
        sep_from: 75,
        sep_to: 110,
        subs: 12,
        kept: 3,
        usable: false,
        skip: false,
        rate: 0.2,
      }),
      row({ narrowband: true, filter: 'H-a', alt_bin: 1, alt_from: 15, alt_to: 35 }),
    ],
    replay: {
      nights: 335,
      moon_up_nights: 264,
      subs: 19555,
      kept: 10026,
      moon_up_subs: 9440,
      moon_up_hours: 999.4,
      moon_up_kept: 1997,
      skipped_subs: 1073,
      skipped_hours: 105.4,
      skipped_nights: 61,
      kept_lost: 33,
      idle_subs: 10,
      idle_hours: 1.7,
      idle_kept_lost: 0,
      worst: null,
      by_night: null,
    },
    publish: {
      mode: 'on',
      published_at: '2026-10-12T19:31:00Z',
      rows: 300,
      changed: 300,
      deleted: 0,
    },
    night,
    ...over,
  }
}

describe('moon kept rates', () => {
  it('formats shares', () => {
    expect(pct(0.0198)).toBe('2%')
    expect(pct(0.004)).toBe('0.4%')
    expect(under(0.048)).toBe('under 5%')
    expect(under(0.001)).toBe('under 1%')
  })

  it('groups the night into spans by what is left out', () => {
    const s = brightSpans([
      slot('2026-10-26T03:00:00Z', null, null),
      slot('2026-10-26T03:15:00Z', cls(4, 4, 0.03), cls(2, 2, 0.04)),
      slot('2026-10-26T03:30:00Z', cls(4, 4, 0.045), cls(2, 2, 0.02), 0.97),
      slot('2026-10-26T03:45:00Z', cls(4, 4), cls(2, 0)),
      slot('2026-10-26T04:00:00Z', cls(4, 1), cls(2, 0)),
      slot('2026-10-26T04:15:00Z', cls(4, 0), cls(2, 0)),
    ])
    expect(s.map((x) => x.kind)).toEqual(['idle', 'narrowband', 'partial'])
    expect(s[0]).toMatchObject({
      from: '2026-10-26T03:15:00Z',
      to: '2026-10-26T03:45:00.000Z',
      illumination: 0.97,
      high: 0.045,
    })
    expect(s[2]).toMatchObject({ skipped: 1, plans: 6 })
  })

  it('says why tonight is idle or narrowband-only, from the plan', () => {
    const v = view([
      slot('2026-10-26T05:00:00Z', cls(4, 4, 0.019), cls(2, 2, 0.015), 0.94),
      slot('2026-10-26T05:15:00Z', cls(4, 4, 0.02), cls(2, 0), 0.94),
    ])
    const n = tonightNote(
      v,
      [{ start: '2026-10-26T04:50:00Z', end: '2026-10-26T05:20:00Z', wait: true }],
      [{ target_name: 'M31', reason: 'all exposure plans rejected for a bright Moon' }],
    )
    expect(n?.headline).toBe('Bright Moon: time left to darks and flats')
    expect(n?.lines[0]).toBe(
      '00:00–00:15: Moon 94% lit: past nights like this kept under 2% of subs, so the scheduler waits 23:50–00:20, and darks and flats set to run in waits use that time.',
    )
    expect(n?.lines[1]).toBe(
      '00:15–00:30: Moon 94% lit: past nights like this kept under 2% of broadband subs, so the scheduler takes narrowband filters only.',
    )
    expect(n?.lines[2]).toBe('In the simulated plan, 1 target is left out for a bright Moon.')
  })

  it('does not claim the scheduler acts when the rates are not sent to it', () => {
    const v = view([slot('2026-10-26T05:00:00Z', cls(4, 1, 0.03), cls(2, 0))], {
      publish: {
        mode: 'on',
        published_at: null,
        rows: 0,
        changed: 0,
        deleted: 0,
        skipped: 'no ts_moon_keep table',
      },
    })
    expect(inUse(v)).toBe(false)
    const n = tonightNote(v, [], [])
    expect(n?.headline).toBe('Bright Moon tonight')
    expect(n?.lines[0]).toBe(
      '00:00–00:15: Moon 95% lit: past nights like this kept under 3% of subs for 1 of the 6 planned target filters that are up.',
    )
    expect(n?.lines[1]).toBe(notUsedText(v))
    expect(notUsedText(view([], { mode: 'dry-run' }))).toMatch(/dry run/)
    expect(
      tonightNote(view([slot('2026-10-26T05:00:00Z', cls(4, 0), cls(2, 0))]), [], []),
    ).toBeNull()
  })

  it('explains the Moon now', () => {
    const v = view([slot('2026-10-26T05:00:00Z', cls(4, 4, 0.019), cls(2, 2, 0.015), 0.94)])
    const now = Date.parse('2026-10-26T05:05:00Z')
    expect(nowNote(v, { reachable: 'online', state: 'waiting' }, now)).toBe(
      'Moon 94% lit: past nights like this kept under 2% of subs, so the scheduler is waiting, and darks and flats set to run in waits use that time.',
    )
    expect(nowNote(v, { reachable: 'online', state: 'waiting' }, now + 3600e3)).toBe('')
    const nb = view([slot('2026-10-26T05:00:00Z', cls(4, 4, 0.03), cls(2, 0))])
    expect(nowNote(nb, { reachable: 'online', state: 'imaging' }, now)).toBe(
      'Moon 95% lit: past nights like this kept under 3% of broadband subs, so the scheduler is taking narrowband filters only.',
    )
  })

  it('lays the table out by Moon and distance', () => {
    const v = view([])
    const g = grid(v, '', false)
    expect(g).toHaveLength(16)
    expect(g[0]!.label).toBe('Moon down')
    expect(g[0]!.cells[0]).toMatchObject({ text: '78%', tone: 'ok' })
    expect(g[1]!.label).toBe('90–100% lit, 35–90° up')
    expect(g[1]!.cells[1]).toMatchObject({ text: '2%', tone: 'skip' })
    expect(g[1]!.cells[1]!.title).toMatch(/kept 14 of 676 subs on 34 nights/)
    expect(g[1]!.cells[2]).toMatchObject({ tone: 'thin' })
    expect(g[1]!.cells[0]).toMatchObject({ text: '—', tone: 'none' })
    expect(grid(v, 'Red', false)[1]!.cells[1]!.text).toBe('1%')
    expect(filterChoices(v).map((c) => c.label)).toEqual([
      'All broadband',
      'All narrowband',
      'H-a',
      'Red',
    ])
  })

  it('reports the replay', () => {
    const t = replayText(view([]))
    expect(t[0]).toBe(
      'Replayed over 264 past nights with the Moon up, each judged by rates fitted without that night: the rule would have left 105.4 h (1073 subs) on 61 nights to other filters, darks or flats.',
    )
    expect(t[1]).toBe(
      '33 kept subs would have been lost, of 1997 kept with the Moon up and 10026 kept in all. 1.7 h of it had no other filter of the same target to take.',
    )
  })
})
