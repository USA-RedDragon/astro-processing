import { describe, expect, it } from 'vitest'
import type { EventFrame, SkyEvent, SkyEvents } from '@/scheduler/api/skyEvents'
import {
  countText,
  exposureText,
  frameGeometry,
  lanes,
  momentText,
  monthMarks,
  pageState,
  planActive,
  secondsText,
  stripRange,
  planView,
  thisWeek,
  tonightBlocks,
  windowText,
  zonedMidnight,
} from '@/scheduler/skyEvents'

function ev(over: Partial<SkyEvent> = {}): SkyEvent {
  return {
    id: 'mars-m-44-2026-10-12',
    kind: 'body-dso',
    title: 'Mars with M 44 Beehive',
    members: [
      { name: 'Mars', kind: 'planet', designation: null, type: null, diameter_deg: 0.003, magnitude: 0.9 },
      {
        name: 'M 44 Beehive',
        kind: 'dso',
        designation: 'M 44',
        type: 'open-cluster',
        diameter_deg: 1.81,
        magnitude: null,
      },
    ],
    first_night: '2026-10-12',
    last_night: '2026-10-13',
    nights: 2,
    start: '2026-10-13T06:45:00Z',
    end: '2026-10-14T10:15:00Z',
    best: { at: '2026-10-13T08:30:00Z', separation_deg: 1.01, altitude_deg: 17 },
    hours_in_frame: 7,
    frame: {
      center_ra: 130.6,
      center_dec: 19.5,
      rotation_deg: 0,
      width_deg: 3.32,
      height_deg: 2.22,
      objects: [
        { name: 'Mars', kind: 'planet', type: null, east_deg: 0.5, north_deg: -0.2, x_deg: 0, y_deg: 0, diameter_deg: 0.003 },
        { name: 'M 44 Beehive', kind: 'dso', type: 'open-cluster', east_deg: -0.5, north_deg: 0.2, x_deg: 0, y_deg: 0, diameter_deg: 1.81 },
      ],
    },
    moving_center: false,
    night_windows: [
      { night: '2026-10-12', start: '2026-10-13T06:45:00Z', end: '2026-10-13T10:15:00Z', hours: 3.5, center_ra: 130.6, center_dec: 19.5 },
      { night: '2026-10-13', start: '2026-10-14T06:45:00Z', end: '2026-10-14T10:15:00Z', hours: 3.5, center_ra: 130.6, center_dec: 19.5 },
    ],
    exposure: { short_seconds: null, normal_seconds: null, basis: 'No sub of this pairing yet' },
    priority: 'normal',
    plan: null,
    ...over,
  }
}

const plan = (state: NonNullable<SkyEvent['plan']>['state'], priority: 'normal' | 'high' = 'normal') => ({
  state,
  priority,
  project_guid: 'p',
  target_guid: 't',
  command_id: 'c',
  planned_at: '2026-10-12T06:40:00Z',
  message: null,
})

function resp(over: Partial<SkyEvents> = {}): SkyEvents {
  return {
    status: 'ready',
    reason: null,
    computed_at: null,
    from: null,
    to: null,
    months: 6,
    criteria: null,
    frame: null,
    bodies: [],
    body_errors: [],
    planning: { available: true, reason: null },
    events: [],
    ...over,
  }
}

describe('pageState', () => {
  it('derives every state', () => {
    expect(pageState(null, '', true)).toBe('loading')
    expect(pageState(null, 'Not Found', false)).toBe('error')
    expect(pageState(resp({ status: 'pending', reason: 'computing' }), '', false)).toBe('pending')
    expect(pageState(resp({ status: 'unavailable' }), '', false)).toBe('unavailable')
    expect(pageState(resp(), '', false)).toBe('empty')
    expect(pageState(resp({ events: null }), '', false)).toBe('empty')
    expect(pageState(resp({ events: [ev()] }), '', false)).toBe('ready')
  })

  it('keeps the last response on a failed reload', () => {
    expect(pageState(resp({ events: [ev()] }), 'timeout', false)).toBe('ready')
  })
})

describe('text helpers', () => {
  it('counts events in words', () => {
    expect(countText(10, 6)).toBe('10 events in the next six months')
    expect(countText(1, 1)).toBe('1 event in the next month')
  })

  it('formats the closest moment in Central with the zone', () => {
    expect(momentText('2026-10-13T08:30:00Z')).toBe('Tue 13 Oct, 03:30 CDT')
    expect(momentText('2026-11-16T07:30:00Z')).toBe('Mon 16 Nov, 01:30 CST')
    expect(momentText(null)).toBe('')
  })

  it('formats the window from night dates', () => {
    expect(windowText('2026-11-01', '2026-11-01')).toBe('night of 1 Nov')
    expect(windowText('2026-10-12', '2026-10-13')).toBe('nights of 12 Oct to 13 Oct 2026')
    expect(windowText('2026-12-11', '2027-02-05')).toBe('nights of 11 Dec 2026 to 5 Feb 2027')
  })

  it('says not measured yet with the basis when the exposure is unknown', () => {
    expect(exposureText(ev().exposure)).toBe('Exposure not measured yet. No sub of this pairing yet.')
    expect(exposureText({ short_seconds: 2, normal_seconds: 180, basis: 'From your subs.' })).toBe(
      'Exposures: short 2 s, normal 180 s. From your subs.',
    )
    expect(exposureText({ short_seconds: 2, normal_seconds: null, basis: '' })).toBe(
      'Exposures: short 2 s, normal not measured yet.',
    )
    expect(exposureText(null)).toBe('Exposure not measured yet.')
  })

  it('marks this week when the window starts within seven days and has not ended', () => {
    const now = Date.parse('2026-10-12T07:00:00Z')
    expect(thisWeek(ev(), now)).toBe(true)
    expect(thisWeek(ev({ start: '2026-10-20T06:00:00Z', end: '2026-10-21T06:00:00Z' }), now)).toBe(false)
    expect(thisWeek(ev({ start: '2026-10-01T06:00:00Z', end: '2026-10-02T06:00:00Z' }), now)).toBe(false)
    expect(thisWeek(ev({ start: '2026-10-01T06:00:00Z', end: '2026-10-30T06:00:00Z' }), now)).toBe(true)
  })
})

describe('plan state', () => {
  it('treats queued, pending, applied and saved as planned', () => {
    for (const s of ['queued', 'pending', 'applied', 'saved'] as const) expect(planActive(plan(s))).toBe(true)
    for (const s of ['failed', 'rejected', 'conflict', 'cancelled', 'undone'] as const)
      expect(planActive(plan(s))).toBe(false)
    expect(planActive(null)).toBe(false)
  })

  it('labels the plan and keeps the scheduler message', () => {
    expect(planView(null)).toBeNull()
    expect(planView(plan('applied'))).toMatchObject({ label: 'Planned', tone: 'ok', active: true })
    expect(planView({ ...plan('failed'), message: 'no template' })).toMatchObject({
      label: 'Failed',
      tone: 'bad',
      active: false,
      message: 'no template',
    })
    expect(planView(plan('queued', 'high'))!.message).toContain('high priority')
  })
})

describe('lanes', () => {
  const t0 = Date.parse('2026-10-12T05:00:00Z')
  const t1 = Date.parse('2027-04-12T05:00:00Z')

  it('places one lane per event at its span and colours high priority', () => {
    const l = lanes([ev(), ev({ id: 'b', priority: 'high', start: '2027-04-01T00:00:00Z', end: '2027-05-01T00:00:00Z' })], t0, t1)
    expect(l).toHaveLength(2)
    expect(l[0]!.left).toBeCloseTo(0.59, 1)
    expect(l[0]!.width).toBe(0.8)
    expect(l[0]!.high).toBe(false)
    expect(l[0]!.label).toBe('Mars + M 44')
    expect(l[0]!.labelSide).toBe('right')
    expect(l[1]!.high).toBe(true)
    expect(l[1]!.left + l[1]!.width).toBeCloseTo(100)
    expect(l[1]!.labelSide).toBe('left')
    expect(l[1]!.labelMax).toBeLessThan(l[1]!.left)
  })

  it('keeps labels inside the strip', () => {
    const l = lanes([ev({ start: '2027-01-01T00:00:00Z', end: '2027-01-10T00:00:00Z' })], t0, t1)[0]!
    if (l.labelSide === 'right') expect(l.labelAt + l.labelMax).toBeLessThanOrEqual(100)
    else expect(l.labelAt + l.labelMax).toBeLessThanOrEqual(100)
  })

  it('returns nothing for an empty span', () => {
    expect(lanes([ev()], t1, t0)).toEqual([])
  })
})

describe('month marks', () => {
  it('places month starts at Central midnight', () => {
    expect(new Date(zonedMidnight(2026, 10, 1)).toISOString()).toBe('2026-11-01T05:00:00.000Z')
    expect(new Date(zonedMidnight(2026, 11, 1)).toISOString()).toBe('2026-12-01T06:00:00.000Z')
    const m = monthMarks(Date.parse('2026-10-12T05:00:00Z'), Date.parse('2027-04-12T05:00:00Z'))
    expect(m.map((x) => x.label)).toEqual(['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'])
    expect(m[0]!.at).toBe(0)
    expect(m[1]!.at).toBeGreaterThan(10)
  })

  it('drops a sliver of a first month', () => {
    const m = monthMarks(Date.parse('2026-10-30T05:00:00Z'), Date.parse('2027-04-30T05:00:00Z'))
    expect(m[0]!.label).toBe('Nov')
  })
})

describe('frame geometry', () => {
  const f: EventFrame = ev().frame

  it('draws north up and east left, to scale', () => {
    const g = frameGeometry(f)
    expect(g.rect.w / g.rect.h).toBeCloseTo(3.32 / 2.22)
    expect(g.rect.w).toBeCloseTo(3.32 * g.scale)
    const [mars, m44] = g.points
    expect(mars!.x).toBeLessThan(110)
    expect(mars!.y).toBeGreaterThan(80)
    expect(m44!.x).toBeCloseTo(110 + 0.5 * g.scale)
    expect(m44!.y).toBeCloseTo(80 - 0.2 * g.scale)
  })

  it('enlarges planets but draws deep-sky objects and the Moon at their size', () => {
    const g = frameGeometry({
      ...f,
      objects: [
        ...f.objects,
        { name: 'Moon', kind: 'moon', type: null, east_deg: 0, north_deg: 0, x_deg: 0, y_deg: 0, diameter_deg: 0.52 },
      ],
    })
    const [mars, m44, moon] = g.points
    expect(mars!.r).toBe(3.2)
    expect(mars!.enlarged).toBe(true)
    expect(mars!.disc).toBe(true)
    expect(m44!.disc).toBe(false)
    expect(m44!.r).toBeCloseTo((1.81 / 2) * g.scale)
    expect(moon!.r).toBeCloseTo(0.26 * g.scale)
    expect(moon!.enlarged).toBe(false)
  })

  it('turns the frame by the rotation and keeps it inside the view', () => {
    const g = frameGeometry({ ...f, rotation_deg: 90 })
    expect(g.rect.rotate).toBe(-90)
    expect(g.rect.w).toBeLessThanOrEqual(160)
    const flat = frameGeometry(f)
    expect(flat.rect.w).toBeLessThanOrEqual(220)
    expect(flat.rect.h).toBeLessThanOrEqual(160)
  })

  it('labels with the member designation', () => {
    const g = frameGeometry(f, { 'M 44 Beehive': 'M 44' })
    expect(g.points[1]!.label).toBe('M 44')
  })
})

describe('tonight blocks', () => {
  const t0 = Date.parse('2026-10-12T23:00:00Z')
  const t1 = Date.parse('2026-10-13T12:00:00Z')

  it('shows planned events clipped to the night', () => {
    const b = tonightBlocks([ev({ plan: plan('applied', 'high'), priority: 'high' })], t0, Date.parse('2026-10-13T08:00:00Z'))
    expect(b).toHaveLength(1)
    expect(new Date(b[0]!.start).toISOString()).toBe('2026-10-13T06:45:00.000Z')
    expect(new Date(b[0]!.end).toISOString()).toBe('2026-10-13T08:00:00.000Z')
    expect(b[0]!.high).toBe(true)
  })

  it('leaves out unplanned, undone, failed and cancelled events and other nights', () => {
    expect(tonightBlocks([ev()], t0, t1)).toEqual([])
    for (const s of ['undone', 'failed', 'cancelled'] as const)
      expect(tonightBlocks([ev({ plan: plan(s) })], t0, t1)).toEqual([])
    expect(tonightBlocks([ev({ plan: plan('queued') })], t0, t1)).toHaveLength(1)
    expect(tonightBlocks([ev({ plan: plan('applied') })], Date.parse('2026-10-15T00:00:00Z'), Date.parse('2026-10-15T12:00:00Z'))).toEqual([])
    expect(tonightBlocks(null, t0, t1)).toEqual([])
  })
})

describe('strip range', () => {
  const now = Date.parse('2026-10-12T07:30:00Z')

  it('runs from today for the asked months inside the computed span', () => {
    const r = stripRange('2026-07-01T00:00:00Z', '2027-11-01T00:00:00Z', 6, now)!
    expect(new Date(r.t0).toISOString()).toBe('2026-10-12T05:00:00.000Z')
    expect(new Date(r.t1).toISOString()).toBe('2027-04-12T05:00:00.000Z')
  })

  it('clips to the computed span and works without one', () => {
    const r = stripRange('2026-10-20T00:00:00Z', '2027-01-01T00:00:00Z', 6, now)!
    expect(new Date(r.t0).toISOString()).toBe('2026-10-20T00:00:00.000Z')
    expect(new Date(r.t1).toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(stripRange(null, null, 1, now)).not.toBeNull()
    expect(stripRange('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', 6, now)).toBeNull()
  })
})

describe('seconds', () => {
  it('keeps very short exposures readable', () => {
    expect(secondsText(0.0041)).toBe('0.0041')
    expect(secondsText(0.00013)).toBe('0.00013')
    expect(secondsText(0.0001)).toBe('0.0001')
    expect(secondsText(2)).toBe('2')
    expect(secondsText(180)).toBe('180')
    expect(secondsText(12.25)).toBe('12.3')
  })
})
