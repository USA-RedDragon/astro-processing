import { describe, expect, it } from 'vitest'
import type {
  Conditions,
  GraderPlanLimit,
  GraderSummary,
  MoonNight,
  Preview,
  SchedProject,
  TonightSub,
} from '@/scheduler/api/scheduler'
import {
  conditionPills,
  filterRuns,
  hfrLimitFor,
  latestImage,
  subTimes,
  rejectLineText,
  moonLine,
  moonPhaseText,
  mosaicBalance,
  nightSpan,
  noSourceText,
  phaseName,
  powerView,
  shutdownSteps,
  weatherRows,
} from '@/scheduler/nowtonight'

const t = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 10, h, m)).toISOString()

describe('conditions', () => {
  it('turns weather metrics into rows', () => {
    const rows = weatherRows({
      source: 'prometheus',
      connected: true,
      cloud_cover: 0,
      rain_rate: 0,
      wind_speed: 2,
      humidity: 58,
      temperature: 15,
      dew_point: 6,
      sky_brightness_lux: 0.02,
      pressure: 960.04,
    })
    expect(rows.map((r) => r.label)).toEqual([
      'Cloud cover',
      'Rain',
      'Wind',
      'Humidity',
      'Dew point gap',
      'Air',
      'Sky brightness',
      'Pressure',
    ])
    expect(rows[0].value).toBe('0%')
    expect(rows[6].value).toBe('0.02 lux')
    expect(rows[7].value).toBe('960 hPa')
    expect(rows[2].value).toBe('7 km/h')
    expect(rows[4].value).toBe('9 °C')
    expect(weatherRows({ source: 'prometheus', connected: false, humidity: 50 })).toEqual([])
    expect(weatherRows({ source: 'none' })).toEqual([])
  })

  it('explains a missing source', () => {
    expect(noSourceText({ source: 'none' }, 'weather')).toBe('No data source for weather.')
    expect(noSourceText({ source: 'error', error: 'timeout' }, 'UPS')).toBe(
      'The UPS source did not answer: timeout.',
    )
  })

  it('shows the power state, input voltage, on-battery history and runtime', () => {
    expect(powerView({ source: 'none', on_battery: false, low_battery: false })).toBeNull()
    const on = powerView({
      source: 'prometheus',
      on_battery: false,
      low_battery: false,
      flags: ['OL'],
      charge: 100,
      model: 'CyberPower EC450G',
      runtime_seconds: 4300,
      input_voltage: 120,
      battery_history_from: '2026-10-08T12:59:45Z',
    })!
    expect(on.label).toBe('On line')
    expect(on.alert).toBe('')
    expect(on.runtime).toBe('1 h 12 min')
    expect(on.voltage).toBe('120 V')
    expect(on.onBattery).toBe('No')
    expect(on.onBatteryNote).toBe('none recorded since Thu 8 Oct')
    const was = powerView({
      source: 'prometheus',
      on_battery: false,
      flags: ['OL'],
      last_on_battery: '2026-10-09T08:10:00Z',
    })!
    expect(was.onBatteryNote).toBe('last Fri 9 Oct 03:10 CDT')
    expect(was.voltage).toBe('not reported')
    expect(was.runtime).toBe('not reported')
    const ob = powerView(
      {
        source: 'prometheus',
        on_battery: true,
        low_battery: false,
        flags: ['OB'],
        charge: 90,
        on_battery_seconds: 23,
        input_voltage: 0,
      },
      '2026-10-11T08:00:23Z',
    )!
    expect(ob.label).toBe('On battery')
    expect(ob.alert).toBe('On battery since 03:00 CDT (23 s) · shutdown in about 37 s')
    expect(ob.onBattery).toBe('Yes')
    expect(ob.onBatteryNote).toBe('since 03:00 CDT')
    expect(ob.voltage).toBe('0 V')
    const late = powerView(
      { source: 'prometheus', on_battery: true, on_battery_seconds: 95 },
      t(1),
    )!
    expect(late.alert).toBe('On battery since 19:58 CDT (95 s) · shutdown due')
  })

  it('builds the shutdown chain from the UPS low-battery levels', () => {
    const steps = shutdownSteps({ source: 'prometheus', charge_low: 40, runtime_low_seconds: 300 })
    expect(steps.map((s) => `${s.when}: ${s.what}`)).toEqual([
      "5 s on battery: NINA's safety monitor turns unsafe",
      '60 s on battery, or low battery at 40% charge or 5 min runtime: Shutdown starts',
      ': NINA parks the mount',
      ': Powerbox off: camera, rotator, flat panel, mount and dew heaters',
      ': Windows shuts the PC down',
    ])
    expect(shutdownSteps({ source: 'prometheus' })[1].when).toBe(
      '60 s on battery, or low battery at level not reported',
    )
  })

  it('builds the sync, mount and safety pills', () => {
    const c: Conditions = {
      at: t(1),
      weather: { source: 'none' },
      safety: { source: 'prometheus', connected: true, safe: false },
      mount: { source: 'prometheus', connected: true, tracking: true, parked: false },
      power: { source: 'none', on_battery: false, low_battery: false },
      sync: { source: 'symmetricds', node: 'observatory', lag_seconds: 9, errors: 0 },
    }
    expect(conditionPills(c).map((p) => `${p.label} ${p.value}`)).toEqual([
      'Sync lag 9 s',
      'Mount tracking',
      'Safety monitor unsafe',
    ])
    expect(conditionPills(null).map((p) => p.value)).toEqual([
      'no data source',
      'no data source',
      'no data source',
    ])
    expect(
      conditionPills({ ...c, sync: { source: 'error', error: 'permission denied', errors: 0 } })[0]
        .value,
    ).toBe('no access')
  })
})

describe('moon', () => {
  const m: MoonNight = {
    samples: [
      { t: t(1), alt: -20 },
      { t: t(6), alt: -5 },
      { t: t(11), alt: 10 },
    ],
    illumination: 0.01,
    age: 29.3,
    waxing: false,
    rises: [t(9)],
    sets: [],
    next_new: t(20),
    next_full: '2026-10-25T00:00:00Z',
  }
  it('describes rise and set inside the night', () => {
    expect(moonLine(m, Date.parse(t(1)), Date.parse(t(11)))).toBe('Moon 1%, rises 04:00 CDT.')
    expect(moonLine(m, Date.parse(t(1)), Date.parse(t(7)))).toBe(
      'Moon 1%, below the horizon all night.',
    )
  })
  it('names the phase', () => {
    expect(phaseName(7.4)).toBe('first quarter')
    expect(phaseName(25)).toBe('waning crescent')
    expect(moonPhaseText(m)).toBe('1% lit · new moon Sat 10 Oct')
    expect(moonPhaseText({ ...m, age: 25, illumination: 0.2 })).toBe(
      '20% lit · waning crescent · new moon Sat 10 Oct',
    )
  })
  it('labels the night', () => {
    expect(nightSpan(new Date(t(17)))).toBe('10–11 Oct')
    expect(nightSpan(new Date(Date.UTC(2026, 9, 31, 17)))).toBe('31 Oct–1 Nov')
  })
})

describe('reject line', () => {
  const subs = [
    { target_id: 5, filter: 'Red', time: t(2) },
    { target_id: 5, filter: 'Red', time: t(2, 10) },
    { target_id: 5, filter: 'H-a', time: t(2, 20) },
    { target_id: 7, filter: 'Red', time: t(2, 30) },
    { target_id: 5, filter: 'Red', time: t(2, 40) },
  ] as TonightSub[]
  const hfr = {
    project_grading: true,
    enabled: true,
    sigma_factor: 4,
    accept_improvement: true,
    max_sample_size: 10,
    delay_threshold_percent: 0,
    mode: 'immediate' as const,
  }
  const plan = (
    id: number,
    filter: string,
    extra: Partial<GraderPlanLimit> = {},
  ): GraderPlanLimit => ({
    plan_id: id,
    filter,
    exposure_seconds: 300,
    state: 'limit',
    acquired: 60,
    matching: 52,
    samples: 9,
    mean: 1.8,
    sd: 0.07,
    upper: 2.08,
    reject_above: 2.08,
    population_rule: 'the 9 newest of 52 subs',
    ...extra,
  })
  const grader = (extra: Partial<GraderSummary> = {}): GraderSummary => ({
    state: 'ok',
    targets: [
      {
        target_id: 5,
        source: 'plugin',
        fetched_at: t(3),
        report: {
          project_id: 1,
          target_id: 5,
          target_name: 'M31',
          hfr,
          plans: [plan(1, 'Red', { reject_above: 2.4 }), plan(2, 'H-a', { reject_above: 2.2 })],
        },
      },
    ],
    ...extra,
  })
  it('uses the current plan, else the current filter, else the last sub', () => {
    expect(hfrLimitFor(grader(), subs, 5).line?.limit).toBe(2.4)
    expect(hfrLimitFor(grader(), subs, 5, 'H-a').line?.limit).toBe(2.2)
    expect(hfrLimitFor(grader(), subs, 5, 'Red', 2).line?.limit).toBe(2.2)
    expect(hfrLimitFor(grader(), subs, 6).line).toBeNull()
    expect(hfrLimitFor(undefined, subs, 5)).toEqual({ line: null, note: '' })
  })
  it('says why there is no line', () => {
    expect(
      hfrLimitFor(grader({ state: 'unsupported', version: '5.8.2.202', targets: [] }), subs, 5)
        .note,
    ).toBe('Grader limit not reported by this plugin version (5.8.2.202).')
    expect(hfrLimitFor(grader({ state: 'unreachable', targets: [] }), subs, 5).note).toMatch(
      /^Plugin unreachable/,
    )
    const few = grader()
    few.targets[0].report!.plans[0] = plan(1, 'Red', {
      state: 'too_few_samples',
      samples: 2,
      reject_above: undefined,
    })
    expect(hfrLimitFor(few, subs, 5, 'Red').note).toBe(
      'The grader has 2 matching Red subs to compare against and accepts every sub until it has 3.',
    )
  })
  it('describes the plugin limit and its basis', () => {
    const line = hfrLimitFor(grader(), subs, 5, 'H-a').line!
    expect(rejectLineText(line)).toBe(
      "Grader's HFR limit for H-a: mean 1.80 px + 4σ (σ 0.070 px) of the 9 newest of 52 subs; any HFR below the mean is accepted.",
    )
    const old = grader()
    old.targets[0].source = 'last_known'
    old.targets[0].error = 'plugin unreachable'
    expect(rejectLineText(hfrLimitFor(old, subs, 5, 'H-a').line!)).toMatch(
      /Plugin unreachable: last known from \d\d:\d\d C[DS]T \(plugin unreachable\)\.$/,
    )
  })
  it('finds the runs of one filter', () => {
    expect(filterRuns(subs, 5, 'Red')).toEqual([
      [Date.parse(t(2)), Date.parse(t(2, 10))],
      [Date.parse(t(2, 40)), Date.parse(t(2, 40))],
    ])
  })
})

describe('mosaic balance', () => {
  const panels = [1, 2, 3, 4].map((i) => ({
    id: i,
    guid: 'g' + i,
    name: 'P' + i,
    active: true,
    ra: 0,
    dec: 0,
    rotation: 0,
    plans: [],
  }))
  const projects: SchedProject[] = [
    {
      id: 9,
      guid: 'm9',
      name: 'Sadr',
      state: 1,
      priority: 1,
      minimumtime: 30,
      isMosaic: true,
      targets: panels,
    },
  ]
  const block = (id: number, h0: number, h1: number, weight = 0) => ({
    start: t(h0),
    end: t(h1),
    wait: false,
    project_id: 9,
    target_id: id,
    target_name: 'P' + id,
    scores: [{ rule: 'Mosaic Completion', weight, score: 0 }],
  })
  const current: Preview = { blocks: [block(1, 1, 3), block(2, 3, 5)] }
  it('warns when one panel takes the night', () => {
    const whatIf: Preview = { blocks: [block(1, 1, 7)] }
    const w = mosaicBalance(current, whatIf, projects)
    expect(w).toHaveLength(1)
    expect(w[0].text).toBe(
      'One Sadr panel would get 6.0 h while 3 of its 4 panels get none. Panel balancing is off for this mosaic (its rule weight is 0).',
    )
  })
  it('stays quiet when time is spread', () => {
    expect(
      mosaicBalance(
        current,
        { blocks: [block(1, 1, 3), block(2, 3, 5), block(3, 5, 7)] },
        projects,
      ),
    ).toEqual([])
    expect(mosaicBalance(current, null, projects)).toEqual([])
  })
  it('drops the balancing note when a weight is set', () => {
    const w = mosaicBalance(current, { blocks: [block(1, 1, 7, 0.75)] }, projects)
    expect(w[0].balancingOff).toBe(false)
  })
})

describe('latest sub image', () => {
  const sub = (
    id: number,
    h: number,
    m: number,
    filter: string,
    extra: Partial<TonightSub> = {},
  ): TonightSub => ({
    id,
    time: t(h, m),
    project_id: 40,
    project: 'Garlic Nebula',
    target_id: 84,
    target: 'Garlic Nebula',
    filter,
    grading: 'accepted',
    ...extra,
  })
  const older = sub(4, 5, 7, 'O-III', { indexed: true, preview_url: 'https://x/older.jpg' })

  it('shows the newest sub when it has a preview', () => {
    const latest = sub(5, 5, 18, 'H-a', { indexed: true, preview_url: 'https://x/new.jpg' })
    expect(
      latestImage({ since: t(0), subs: [older, latest], latest, latest_preview: latest }),
    ).toEqual({ sub: latest, note: '' })
  })

  it('labels an older preview with its own time and says what is pending', () => {
    const latest = sub(5, 5, 18, 'H-a')
    const got = latestImage({ since: t(0), subs: [older, latest], latest, latest_preview: older })
    expect(got?.sub).toBe(older)
    expect(got?.note).toBe(
      'Showing the 00:07 CDT O-III sub of Garlic Nebula, the newest with a preview. The 00:18 CDT H-a sub has not reached the stacker yet.',
    )
    const indexed = { ...latest, indexed: true, target: 'Pelican Nebula' }
    expect(
      latestImage({ since: t(0), subs: [], latest: indexed, latest_preview: older })?.note,
    ).toContain(
      'The 00:18 CDT H-a sub of Pelican Nebula is in the stacker, but its preview is not made yet.',
    )
  })

  it('shows nothing when no sub of any night has a preview', () => {
    const latest = sub(5, 5, 18, 'H-a')
    expect(latestImage({ since: t(0), subs: [latest], latest })).toBeNull()
    expect(latestImage({ since: t(0), subs: [] })).toBeNull()
    expect(latestImage(null)).toBeNull()
  })

  it('dates a preview from an earlier night', () => {
    const latest = sub(5, 5, 18, 'H-a')
    const lastNight = { ...older, id: 0, time: new Date(Date.UTC(2026, 9, 9, 8, 30)).toISOString() }
    expect(
      latestImage({ since: t(0), subs: [latest], latest, latest_preview: lastNight })?.note,
    ).toBe(
      'Showing the Fri 9 Oct 03:30 CDT O-III sub of Garlic Nebula, the newest with a preview. The 00:18 CDT H-a sub has not reached the stacker yet.',
    )
  })

  it('shows the newest preview before the first sub of the night', () => {
    const lastNight = { ...older, id: 0, time: new Date(Date.UTC(2026, 9, 9, 8, 30)).toISOString() }
    const got = latestImage({ since: t(0), subs: [], latest_preview: lastNight })
    expect(got?.sub).toBe(lastNight)
    expect(got?.note).toBe(
      'No subs yet tonight. Showing the Fri 9 Oct 03:30 CDT O-III sub of Garlic Nebula, the newest with a preview.',
    )
  })
})

describe('subTimes', () => {
  const base: TonightSub = {
    id: 1,
    time: '2026-10-11T09:13:16Z',
    project_id: 16,
    project: 'Double Cluster',
    target_id: 28,
    target: 'Caldwell 14',
    filter: 'Red',
    grading: 'pending',
  }

  it('shows the exposure span and the upload time, not the start as a save time', () => {
    expect(
      subTimes({
        ...base,
        exposure: 300,
        indexed: true,
        uploaded_at: '2026-10-11T09:18:37Z',
        processed_at: '2026-10-11T09:18:52Z',
      }),
    ).toBe('exposed 04:13–04:18 CDT · uploaded 04:18 CDT · graded 04:18 CDT')
  })

  it('says when the sub has not reached the stacker', () => {
    expect(subTimes({ ...base, exposure: 600 })).toBe(
      'exposed 04:13–04:23 CDT · not in the stacker yet',
    )
  })

  it('falls back to the start when the exposure length is unknown', () => {
    expect(subTimes({ ...base, indexed: true })).toBe('exposure started 04:13 CDT')
  })
})
