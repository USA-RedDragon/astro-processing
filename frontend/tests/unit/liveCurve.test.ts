import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { LiveCurve, LivePoint } from '@/scheduler/api/binaries'
import { clock, hm } from '@/scheduler/format'
import {
  bandPath,
  chartOf,
  dipFacts,
  durationText,
  eclipseFacts,
  measuredText,
  pillFor,
  shareWords,
  showLive,
  subline,
  title,
  TICK_GAP,
  whyText,
  xTicks,
  yTicks,
} from '@/scheduler/liveCurve'
import LiveCurveCard from '@/scheduler/components/LiveCurveCard.vue'

const mid = Date.parse('2026-10-21T03:41:00Z')
const at = (min: number) => new Date(mid + min * 60e3).toISOString()

function points(n: number, step = 5, start = -60): LivePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    frame_id: i + 1,
    time: at(start + i * step),
    filter: 'R',
    mag: 0.01 * (i % 3),
    err: 0.03,
    comp: 0.005,
  }))
}

function eclipse(extra: Partial<LiveCurve> = {}): LiveCurve {
  return {
    kind: 'eclipse',
    project_guid: 'p-1',
    project_name: 'Eclipse: 2217',
    object: 'Cygnis Loop Panel 2',
    source_id: 2217,
    name: '2217',
    state: 'following',
    why: 'the subs sit within the timing error of 4 min',
    other_subs: 0,
    from: at(-130),
    to: at(110),
    points: points(26),
    comps: 12,
    comp_scatter: 0.02,
    last_sub: at(65),
    eclipse: {
      kind: 'primary',
      mid: at(0),
      err_min: 4,
      start: at(-105),
      end: at(105),
      depth: 0.45,
      band: 'r',
      basis: 'ATLAS, TESS and ZTF',
      curve: [
        { t: at(-130), v: 0, lo: 0, hi: 0 },
        { t: at(0), v: 0.45, lo: 0.44, hi: 0.45 },
        { t: at(110), v: 0, lo: 0, hi: 0 },
      ],
      shift_min: 3.2,
      shift_err_min: 4.6,
      fit_depth: 0.43,
      fit_depth_err: 0.01,
      planned_end: at(110),
    },
    updated_at: at(66),
    ...extra,
  }
}

function dipWatch(extra: Partial<LiveCurve> = {}): LiveCurve {
  return {
    kind: 'dip-watch',
    project_guid: 'p-2',
    project_name: 'Dip watch 15523',
    object: 'Cygnis Loop Panel 1',
    source_id: 15523,
    name: '15523',
    state: 'no-dip',
    why: 'no 4 subs in a row fade 0.06 mag or more',
    other_subs: 0,
    from: at(0),
    to: at(135),
    points: points(18, 2.6, 2),
    comps: 11,
    comp_scatter: 0.02,
    scatter: 0.05,
    last_sub: at(46),
    dip: {
      start: at(0),
      end: at(135),
      depth_low: 0.15,
      depth_high: 0.6,
      active_share: 0.25,
      latest: 0.01,
      smallest: 0.08,
      over_min: 20,
    },
    updated_at: at(47),
    ...extra,
  }
}

describe('live curve card words', () => {
  it('names every state in plain words', () => {
    expect(pillFor('early')).toEqual({ label: 'Too early to tell', tone: 'warn' })
    expect(pillFor('following')).toEqual({ label: 'Following the expected curve', tone: 'ok' })
    expect(pillFor('off')).toEqual({ label: 'Off the expected curve', tone: 'warn' })
    expect(pillFor('comps')).toEqual({ label: 'Nearby stars moving', tone: 'warn' })
    expect(pillFor('dip')).toEqual({ label: 'Dip seen', tone: 'ok' })
    expect(pillFor('no-dip')).toEqual({ label: 'No dip yet', tone: 'warn' })
  })

  it('shows the card for its own run, and after it until another target starts', () => {
    expect(showLive(null, 'p-1')).toBe(false)
    expect(showLive(eclipse(), 'p-1')).toBe(true)
    expect(showLive(eclipse(), null)).toBe(true)
    expect(showLive(eclipse(), 'p-9')).toBe(false)
  })

  it('titles and sublines each kind', () => {
    const now = mid + 66 * 60e3
    expect(title(eclipse())).toBe('Deep eclipse of 2217, live')
    expect(title(dipWatch())).toBe('Dip watch on 15523, live')
    expect(subline(eclipse(), now)).toBe(
      `Expected middle ${clock(at(0))}, give or take 4 min · 0.45 mag deep in r · 26 subs measured, the last one taken 1 min ago`,
    )
    expect(subline(dipWatch(), now)).toContain(
      `Window ${hm(at(0))} to ${clock(at(135))} · dips seen in about 1 window in 4`,
    )
    expect(measuredText(eclipse({ points: [] }), now)).toBe('no sub measured yet')
    expect(shareWords(0.25)).toBe('1 window in 4')
    expect(durationText(89 * 60e3)).toBe('1 h 29 min')
  })

  it('gives the eclipse facts from the fit, and says not measured yet without one', () => {
    const f = eclipseFacts(eclipse())
    expect(f.map((x) => x.value)).toEqual([
      '3 min late, give or take 5',
      '0.43 mag',
      'Steady, 0.02 mag',
      '12 before and 14 after the middle',
    ])
    const e = eclipse()
    delete e.eclipse!.shift_min
    delete e.eclipse!.fit_depth
    const g = eclipseFacts({ ...e, comp_scatter: undefined })
    expect(g.map((x) => x.value)).toEqual([
      'Not measured yet',
      'Not measured yet',
      'Not measured yet',
      '12 before and 14 after the middle',
    ])
  })

  it('gives the dip watch facts, the dip when seen', () => {
    const now = mid + 46 * 60e3
    expect(dipFacts(dipWatch(), now).map((x) => [x.label, x.value])).toEqual([
      ['Level now', '0.01 mag fainter'],
      ['Smallest dip it would catch', '0.08 mag'],
      ['Nearby stars', 'Steady, 0.02 mag'],
      ['Window left', '1 h 29 min'],
    ])
    const seen = dipWatch({
      state: 'dip',
      dip: { ...dipWatch().dip!, dip_start: at(30), dip_depth: 0.31 },
    })
    expect(dipFacts(seen, now)[0]).toEqual({
      label: 'Dip',
      value: `0.31 mag from ${hm(at(30))}`,
      note: 'nearby stars steady through it',
    })
    expect(dipFacts(dipWatch({ state: 'comps' }), now)[2]!.value).toBe('Moving, 0.02 mag')
  })

  it('writes the why in local time', () => {
    expect(
      whyText(
        dipWatch({
          why: 'the star faded 0.31 mag from 2026-10-21T04:11:00Z while the nearby stars stayed steady',
        }),
      ),
    ).toBe(
      `The star faded 0.31 mag from ${clock('2026-10-21T04:11:00Z')} while the nearby stars stayed steady.`,
    )
    expect(whyText(eclipse({ note: 'Not measured: the target has no plate solution.' }))).toBe(
      'Not measured: the target has no plate solution.',
    )
  })

  it('scales the chart over the run and the curve, fainter down', () => {
    const live = eclipse()
    const c = chartOf(live, mid + 66 * 60e3)
    expect(c.x0).toBe(mid - 130 * 60e3)
    expect(c.x1).toBe(mid + 110 * 60e3)
    expect(c.sy(0.45)).toBeGreaterThan(c.sy(0))
    expect(c.y0).toBeLessThanOrEqual(-0.1)
    expect(c.y1).toBeGreaterThanOrEqual(0.6)
    expect(yTicks(c)).toContain(0)
    expect(bandPath(live, c)).toMatch(/^M.*Z$/)
  })
})

describe('live curve card', () => {
  it('draws a point with an error bar per sub and the not measured line with none', async () => {
    const el = document.createElement('div')
    const app = createApp(LiveCurveCard, { live: eclipse(), now: mid + 66 * 60e3 })
    app.mount(el)
    await nextTick()
    expect(el.querySelectorAll('circle.pt')).toHaveLength(26)
    expect(el.querySelectorAll('line.err')).toHaveLength(26)
    expect(el.querySelector('.badge')?.textContent).toBe('Following the expected curve')
    expect(el.textContent).toContain('Expected, from ATLAS, TESS and ZTF')
    expect(el.textContent).not.toContain('Not measured yet. Each sub')
    app.unmount()
    const empty = createApp(LiveCurveCard, {
      live: dipWatch({ points: null, state: 'early' }),
      now: mid,
    })
    empty.mount(el)
    await nextTick()
    expect(el.querySelectorAll('circle.pt')).toHaveLength(0)
    expect(el.textContent).toContain('Not measured yet. Each sub shows here')
    expect(el.textContent).toContain('Depths seen before, 0.15 to 0.60 mag')
    empty.unmount()
  })
})

const LABEL_W = 5 * 6.5

function longWatch(): LiveCurve {
  return dipWatch({
    from: at(-600),
    to: at(720),
    points: points(60, 20, -580),
    dip: { ...dipWatch().dip!, start: at(-600), end: at(720) },
  })
}

function expectApart(xs: number[], w: number) {
  for (let i = 1; i < xs.length; i++)
    expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(LABEL_W + 8)
  for (const x of xs) {
    expect(x - LABEL_W / 2).toBeGreaterThanOrEqual(0)
    expect(x + LABEL_W / 2).toBeLessThanOrEqual(w)
  }
}

describe('live curve time labels', () => {
  it('spaces a 22 h window by the chart width so labels never touch', () => {
    const live = longWatch()
    const wide = chartOf(live, mid, 1200)
    const narrow = chartOf(live, mid, 400)
    const wt = xTicks(wide)
    const nt = xTicks(narrow)
    expect(wt[1]! - wt[0]!).toBe(2 * 3600e3)
    expect(nt[1]! - nt[0]!).toBe(4 * 3600e3)
    expectApart(wt.map(wide.sx), 1200)
    expectApart(nt.map(narrow.sx), 400)
    for (const t of [...wt, ...nt]) expect(hm(t)).toMatch(/^\d\d:00$/)
    expect(nt.map(hm)).toEqual(expect.arrayContaining(['00:00', '04:00']))
  })

  it('keeps half hours on a short window and labels at least TICK_GAP apart', () => {
    const c = chartOf(eclipse(), mid, 640)
    const t = xTicks(c)
    expect(t[1]! - t[0]!).toBe(1800e3)
    for (let i = 1; i < t.length; i++)
      expect(c.sx(t[i]!) - c.sx(t[i - 1]!)).toBeGreaterThanOrEqual(TICK_GAP)
  })
})

describe('live curve card at a measured width', () => {
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!
  afterEach(() => Object.defineProperty(Element.prototype, 'clientWidth', desc))

  for (const w of [400, 1200]) {
    it(`draws a 22 h window at ${w} px with apart time labels and the axis title above`, async () => {
      Object.defineProperty(Element.prototype, 'clientWidth', {
        configurable: true,
        get: () => w,
      })
      const el = document.createElement('div')
      const app = createApp(LiveCurveCard, { live: longWatch(), now: mid })
      app.mount(el)
      await nextTick()
      const svg = el.querySelector('svg')!
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${w} 260`)
      const xs = [...el.querySelectorAll('text.xt')].map((t) => Number(t.getAttribute('x')))
      expect(xs.length).toBeGreaterThan(3)
      expectApart(xs, w)
      const svgText = [...svg.querySelectorAll('text')].map((t) => t.textContent?.trim())
      expect(svgText).not.toContain('mag')
      expect(svgText).not.toContain('fainter')
      expect(el.querySelector('.chart > div')?.textContent).toBe(
        'Change in brightness, mag, fainter down',
      )
      app.unmount()
    })
  }
})
