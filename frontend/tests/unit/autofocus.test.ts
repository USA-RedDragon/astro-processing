import { describe, expect, it } from 'vitest'
import real from './fixtures/autofocusReal.json'
import {
  curveChart,
  driftChart,
  durationText,
  evalHyperbola,
  fromRun,
  fromStatus,
  historyEmpty,
  movedText,
  parseHyperbolic,
  provisionalFit,
  sortRuns,
  startOf,
  stepSize,
  tonightSince,
  type AfRun,
  type AfRuns,
} from '@/scheduler/autofocus'

const runs = (real as AfRuns).runs as AfRun[]
const at = (hhmm: string) => {
  const r = runs.find((x) => {
    const t = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(x.finished_at))
    return t === hhmm
  })
  if (!r) throw new Error('no run at ' + hhmm)
  return r
}

describe('parseHyperbolic', () => {
  for (const t of ['21:14', '22:56', '23:40', '00:46']) {
    it(`fits the ${t} run's points`, () => {
      const r = at(t)
      const h = parseHyperbolic(r.fit?.fittings?.Hyperbolic)
      expect(h).not.toBeNull()
      const res = (r.points ?? []).map((p) => evalHyperbola(h!, p.position) - p.value)
      const rms = Math.sqrt(res.reduce((a, d) => a + d * d, 0) / res.length)
      expect(rms).toBeLessThan(0.03)
      for (const d of res) expect(Math.abs(d)).toBeLessThan(0.035)
      const min = r.fit?.intersections?.HyperbolicMinimum as { Position: number; Value: number }
      expect(h!.c).toBeCloseTo(min.Position, 2)
      expect(evalHyperbola(h!, h!.c)).toBeCloseTo(min.Value, 2)
    })
  }

  it('reads the 00:46 parameters', () => {
    expect(parseHyperbolic(at('00:46').fit?.fittings?.Hyperbolic)).toEqual({
      c: 26214.009,
      a: 3.251,
      bl: 63.293,
      br: 136.813,
      off: -1.626,
      w: 10,
    })
  })

  it("reads NINA's own cosh form", () => {
    const h = parseHyperbolic('y = 1.5 * cosh(asinh((5000 - x) / 40))')
    expect(h).not.toBeNull()
    expect(evalHyperbola(h!, 5000)).toBeCloseTo(1.5, 6)
    expect(evalHyperbola(h!, 5040)).toBeCloseTo(1.5 * Math.SQRT2, 6)
  })

  it('rejects other strings', () => {
    expect(parseHyperbolic('')).toBeNull()
    expect(parseHyperbolic(null)).toBeNull()
    expect(parseHyperbolic('y = -0.0186 * x + 488.7')).toBeNull()
    expect(
      parseHyperbolic(
        'y = min(max(0, (1 - x) / 10), 1) * 3/6 * √((x - 2)² + 6²) + (1 - min(max(0, (1 - x) / 10), 1)) * 3/7 * √((x - 1)² + 7²) + 1',
      ),
    ).toBeNull()
  })
})

describe('provisionalFit', () => {
  it('needs 4 points', () => {
    expect(provisionalFit(at('00:46').points!.slice(0, 3))).toBeNull()
  })

  it('puts the best near 26216 from 6 of the 00:46 points', () => {
    const f = provisionalFit(at('00:46').points!.slice(0, 6))
    expect(f).not.toBeNull()
    expect(Math.abs(f!.c - 26216)).toBeLessThanOrEqual(6)
    expect(f!.min).toBeGreaterThan(1.55)
    expect(f!.min).toBeLessThan(1.7)
  })
})

describe('formatting', () => {
  it('formats durations', () => {
    expect(durationText(129.78)).toBe('2:10')
    expect(durationText(129.4)).toBe('2:09')
    expect(durationText(59)).toBe('0:59')
    expect(durationText(3725)).toBe('1:02:05')
    expect(durationText(null)).toBe('')
    expect(durationText(-1)).toBe('')
  })

  it('formats moves', () => {
    expect(movedText(26214.009, 26205.9)).toBe('moved +8 steps from 26206')
    expect(movedText(26208.1, 26209)).toBe('moved −1 steps from 26209')
    expect(movedText(26209.2, 26209)).toBe('stayed at 26209')
    expect(movedText(null, 26209)).toBe('')
    expect(movedText(26209, undefined)).toBe('')
  })

  it('picks the start position', () => {
    expect(startOf({ initial_position: 26209, previous_position: 26200 })).toEqual({
      position: 26209,
      basis: 'initial',
    })
    expect(startOf({ previous_position: 26205.9 })).toEqual({ position: 26205.9, basis: 'previous' })
    expect(startOf({}, at('00:46'))).toEqual({ position: 26214.009316714517, basis: 'last' })
    expect(startOf({})).toBeNull()
  })

  it('finds the step size', () => {
    expect(stepSize(at('00:46').points!)).toBe(10)
    expect(stepSize([])).toBeNull()
  })

  it('starts tonight at noon Central', () => {
    expect(tonightSince(Date.parse('2026-10-12T08:49:00Z'))).toBe('2026-10-11T17:00:00.000Z')
    expect(tonightSince(Date.parse('2026-10-12T02:00:00Z'))).toBe('2026-10-11T17:00:00.000Z')
    expect(tonightSince(Date.parse('2026-12-12T20:00:00Z'))).toBe('2026-12-12T18:00:00.000Z')
  })
})

describe('views', () => {
  it('builds a finished view from a real run', () => {
    const v = fromRun(runs[0])
    expect(v.state).toBe('finished')
    expect(v.curve?.kind).toBe('nina')
    expect(v.chosen?.position).toBeCloseTo(26208.1, 1)
    expect(v.start).toEqual({ position: 26209, basis: 'initial' })
    expect(durationText(v.durationSeconds)).toBe('2:10')
  })

  it('falls back to the provisional fit when the formula is unreadable', () => {
    const r = { ...at('00:46'), fit: { fittings: { Hyperbolic: 'y = garbage' } } }
    const v = fromRun(r)
    expect(v.curve?.kind).toBe('provisional')
    expect(v.ninaUnreadable).toBe(true)
  })

  it('shows a running run with the last run as its start', () => {
    const r = at('00:46')
    const v = fromStatus(
      { run_id: 'x', state: 'running', started_at: r.started_at, filter: 'Red', points: r.points!.slice(0, 6) },
      at('23:40'),
    )
    expect(v.state).toBe('running')
    expect(v.chosen).toBeNull()
    expect(v.curve?.kind).toBe('provisional')
    expect(v.start?.basis).toBe('last')
    const c = curveChart(v, 640)
    expect(c.points.filter((p) => p.latest)).toHaveLength(1)
    expect(c.points[5].latest).toBe(true)
    expect(c.dashed).toBe(true)
    expect(c.marker?.filled).toBe(false)
    expect(c.marker?.label).toMatch(/^fit so far 262\d\d · 1\.\d\d$/)
  })

  it('keeps a failed run failed with its error', () => {
    const v = fromStatus({
      run_id: 'f',
      state: 'failed',
      started_at: '2026-10-12T05:44:00Z',
      finished_at: '2026-10-12T05:45:00Z',
      error: 'Not enough stars',
      points: [],
    })
    expect(v.state).toBe('failed')
    expect(v.error).toBe('Not enough stars')
    expect(v.chosen).toBeNull()
    expect(v.curve).toBeNull()
    expect(durationText(v.durationSeconds)).toBe('1:00')
  })

  it('has no points with a running run before the first point', () => {
    const v = fromStatus({ run_id: 'x', state: 'running', points: null })
    expect(v.points).toEqual([])
    const c = curveChart(v, 360)
    expect(c.path).toBe('')
    expect(c.marker).toBeNull()
  })
})

function boxesOverlap(a: number[], b: number[]) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
}

describe('axis labels', () => {
  for (const width of [340, 640, 900]) {
    for (const r of runs) {
      it(`do not collide at ${width}px for ${r.finished_at}`, () => {
        const c = curveChart(fromRun(r), width)
        const h = 11
        const cw = 6.8
        const yBoxes = c.yTicks.map((t) => [c.box.l - 8 - t.label.length * cw, t.pos + 4 - h, c.box.l - 8, t.pos + 4])
        const yTitle = [c.yTitle.x, c.yTitle.y - h, c.yTitle.x + 3 * cw, c.yTitle.y]
        const xBoxes = c.xTicks.map((t) => [
          t.pos - (t.label.length * cw) / 2,
          c.xTickY - h,
          t.pos + (t.label.length * cw) / 2,
          c.xTickY,
        ])
        const xTitle = [c.xTitle.x - 16 * cw, c.xTitle.y - h, c.xTitle.x, c.xTitle.y]
        for (const b of yBoxes) expect(boxesOverlap(b, yTitle)).toBe(false)
        for (const b of yBoxes) for (const x of xBoxes) expect(boxesOverlap(b, x)).toBe(false)
        for (const b of xBoxes) expect(boxesOverlap(b, xTitle)).toBe(false)
        for (let i = 1; i < xBoxes.length; i++) expect(xBoxes[i][0]).toBeGreaterThan(xBoxes[i - 1][2])
        for (const b of xBoxes) {
          expect(b[0]).toBeGreaterThanOrEqual(0)
          expect(b[2]).toBeLessThanOrEqual(width)
        }
        expect(c.xTicks.length).toBeGreaterThanOrEqual(2)
        expect(c.yTicks.length).toBeGreaterThanOrEqual(3)
      })
    }
  }
})

describe('history', () => {
  it('describes empty and unavailable history', () => {
    expect(historyEmpty(null, '')).toBe('Loading.')
    expect(historyEmpty(null, 'boom')).toContain('boom')
    expect(historyEmpty({ since: '2026-10-11T17:00:00Z', available: false, runs: [] }, '')).toContain(
      'no autofocus table',
    )
    expect(historyEmpty({ since: '2026-10-11T17:00:00Z', available: true, runs: [] }, '')).toBe(
      'No autofocus runs since 12:00 tonight. Each run appears here when NINA finishes it.',
    )
    expect(historyEmpty(real as AfRuns, '')).toBe('')
  })

  it('sorts newest first and charts drift', () => {
    const tonight = sortRuns(runs).filter((r) => r.finished_at >= '2026-10-11T17:00:00Z')
    expect(tonight).toHaveLength(5)
    const d = driftChart(tonight, 640)
    expect(d?.posDots).toHaveLength(5)
    expect(d?.tempDots).toHaveLength(5)
    expect(d!.timeTicks.length).toBeGreaterThan(1)
    for (let i = 1; i < d!.timeTicks.length; i++)
      expect(d!.timeTicks[i].pos - d!.timeTicks[i - 1].pos).toBeGreaterThan(40)
    expect(driftChart([], 640)).toBeNull()
  })
})
