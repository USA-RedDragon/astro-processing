import { describe, expect, it } from 'vitest'
import type { CommandRecord } from '@/scheduler/api/commands'
import type { PlanBlock, Preview, SchedProject, TonightSub } from '@/scheduler/api/scheduler'
import {
  abortBlockedReason,
  abortPayload,
  angleText,
  addChange,
  decDm,
  editsFor,
  filterColor,
  filterName,
  filterShort,
  historyBadge,
  median,
  nightRange,
  pausePayload,
  leftOutGroups,
  leftOutKind,
  leftOutView,
  noChanceTonight,
  pickTable,
  planDiff,
  planSummary,
  raHms,
  runFilters,
  runs,
  scale,
  signedHours,
  skipPayload,
  stepDecimals,
  scorePair,
  subChart,
  ticksBefore,
  fitLabel,
  weightText,
  twilightBands,
  undoState,
  valueChoices,
  valueLabel,
  MINUTE_CHOICES,
} from '@/scheduler/plan'

const t = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 10, h, m)).toISOString()

const block = (p: Partial<PlanBlock>): PlanBlock => ({ start: t(1), end: t(2), wait: false, ...p })

const plan: Preview = {
  start: t(0),
  end: t(12),
  twilight: {
    sunset: t(0),
    civil_dusk: t(0, 30),
    nautical_dusk: t(1),
    astronomical_dusk: t(1, 30),
    astronomical_dawn: t(10),
    nautical_dawn: t(10, 30),
    civil_dawn: t(11),
    sunrise: t(11, 30),
  },
  blocks: [
    block({
      start: t(1, 30),
      end: t(2, 30),
      target_id: 1,
      target_name: 'A',
      project_id: 9,
      project_name: 'P',
      filter: 'Ha',
      exposure_seconds: 300,
      count: 12,
      picked: true,
      scores: [
        { rule: 'Priority', weight: 0.5, score: 1 },
        { rule: 'Setting', weight: 0.5, score: 0.4 },
      ],
      total: 0.7,
      runner_up: { target_name: 'B', total: 0.6 },
    }),
    block({
      start: t(2, 30),
      end: t(4),
      target_id: 1,
      target_name: 'A',
      project_id: 9,
      filter: 'OIII',
      exposure_seconds: 300,
      count: 18,
      reason: 'sets',
    }),
    block({ start: t(4), end: t(4, 30), wait: true }),
    block({
      start: t(4, 30),
      end: t(9),
      target_id: 2,
      target_name: 'B',
      project_id: 10,
      filter: 'L',
      exposure_seconds: 120,
      count: 100,
      picked: true,
      scores: [
        { rule: 'Priority', weight: 0.5, score: 0.5 },
        { rule: 'Mosaic', weight: 0, score: 0 },
      ],
      total: 0.25,
      reason: 'complete',
    }),
  ],
}

describe('filters', () => {
  it('names and colours filters', () => {
    expect(filterName('Ha')).toBe('H-a')
    expect(filterName('O-III')).toBe('O-III')
    expect(filterName('L')).toBe('Luminance')
    expect(filterName('Weird')).toBe('Weird')
    expect(
      ['Luminance', 'Red', 'Green', 'Blue', 'H-a', 'O-III', 'S-II', 'Weird'].map(filterShort),
    ).toEqual(['L', 'R', 'G', 'B', 'Ha', 'OIII', 'SII', 'Weird'])
    expect(filterColor('SII')).toBe('var(--sii)')
    expect(filterColor('R')).toBe('var(--red)')
    expect(filterColor('Weird')).toBe('var(--muted-foreground)')
  })
})

describe('coordinates and numbers', () => {
  it('formats RA, Dec and durations', () => {
    expect(raHms(20.04)).toBe('20h 02m 24s')
    expect(decDm(35.98)).toBe('+35° 59′')
    expect(decDm(-5.5)).toBe('−05° 30′')
    expect(signedHours(4320)).toBe('+1.2 h')
    expect(signedHours(-1800)).toBe('−0.5 h')
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('angles', () => {
  it('wraps angles that round up to a full turn', () => {
    expect(angleText(359.95123)).toBe('0.0°')
    expect(angleText(359.94)).toBe('359.9°')
    expect(angleText(-0.04)).toBe('0.0°')
    expect(angleText(-90)).toBe('270.0°')
    expect(angleText(359.7, 0)).toBe('0°')
    expect(angleText(12.34)).toBe('12.3°')
  })
})

describe('runs', () => {
  it('merges consecutive blocks of a target and keeps the pick', () => {
    const r = runs(plan.blocks)
    expect(r).toHaveLength(3)
    expect(r[0].target_name).toBe('A')
    expect(r[0].subs).toBe(30)
    expect(r[0].reason).toBe('sets')
    expect(r[0].pick?.total).toBe(0.7)
    expect(runFilters(r[0])).toBe('H-a 300 s · O-III 300 s')
    expect(r[1].wait).toBe(true)
  })
})

describe('summary and pick table', () => {
  it('summarises the night', () => {
    const s = planSummary(plan)
    expect(s.darkSeconds).toBe(8.5 * 3600)
    expect(s.targets).toBe(2)
    expect(s.projects).toBe(2)
    expect(s.subs).toBe(130)
    expect(s.waits).toBe(1)
    expect(s.waitSeconds).toBe(1800)
    expect(s.start).toBe(Date.parse(t(0)))
    expect(s.end).toBe(Date.parse(t(12)))
    expect(s.filters.reduce((a, f) => a + f.subs, 0)).toBe(130)
    expect(s.filters[0]).toEqual({ name: 'H-a', subs: 12, color: 'var(--ha)' })
  })

  it('builds rule columns from the scores present', () => {
    const { columns, rows } = pickTable(plan.blocks)
    expect(columns.map((c) => c.rule)).toEqual(['Priority', 'Setting', 'Mosaic'])
    expect(rows).toHaveLength(2)
    expect(rows[0].scores.Setting).toBeCloseTo(0.2)
    expect(rows[0].runner).toBe('B · 0.60')
    expect(rows[0].ends).toMatch(/^Sets at /)
    expect(rows[1].runner).toBe('—')
  })

  it('shows rule weights as the multiplier the totals use', () => {
    expect(weightText(0.75)).toBe('0.75')
    expect(weightText(0.6666667)).toBe('0.67')
    expect(weightText(1)).toBe('1')
    expect(weightText(0)).toBe('0')
  })

  it('fits bar labels inside the bar or drops them', () => {
    expect(fitLabel('Lowers Nebula', 38, 11)).toBe('')
    expect(fitLabel('IC 1318 Panel 15', 140, 13)).toBe('IC 1318 Panel…')
    expect(fitLabel('Caldwell 14', 280, 13)).toBe('Caldwell 14')
  })
})

describe('timeline geometry', () => {
  it('pads the night and lays out twilight bands', () => {
    const range = nightRange(plan)!
    expect(range[0]).toBe(Date.parse(t(0)) - 1800000)
    expect(range[1]).toBe(Date.parse(t(12)) + 1800000)
    const sc = scale(range[0], range[1], 0, 1000)
    const bands = twilightBands(plan.twilight, sc)
    expect(bands.map((b) => b.opacity)).toEqual([0.45, 0.32, 0.22, 0.1, 0.1, 0.22, 0.32, 0.45])
    expect(bands[0].x).toBe(0)
    expect(bands[bands.length - 1].x + bands[bands.length - 1].w).toBeCloseTo(1000)
  })

  it('skips missing twilight times', () => {
    const sc = scale(0, 10, 0, 10)
    expect(twilightBands({ sunset: null }, sc)).toEqual([{ x: 0, w: 10, opacity: 0.45 }])
    expect(nightRange({})).toBeNull()
  })
})

describe('what if', () => {
  const projects: SchedProject[] = [
    {
      id: 9,
      guid: 'g9',
      name: 'P',
      state: 1,
      priority: 1,
      minimumtime: 30,
      isMosaic: false,
      targets: [],
    },
    {
      id: 10,
      guid: 'g10',
      name: 'Q',
      state: 1,
      priority: 2,
      minimumtime: 60,
      isMosaic: true,
      targets: [],
    },
  ]

  it('replaces a change to the same field and groups edits per project', () => {
    let list = addChange([], { projectId: 9, field: 'priority', value: 2 })
    list = addChange(list, { projectId: 9, field: 'priority', value: 0 })
    list = addChange(list, { projectId: 9, field: 'minimumtime', value: 60 })
    list = addChange(list, { projectId: 10, field: 'state', value: 2 })
    expect(list).toHaveLength(3)
    const edits = editsFor(list, projects)
    expect(edits).toHaveLength(2)
    expect(edits[0]).toEqual({
      entity: 'project',
      id: 9,
      guid: 'g9',
      name: 'P',
      changes: [
        { field: 'priority', before: 1, after: 0 },
        { field: 'minimumtime', before: 30, after: 60 },
      ],
    })
    expect(edits[1].changes).toEqual([{ field: 'state', before: 1, after: 2 }])
    expect(valueChoices('priority', 1)).toEqual([2, 0])
    expect(valueChoices('minimumtime', null)).toEqual(MINUTE_CHOICES)
    expect(valueLabel('minimumtime', null)).toBe('not set')
  })

  it('diffs time per target', () => {
    const whatIf: Preview = {
      blocks: [block({ start: t(1, 30), end: t(9), target_id: 2, target_name: 'B' })],
    }
    const d = planDiff(plan, whatIf)
    expect(d.map((x) => [x.name, x.change])).toEqual([
      ['B', '+3.0 h'],
      ['A', 'no time'],
    ])
    expect(planDiff(plan, plan)).toEqual([
      { name: 'A, B', before: 0, after: 0, change: 'no change' },
    ])
  })
})

describe('sub chart', () => {
  const sub = (
    h: number,
    target: number,
    hfr: number,
    extra: Partial<TonightSub> = {},
  ): TonightSub => ({
    id: h,
    time: t(h),
    project_id: 1,
    project: 'P',
    target_id: target,
    target: 'T' + target,
    filter: 'R',
    hfr,
    grading: 'accepted',
    ...extra,
  })

  it('breaks the line at target changes, marks rejects and draws medians', () => {
    const subs = [
      sub(1, 1, 2),
      sub(2, 1, 4, { verdict: 'low_score' }),
      sub(3, 1, 2.2),
      sub(4, 2, 2.5),
      sub(5, 2, 2.7),
    ]
    const c = subChart(subs, (s) => s.hfr, 2, Date.parse(t(0)), Date.parse(t(6)), {
      x0: 56,
      x1: 1180,
      yTop: 20,
      yBottom: 190,
    })
    expect(c.paths).toHaveLength(2)
    expect(c.paths[1].current).toBe(true)
    expect(c.points.filter((p) => p.rejected)).toHaveLength(1)
    expect(c.changes).toEqual([{ x: expect.any(Number), label: 'T2' }])
    expect(c.medians.find((m) => m.current)?.value).toBeCloseTo(2.6)
    expect(c.medians.find((m) => !m.current)?.value).toBeCloseTo(2.1)
    expect(c.yTicks.length).toBeGreaterThan(2)
    expect(c.xTicks.map((x) => x.label)).toHaveLength(5)
  })

  it('labels quarter steps with their exact value', () => {
    const subs = [sub(1, 1, 1.5), sub(2, 1, 2.5)]
    const c = subChart(subs, (s) => s.hfr, 1, Date.parse(t(0)), Date.parse(t(3)), {
      x0: 0,
      x1: 100,
      yTop: 0,
      yBottom: 100,
    })
    expect(c.yTicks.map((y) => y.label)).toEqual(['1.50', '1.75', '2.00', '2.25', '2.50'])
    expect(stepDecimals(0.25)).toBe(2)
    expect(stepDecimals(2.5)).toBe(1)
    expect(stepDecimals(5)).toBe(0)
    expect(stepDecimals(0.05)).toBe(2)
  })

  it('drops x ticks that would sit under the now label', () => {
    const ticks = [
      { pos: 900, label: '01:00' },
      { pos: 1140, label: '02:00' },
    ]
    expect(ticksBefore(ticks, 1180 - 75).map((t) => t.label)).toEqual(['01:00'])
  })
})

describe('commands', () => {
  it('builds skip and pause payloads', () => {
    const target = { project_id: 5, project_name: 'Sadr', target_id: 13, target_name: 'P15' }
    expect(skipPayload(target, false, 60)).toEqual({
      scope: 'target',
      target_id: 13,
      target_name: 'P15',
      project_id: 5,
      project_name: 'Sadr',
      minutes: 60,
    })
    expect(skipPayload(target, true, 0).scope).toBe('project')
    expect(pausePayload('park', 'after', '')).toEqual({ mount: 'park', resume_after_minutes: 30 })
    expect(pausePayload('track', 'at', '03:00')).toEqual({ mount: 'track', resume_at: '03:00' })
    expect(pausePayload('track', 'manual', '03:00')).toEqual({ mount: 'track' })
  })

  it('labels history entries', () => {
    const rec = (p: Partial<CommandRecord>): CommandRecord => ({
      id: 'abcdef123456',
      kind: 'project.edit',
      payload: {},
      author: 'web',
      title: 'x',
      category: 'priority',
      destination: 'observatory',
      diffs: [],
      objects: [],
      status: 'applied',
      attempts: 0,
      created_at: t(1),
      updated_at: t(1),
      ...p,
    })
    expect(historyBadge(rec({ status: 'queued' }), '').tone).toBe('warn')
    expect(historyBadge(rec({ status: 'pending' }), 'at 01:52').label).toBe('Applies at 01:52')
    expect(historyBadge(rec({ status: 'pending' }), 'after the next exposure ends').label).toBe(
      'Applies after the next exposure ends',
    )
    expect(historyBadge(rec({ status: 'pending' }), '').label).toBe('Applies at the next plan')
    expect(undoState(rec({ status: 'pending' }))).toMatchObject({
      label: 'Cancel',
      cancel: true,
      enabled: true,
    })
    expect(undoState(rec({ undone_by: 'ffff00001111' }))).toMatchObject({
      label: 'Undone',
      enabled: false,
      note: 'Undone by change #ffff0000',
    })
    expect(undoState(rec({ status: 'conflict' })).enabled).toBe(false)
    expect(
      undoState(
        rec({
          status: 'cancelled',
          message: 'Withdrawn from the database queue before the scheduler applied it.',
        }),
      ),
    ).toMatchObject({
      enabled: false,
      note: 'Withdrawn from the database queue before the scheduler applied it.',
    })
    expect(undoState(rec({ status: 'cancelled' })).note).toBe(
      'Cancelled; the server recorded no reason',
    )
    expect(undoState(rec({ kind: 'exposure.abort', category: 'control' }))).toMatchObject({
      enabled: false,
      cancel: false,
      note: 'An aborted exposure cannot be brought back',
    })
    expect(undoState(rec({ kind: 'scheduler.replan', category: 'control' })).enabled).toBe(false)
    expect(undoState(rec({ kind: 'exposure.abort', status: 'failed' })).enabled).toBe(false)
  })

  it('builds an abort payload for the exposure on screen', () => {
    const started = '2026-10-10T06:45:00.1234567Z'
    expect(abortPayload({ plan_id: 40, started_at: started, filter: 'Ha' }, 'Panel 2')).toEqual({
      plan_id: 40,
      started_at: started,
      target_name: 'Panel 2',
      filter: 'Ha',
    })
    expect(abortPayload({ plan_id: 40, started_at: started, filter: '' })).toEqual({
      plan_id: 40,
      started_at: started,
    })
    expect(abortPayload({ started_at: started, filter: 'Ha' }, 'Panel 2')).toBeNull()
    expect(abortPayload({ plan_id: 40, filter: 'Ha' }, 'Panel 2')).toBeNull()
    expect(abortPayload(null, 'Panel 2')).toBeNull()
  })

  it('says why Abort now is off, including on a sync client', () => {
    const started = '2026-10-10T06:45:00.1234567Z'
    expect(abortBlockedReason({ plan_id: 40, started_at: started })).toBe('')
    expect(abortBlockedReason(null)).toBe('No exposure is running.')
    expect(abortBlockedReason({ started_at: started })).toBe(
      'The scheduler did not report which exposure is running.',
    )
    const sync =
      'This PC is a sync client. Its exposures are started by the sync server and cannot be aborted from the web.'
    expect(abortBlockedReason({ plan_id: 40, started_at: started, abort_blocked: sync })).toBe(sync)
  })
})

describe('left out', () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 10, h, m)).toISOString()
  it('names the closest score loss with both totals', () => {
    const v = leftOutView({
      project_name: 'Barnard',
      target_name: "Barnard's E",
      reason: 'lower score',
      at: at(3),
      until: at(3, 30),
      winner_name: 'M31',
      winner_total: 0.81,
      total: 0.72,
      reasons: [
        { reason: 'not yet visible', from: at(1), until: at(3), minutes: 120 },
        { reason: 'lower score', from: at(3), until: at(4), minutes: 60 },
      ],
    })
    expect(v.name).toBe("Barnard · Barnard's E")
    expect(v.why).toMatch(/^Outscored by M31 \(0\.81 vs 0\.72\) at \d\d:\d\d C[DS]T$/)
    expect(v.other).toMatch(/^not yet visible \d\d:\d\d–\d\d:\d\d C[DS]T$/)
  })
  it('adds decimals until near-tied scores differ', () => {
    const v = leftOutView({
      target_name: 'IC 1318 Panel 13',
      reason: 'lower score',
      at: at(3),
      winner_name: 'IC 1318 Panel 8',
      winner_total: 1.808990623536353,
      total: 1.8084697902030198,
    })
    expect(v.why).toMatch(/^Outscored by IC 1318 Panel 8 \(1\.809 vs 1\.808\) at /)
    expect(scorePair(0.7268, 0.7262)).toEqual(['0.727', '0.726'])
    expect(scorePair(0.9, 0.5)).toEqual(['0.90', '0.50'])
    expect(scorePair(1, 1)).toEqual(['1.0000', '1.0000'])
  })
  it('labels a reason seen only after the night', () => {
    const v = leftOutView({ target_name: 'M33', reason: 'not visible', at: at(11), after_night: true })
    expect(v.why).toMatch(/^Not visible at \d\d:\d\d C[DS]T, the planner's last pass after the night$/)
    expect(v.other).toBe('')
  })
  it('gives the span of the main reason', () => {
    const v = leftOutView({ target_name: 'NGC 7000', reason: 'moon avoidance', at: at(2), until: at(6) })
    expect(v.why).toMatch(/^Moon avoidance, \d\d:\d\d–\d\d:\d\d C[DS]T$/)
  })
  it('maps every planner reason to a kind', () => {
    expect(leftOutKind('lower score')).toBe('outscored')
    expect(leftOutKind('not yet visible')).toBe('later')
    expect(leftOutKind('max altitude')).toBe('later')
    expect(leftOutKind('not visible')).toBe('hidden')
    expect(leftOutKind('never rises at location')).toBe('hidden')
    expect(leftOutKind('all exposure plans rejected for twilight')).toBe('conditions')
    expect(leftOutKind('complete')).toBe('complete')
    expect(leftOutKind('exposure ends after the sequence ends imaging')).toBe('other')
    expect(leftOutKind(undefined)).toBe('other')
  })
  it('counts only a target with no visible window at any pass as not visible tonight', () => {
    const nv = { reason: 'not visible', from: at(1), until: at(11), minutes: 600 }
    expect(noChanceTonight({ reason: 'not visible', reasons: [nv] })).toBe(true)
    expect(
      noChanceTonight({
        reason: 'not yet visible',
        reasons: [
          { reason: 'not yet visible', from: at(1), until: at(10), minutes: 540 },
          { reason: 'not visible', from: at(10), until: at(11), minutes: 60 },
        ],
      }),
    ).toBe(false)
    expect(
      noChanceTonight({
        reason: 'lower score',
        reasons: [{ reason: 'lower score', from: at(1), until: at(2), minutes: 60 }, nv],
      }),
    ).toBe(false)
    expect(noChanceTonight({ reason: 'not visible', at: at(11), after_night: true })).toBe(false)
  })
  it('splits never-visible targets out and puts the closest score losses first', () => {
    const nv = [{ reason: 'not visible', from: at(1), until: at(11), minutes: 600 }]
    const g = leftOutGroups([
      { target_id: 1, target_name: 'M 13', reason: 'not visible', at: at(1), until: at(11), reasons: nv },
      { target_id: 2, target_name: 'Orion', reason: 'complete', at: at(1), until: at(11) },
      { target_id: 3, target_name: 'M 46', reason: 'not yet visible', at: at(1), until: at(10) },
      { target_id: 4, target_name: 'M 39', reason: 'lower score', at: at(3), total: 1.65, winner_total: 1.81, winner_name: 'IC 1318' },
      { target_id: 5, target_name: 'M 52', reason: 'lower score', at: at(2), total: 1.7, winner_total: 1.75, winner_name: 'IC 1318' },
      { target_id: 6, target_name: 'Leo Triplet', reason: 'not visible', at: at(1), until: at(11), reasons: nv },
    ])
    expect(g.main.map((v) => v.targetId)).toEqual([5, 4, 3, 2])
    expect(g.hidden.map((v) => v.name)).toEqual(['Leo Triplet', 'M 13'])
    expect(g.main[0].kind).toBe('outscored')
  })
})
