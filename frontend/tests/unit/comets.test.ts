import { describe, expect, it } from 'vitest'
import { ApiError } from '@/scheduler/api/client'
import type { Comet, CometView } from '@/scheduler/api/comets'
import type { CommandRecord } from '@/scheduler/api/commands'
import {
  bodyMinimumTime,
  addStates,
  brightest,
  canonicalFilter,
  emptyState,
  longestSub,
  lrgbFilters,
  missingText,
  peakText,
  rateText,
  shortSubs,
  sortComets,
  windowText,
  withDesignation,
} from '@/scheduler/comets'

function comet(name: string, mpc: number | null, jpl: number | null, rate = 1): Comet {
  return {
    name,
    designation: name,
    horizons_command: name,
    orbit_type: 'P',
    perihelion: '2026-10-01T00:00:00Z',
    q_au: 1,
    e: 0.5,
    magnitude_mpc: mpc,
    magnitude_jpl: jpl,
    r_au: 1.4,
    delta_au: 0.6,
    ra: 150,
    dec: 20,
    rate_arcsec_per_min: rate,
    window: { hours: 0, start: null, end: null, peak_alt: 0, peak_at: null },
  }
}

function view(comets: Comet[]): CometView {
  return {
    computed_at: '2026-10-12T20:00:00Z',
    night: { start: '2026-10-12T17:00:00Z' },
    min_altitude: 30,
    max_magnitude: 15,
    elements: { source: 'MPC', fetched_at: null, comets: 900 },
    jpl_magnitudes: { source: 'JPL', fetched_at: null, comets: 800 },
    basis: '',
    comets,
  }
}

function rec(
  id: string,
  kind: string,
  status: CommandRecord['status'],
  payload: unknown,
  at: string,
  extra: Partial<CommandRecord> = {},
): CommandRecord {
  return {
    id,
    kind,
    payload,
    author: 'me',
    title: kind,
    category: 'created',
    destination: 'observatory',
    diffs: null,
    objects: null,
    status,
    attempts: 1,
    created_at: at,
    updated_at: at,
    ...extra,
  }
}

const create = (guid: string, designation?: string) => ({
  project: { guid, name: 'P' },
  targets: [{ guid: 't' + guid, name: 'T', designation }],
})

describe('brightest and sortComets', () => {
  it('takes the brighter of the two estimates', () => {
    expect(brightest(comet('a', 12, 9.5))).toBe(9.5)
    expect(brightest(comet('a', 12, null))).toBe(12)
    expect(brightest(comet('a', null, null))).toBeNull()
  })

  it('sorts by the brighter estimate, unknowns last, and does not mutate', () => {
    const list = [
      comet('faint', 14.9, 14.5),
      comet('unknown', null, null),
      comet('jplbright', 13.9, 8.1),
      comet('mpcbright', 9.6, 11.2),
    ]
    const out = sortComets(list)
    expect(out.map((c) => c.name)).toEqual(['jplbright', 'mpcbright', 'faint', 'unknown'])
    expect(list[0].name).toBe('faint')
  })
})

describe('longestSub', () => {
  it('is floor(1.91 / rate * 60) seconds', () => {
    expect(longestSub(5.21)).toBe(21)
    expect(longestSub(0.82)).toBe(139)
    expect(longestSub(1.91)).toBe(60)
    expect(longestSub(0.51)).toBe(224)
  })

  it('has no cap without measurable motion', () => {
    expect(longestSub(0)).toBeNull()
    expect(longestSub(-1)).toBeNull()
    expect(longestSub(Number.NaN)).toBeNull()
  })

  it('marks short subs under 60 s only', () => {
    expect(shortSubs(5.21)).toBe(true)
    expect(shortSubs(1.91)).toBe(false)
    expect(shortSubs(1.92)).toBe(true)
    expect(shortSubs(0)).toBe(false)
  })

  it('formats the motion in arcsec per minute', () => {
    expect(rateText(5.214)).toBe('5.2″/min')
    expect(rateText(0.514)).toBe('0.51″/min')
  })
})

describe('window and peak text', () => {
  it('shows the window in Central time with the zone', () => {
    const w = {
      hours: 5.5,
      start: '2026-10-13T06:00:00Z',
      end: '2026-10-13T11:30:00Z',
      peak_alt: 62.6,
      peak_at: '2026-10-13T08:10:00Z',
    }
    expect(windowText(w, 30)).toEqual({ main: '01:00 to 06:30 CDT', sub: '5.5 h above 30°' })
    expect(peakText(w)).toEqual({ main: '63°', sub: 'at 03:10' })
  })

  it('uses CST after the change back', () => {
    const w = {
      hours: 6,
      start: '2026-12-01T07:00:00Z',
      end: '2026-12-01T13:00:00Z',
      peak_alt: 40,
      peak_at: null,
    }
    expect(windowText(w, 30)).toEqual({ main: '01:00 to 07:00 CST', sub: '6 h above 30°' })
    expect(peakText(w).sub).toBe('')
  })

  it('says when there is no window', () => {
    expect(windowText(comet('a', 9, 9).window, 30).main).toBe('Not up')
  })
})

describe('emptyState', () => {
  it('explains a stacker without the endpoint', () => {
    const e = emptyState(new ApiError(404, 'not found', null), null)
    expect(e?.title).toBe('No comet list on this stacker yet')
  })

  it('passes the stacker reason through on 503', () => {
    const e = emptyState(new ApiError(503, 'the comet list is off', null), null)
    expect(e?.title).toBe('The comet list is not available')
    expect(e?.text).toContain('the comet list is off')
  })

  it('reports an empty night', () => {
    const e = emptyState(null, view([]))
    expect(e?.title).toBe('No comets tonight')
    expect(e?.text).toContain('magnitude 15')
    expect(e?.text).toContain('30°')
  })

  it('has no empty state when there are comets', () => {
    expect(emptyState(null, view([comet('a', 9, 9)]))).toBeNull()
  })
})

describe('addStates', () => {
  it('marks applied creates with the designation as added', () => {
    const m = addStates(
      [rec('1', 'project.create', 'applied', create('g1', '161P'), '2026-10-12T01:00:00Z')],
      [],
    )
    expect(m.get('161P')?.state).toBe('added')
  })

  it('tracks queued creates and failures with their message', () => {
    const m = addStates(
      [
        rec('1', 'project.create', 'queued', create('g1', '78P'), '2026-10-12T01:00:00Z'),
        rec('2', 'project.create', 'rejected', create('g2', '10P'), '2026-10-12T01:00:00Z', {
          message: 'unknown field designation',
        }),
      ],
      [],
    )
    expect(m.get('78P')?.state).toBe('adding')
    expect(m.get('10P')).toMatchObject({ state: 'failed', message: 'unknown field designation' })
  })

  it('ignores undone creates and creates deleted later', () => {
    const m = addStates(
      [
        rec('1', 'project.create', 'applied', create('g1', '78P'), '2026-10-12T01:00:00Z', {
          undone_by: 'x',
        }),
        rec('2', 'project.create', 'applied', create('g2', '10P'), '2026-10-12T01:00:00Z'),
        rec('3', 'project.delete', 'applied', create('g2', '10P'), '2026-10-12T02:00:00Z'),
        rec('4', 'project.create', 'applied', create('g3'), '2026-10-12T01:00:00Z'),
      ],
      [],
    )
    expect(m.size).toBe(0)
  })

  it('takes designations from the scheduler body table, case and spacing aside', () => {
    const m = addStates([], [{ target_guid: 'g', name: 'x', designation: ' c/2025  r2 ' }])
    expect(m.get('C/2025 R2')).toEqual({ state: 'added', source: 'scheduler' })
  })
})

describe('lrgbFilters', () => {
  const f = (name: string) => ({ name })

  it('names the observatory filters for Luminance, Red, Green and Blue', () => {
    const out = lrgbFilters([f('H-a'), f('Blue'), f('L'), f('Red'), f('Green')])
    expect(out).toEqual({ filters: ['L', 'Red', 'Green', 'Blue'], missing: [] })
  })

  it('names the missing filters instead of guessing', () => {
    const out = lrgbFilters([f('L'), f('G'), f('H-a')])
    expect(out.filters).toEqual(['L', 'G'])
    expect(out.missing).toEqual(['Red', 'Blue'])
    expect(missingText(out.missing)).toBe(
      "The observatory has no Red and Blue filters, so it can't image this in LRGB.",
    )
    expect(missingText(['Green'])).toBe(
      "The observatory has no Green filter, so it can't image this in LRGB.",
    )
    expect(missingText([])).toBe('')
  })

  it('reads filter names the way the stacker does', () => {
    expect(
      ['Lum', 'L', 'Luminance', 'red', 'G', 'Blue', 'H-alpha', 'OIII'].map(canonicalFilter),
    ).toEqual(['L', 'L', 'L', 'R', 'G', 'B', 'H', 'O'])
  })
})

describe('withDesignation', () => {
  it('sets the designation on every target and keeps the plans as drafted', () => {
    const draft = {
      project: { guid: 'p', name: '161P/Hartley-IRAS' },
      targets: [
        {
          guid: 't',
          name: '161P/Hartley-IRAS',
          plans: [{ guid: 'a', template_id: 1, template_name: 'L', exposure: -1, desired: 10 }],
        },
      ],
      goals: [],
    }
    const out = withDesignation(draft, '161P')
    expect(out.targets[0].designation).toBe('161P')
    expect(out.targets[0].plans[0].exposure).toBe(-1)
    expect(draft.targets[0]).not.toHaveProperty('designation')
    expect(out.targets[0]).not.toHaveProperty('kind')
  })

  it('adds the body kind only when one is given', () => {
    const draft = {
      project: { guid: 'p', name: '1 Ceres' },
      targets: [{ guid: 't', name: '1 Ceres', plans: [] }],
      goals: [],
    }
    expect(withDesignation(draft, '1', 'asteroid').targets[0]).toMatchObject({
      designation: '1',
      kind: 'asteroid',
    })
  })
})

describe('bodyMinimumTime', () => {
  it('keeps the usual minimum time when the windows are long or unknown', () => {
    expect(bodyMinimumTime(90, null, null, 30)).toEqual({
      minutes: 90,
      basis: 'the usual minimum time of your projects',
    })
    expect(bodyMinimumTime(90, 4.8, 3.2, 30).minutes).toBe(90)
    expect(bodyMinimumTime(90, 0, 0, 30).minutes).toBe(90)
  })

  it("takes half of the shorter of tonight's and the typical window, in 5 min steps", () => {
    const tonight = bodyMinimumTime(90, 1.2, 3.1, 30)
    expect(tonight.minutes).toBe(35)
    expect(tonight.basis).toContain("half of tonight's 72 min window, above 30°")
    const typical = bodyMinimumTime(90, 4.8, 2.17, 25)
    expect(typical.minutes).toBe(65)
    expect(typical.basis).toContain(
      'half of the typical 2.2 h window of the next 90 nights, above 25°',
    )
    expect(bodyMinimumTime(90, null, 1.0, 30).minutes).toBe(30)
  })

  it('never goes below 20 min or above the usual time', () => {
    expect(bodyMinimumTime(90, 0.4, null, 30).minutes).toBe(20)
    expect(bodyMinimumTime(15, 0.4, null, 30).minutes).toBe(15)
  })
})
