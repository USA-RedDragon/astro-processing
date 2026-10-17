import { describe, expect, it } from 'vitest'
import type {
  CalibrationStatus,
  Conditions,
  RecentCalibration,
  SchedulerStatus,
} from '@/scheduler/api/scheduler'
import type { DarkBacklog, DarkBacklogCombo } from '@/scheduler/api/darks'
import {
  CALIBRATION_PLUGIN_VERSION,
  NOT_MEASURED,
  calibBadge,
  calibCard,
  calibSteps,
  cameraPill,
  comboMap,
  coolChart,
  coolingView,
  darkFacts,
  dateOnly,
  doneView,
  flatFacts,
  flatRows,
  framesGrid,
  groupTaken,
  matchRun,
  missingView,
  ninaPill,
  outsideScheduler,
  pauseApplies,
  stopText,
  placementText,
  powerTrend,
  queueRows,
  reasonText,
  recentView,
  reportsCalibration,
  secText,
  setLabel,
  showCalibLower,
  stopNote,
  takenRows,
  tempText,
  unreportedView,
  versionAtLeast,
  whoNeeds,
} from '@/scheduler/nowcalib'

const t = (h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 9, 16, h, m, s)).toISOString()
const T = (h: number, m = 0) => Date.UTC(2026, 9, 16, h, m)

function conditions(over: Partial<Conditions> = {}): Conditions {
  return {
    at: t(2),
    weather: { source: 'prometheus', connected: true, temperature: 18.26 },
    safety: { source: 'prometheus', connected: true, safe: false },
    mount: { source: 'prometheus', connected: true },
    camera: {
      source: 'prometheus',
      connected: true,
      temperature: 7.04,
      target_temperature: 7,
      cooler_on: true,
      cooler_power: 36,
    },
    power: { source: 'prometheus' },
    sync: { source: 'symmetricds' },
    ...over,
  }
}

function status(over: Partial<SchedulerStatus> = {}): SchedulerStatus {
  return { reachable: 'online', version: '5.8.2.231', state: 'calibrating', ...over }
}

const darksCal: CalibrationStatus = {
  kind: 'darks',
  placement: 'while_unsafe',
  ambient: 18.4,
  sun_limit_at: t(12, 7),
  sun_limit_degrees: -8,
  set: {
    combo_key: '300|0|50|1|6',
    exposure: 300,
    gain: 0,
    offset: 50,
    binning: 1,
    set_temp: 6,
    frames_total: 25,
    frames_before: 5,
    frames_done: 17,
    index: 1,
    count: 3,
    ends_at: t(3, 33),
  },
  frame: { number: 18, seconds: 300, started_at: t(2, 49), ends_at: t(2, 54) },
  queue: [
    {
      kind: 'darks',
      combo_key: '300|0|50|1|6',
      exposure: 300,
      gain: 0,
      set_temp: 6,
      frames_total: 25,
      frames_have: 5,
      remaining: 20,
      status: 'taking',
    },
    {
      kind: 'darks',
      combo_key: '600|0|50|1|6',
      exposure: 600,
      gain: 0,
      set_temp: 6,
      frames_total: 25,
      frames_have: 0,
      remaining: 25,
      status: 'next',
      planned_start: t(3, 35),
      planned_end: t(7, 47),
      fit_frames: 25,
    },
    {
      kind: 'darks',
      combo_key: '600|0|50|1|4',
      exposure: 600,
      gain: 0,
      set_temp: 4,
      frames_total: 25,
      frames_have: 0,
      remaining: 25,
      status: 'next',
      planned_start: t(7, 49),
      planned_end: t(12, 1),
      fit_frames: 22,
    },
    {
      kind: 'darks',
      combo_key: '300|0|50|1|3',
      exposure: 300,
      gain: 0,
      set_temp: 3,
      frames_total: 25,
      frames_have: 0,
      remaining: 25,
      lights_scaled: 737,
      status: 'skipped',
      reason_code: 'sun',
      reason: 'a 300 s dark would end at 07:09:00',
      fit_frames: 0,
    },
    { kind: 'darks', combo_key: 'x', status: 'done' },
  ],
}

const combo = (over: Partial<DarkBacklogCombo>): DarkBacklogCombo => ({
  combo_key: 'k',
  priority: 1,
  exposure: 300,
  gain: 0,
  offset: 50,
  binning: 1,
  readout_mode: null,
  set_temp: 6,
  set_temps_covered: [5, 6, 7],
  frames_needed: 25,
  frames_have: 5,
  frames_rejected: 0,
  lights_blocked: 0,
  lights_scaled: 556,
  lights_thin: 1203,
  nights: 3,
  latest_night: '2026-09-18',
  newest_dark_at: null,
  basis: null,
  ...over,
})

describe('formatting', () => {
  it('writes temperatures with a real minus sign and trims whole degrees', () => {
    expect(tempText(-11.57)).toBe('−11.6 °C')
    expect(tempText(6)).toBe('6 °C')
    expect(tempText(-0.04)).toBe('0 °C')
    expect(tempText(undefined)).toBe('')
    expect(secText(300)).toBe('300 s')
    expect(secText(2.5)).toBe('2.5 s')
  })

  it('keeps a date-only night on its own day', () => {
    expect(dateOnly('2026-10-14')).toBe('Wed 14 Oct')
    expect(dateOnly('2026-10-14T00:00:00Z')).toBe('Wed 14 Oct')
  })

  it('labels dark, bias and flat sets', () => {
    expect(setLabel({ exposure: 300, set_temp: 6, gain: 0 }, 'darks')).toBe('300 s at 6 °C, gain 0')
    expect(setLabel({ gain: 100 }, 'bias')).toBe('Bias, gain 100')
    expect(setLabel({ kind: 'flats', filter: 'B', target_name: "Barnard's E", exposure: 5 })).toBe(
      "Blue, Barnard's E, 5 s",
    )
  })
})

describe('which card shows', () => {
  it('compares plugin versions', () => {
    expect(versionAtLeast('5.8.2.230', CALIBRATION_PLUGIN_VERSION)).toBe(false)
    expect(versionAtLeast('5.8.2.231', CALIBRATION_PLUGIN_VERSION)).toBe(true)
    expect(versionAtLeast('5.9', CALIBRATION_PLUGIN_VERSION)).toBe(true)
    expect(versionAtLeast(undefined, CALIBRATION_PLUGIN_VERSION)).toBeNull()
  })

  it('knows an older plugin sends no calibration block', () => {
    expect(reportsCalibration(status({ version: '5.8.2.230' }))).toBe(false)
    expect(reportsCalibration(status({ version: undefined, calibration: null }))).toBe(true)
    expect(reportsCalibration(status({ version: undefined }))).toBe(false)
  })

  it('maps the calibration kind to a card', () => {
    const c = conditions()
    expect(calibCard(status({ calibration: { kind: 'cooling' } }), c)).toBe('cooling')
    expect(calibCard(status({ calibration: { kind: 'darks' } }), c)).toBe('darks')
    expect(calibCard(status({ calibration: { kind: 'bias' } }), c)).toBe('darks')
    expect(calibCard(status({ calibration: { kind: 'flats' } }), c)).toBe('flats')
    expect(calibCard(status({ state: 'stopped', calibration: { kind: 'done' } }), c)).toBe('done')
  })

  it('keeps the imaging and waiting views when the scheduler runs', () => {
    const c = conditions()
    expect(calibCard(status({ state: 'imaging', calibration: { kind: 'darks' } }), c)).toBeNull()
    expect(calibCard(status({ state: 'waiting', calibration: { kind: 'done' } }), c)).toBeNull()
    expect(calibCard(status({ paused: true, calibration: { kind: 'darks' } }), c)).toBeNull()
    expect(calibCard(status({ state: 'stopped', calibration: null }), c)).toBeNull()
  })

  it('falls back for the older plugin when the roof is closed and the camera is busy', () => {
    const old = status({ version: '5.8.2.230', state: 'stopped' })
    expect(calibCard(old, conditions())).toBe('unreported')
    const safe = conditions({ safety: { source: 'prometheus', connected: true, safe: true } })
    expect(calibCard(old, safe)).toBeNull()
    const warm = conditions({
      camera: { source: 'prometheus', connected: true, cooler_on: false, cooler_power: 0 },
    })
    expect(calibCard(old, warm)).toBeNull()
    expect(calibCard(status({ calibration: undefined }), conditions())).toBe('unreported')
  })

  it('shows the lower calibration cards when calibrating or when the roof closes on an idle night', () => {
    const c = conditions()
    expect(showCalibLower('darks', status(), c)).toBe(true)
    expect(showCalibLower(null, status({ state: 'stopped' }), c)).toBe(true)
    expect(showCalibLower(null, status({ state: 'imaging' }), c)).toBe(false)
    const safe = conditions({ safety: { source: 'prometheus', connected: true, safe: true } })
    expect(showCalibLower(null, status({ state: 'stopped' }), safe)).toBe(false)
  })
})

describe('header and pills', () => {
  const c = conditions()
  it('names the activity with the roof state', () => {
    expect(calibBadge('cooling', { kind: 'cooling' }, c, T(1))).toEqual({
      label: 'Roof closed · cooling for darks',
      tone: 'warn',
    })
    expect(calibBadge('darks', { kind: 'darks' }, c, T(1))?.label).toBe(
      'Roof closed · taking darks',
    )
    expect(calibBadge('flats', { kind: 'flats' }, c, T(11, 43))?.label).toBe(
      'Morning · taking flats',
    )
    expect(calibBadge('done', { kind: 'done' }, c, T(10))?.label).toBe('Roof closed · waiting')
    expect(calibBadge('unreported', null, c, T(1))?.label).toBe('Roof closed · camera cold')
    expect(calibBadge(null, null, c, T(1))).toBeNull()
  })

  it('sets the NINA and camera pills', () => {
    expect(ninaPill('cooling', { kind: 'cooling' }, c)?.value).toBe('cooling for darks')
    expect(ninaPill('darks', { kind: 'darks' }, c)?.value).toBe('taking darks')
    expect(ninaPill('flats', { kind: 'flats' }, c)?.value).toBe('taking flats')
    expect(ninaPill('done', { kind: 'done' }, c)?.value).toBe('waiting to be safe')
    expect(ninaPill('unreported', null, c)).toBeNull()
    expect(cameraPill('cooling', { kind: 'cooling', cooling: { target: -11.57 } }, c)?.value).toBe(
      '7.0 °C, cooling to −11.6 °C',
    )
    expect(cameraPill(null, null, c)).toBeNull()
  })
})

describe('reasons and placement', () => {
  const cal = { ...darksCal }
  it('turns reason codes into plain sentences', () => {
    expect(reasonText({ reason_code: 'sun' }, cal)).toBe(
      'Does not fit before the sun reaches 8° below the horizon at 07:07.',
    )
    expect(reasonText({ reason_code: 'above_ambient', set_temp: 20 }, cal)).toBe(
      '20 °C is warmer than the air (18.4 °C), and the camera can only cool.',
    )
    expect(reasonText({ reason_code: 'cooler_capacity', set_temp: -19 }, cal)).toContain(
      'never cooled to −19 °C with the air at 18.4 °C',
    )
    expect(reasonText({ reason_code: 'mystery', reason: 'the plugin says so' }, cal)).toBe(
      'The plugin says so.',
    )
    expect(reasonText({ reason_code: '' }, cal)).toBe('No reason reported yet.')
  })

  it('explains each placement', () => {
    expect(placementText(cal)).toBe(
      'The roof is closed, so NINA takes darks in the meantime. If it turns safe, darks stop after this frame and imaging starts.',
    )
    expect(placementText({ ...cal, placement: 'before_wait' }, t(4, 30))).toBe(
      'NINA takes darks to fill the wait before the next target, until about 23:30.',
    )
    expect(placementText({ ...cal, placement: 'end_of_night' })).toBe(
      'Imaging is over for tonight, so NINA takes darks until the sun reaches 8° below the horizon, about 07:07.',
    )
    expect(
      placementText({
        kind: 'cooling',
        placement: 'while_unsafe',
        purpose: 'darks',
        cooling: { target: -11.57 },
      }),
    ).toBe(
      'The roof is closed, so NINA uses the time for darks. It cools the camera to −11.6 °C first.',
    )
    expect(
      placementText(
        {
          kind: 'flats',
          placement: 'flats',
          set: { frames_total: 30, session_date: '2026-10-14' },
        },
        null,
        { astronomical_dawn: t(11, 20) },
        T(11, 43),
      ),
    ).toBe(
      'Imaging ended at astronomical dawn, 06:20. NINA takes 30 panel flats for each filter and target imaged on the night of Wed 14 Oct.',
    )
    expect(stopNote(cal)).toBe(
      'Darks stop when it is safe to image again or when the sun reaches 8° below the horizon, about 07:07.',
    )
  })
})

describe('dark queue', () => {
  it('lists the run with times, lengths and cut sets', () => {
    const combos = comboMap({
      combos: [
        combo({
          combo_key: '600|0|50|1|6',
          targets: [{ name: 'Andromeda', lights: 40 }],
        }),
      ],
    } as DarkBacklog)
    const rows = queueRows(darksCal, combos)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual({
      at: 'now',
      what: '300 s at 6 °C, gain 0',
      note: '17 of 25 · 8 left',
      len: 'ends about 22:33',
      cut: false,
    })
    expect(rows[1]).toEqual({
      at: '22:35',
      what: '600 s at 6 °C, gain 0',
      note: '0 of 25 · Andromeda',
      len: 'about 4 h 12 min',
      cut: false,
    })
    expect(rows[2].cut).toBe(true)
    expect(rows[2].note).toContain('about 22 of 25 fit before the sun limit')
    expect(rows[3]).toMatchObject({ at: '', len: 'does not fit', cut: true })
    expect(rows[3].note).toBe('Does not fit before the sun reaches 8° below the horizon at 07:07.')
  })
})

describe('cooling', () => {
  const cal: CalibrationStatus = {
    kind: 'cooling',
    purpose: 'darks',
    placement: 'while_unsafe',
    cooling: {
      target: -11.57,
      from: 23.3,
      started_at: t(1, 8),
      ends_at: t(1, 44),
      rate_c_per_min: 1,
    },
    log: [
      { at: t(1, 7), text: 'Powerbox and electronics on.' },
      { at: t(1, 8), text: 'Cooling the camera to −11.6 °C.' },
    ],
    queue: [darksCal.queue![1]],
  }
  const history = [
    { t: t(1, 20), temperature: 12.9, setpoint: 13, cooler_power: 24 },
    { t: t(1, 23), temperature: 10, setpoint: 10, cooler_power: 30 },
    { t: t(1, 26), temperature: 7, setpoint: 7, cooler_power: 36 },
  ]

  it('shows sensor, target, power and time left', () => {
    const v = coolingView(cal, conditions(), history, T(1, 26))
    expect(v.headline).toBe('Cooling the camera to −11.6 °C')
    expect(v.facts.map((f) => [f.label, f.value, f.note])).toEqual([
      ['Sensor now', '7.0 °C', 'setpoint 7 °C, stepping down'],
      ['Target', '−11.6 °C', 'from 23.3 °C'],
      ['Cooler power', '36%', 'rising 2% a minute'],
      ['Time left', 'about 18 min', 'done about 20:44'],
    ])
    expect(v.bar?.pct).toBe(50)
  })

  it('says not measured yet without a reading', () => {
    const v = coolingView({ kind: 'cooling' }, null, null, T(1))
    expect(v.facts.every((f) => f.value === NOT_MEASURED)).toBe(true)
    expect(v.bar).toBeNull()
    expect(powerTrend([])).toBe('')
  })

  it('lists the log and the planned start of darks', () => {
    const s = calibSteps(cal)
    expect(s.map((x) => x.state)).toEqual(['done', 'cur', 'later'])
    expect(s[2]).toEqual({
      at: 'about 22:35',
      text: 'Darks start with 600 s at 6 °C, gain 0.',
      state: 'later',
    })
  })

  it('names the coldest set first when several dark sets are queued', () => {
    const q = { ...darksCal.queue![1], kind: 'darks' }
    const s = calibSteps({ ...cal, queue: [q, { ...q, set_temp: 10, status: 'waiting' }] })
    expect(s[2].text).toBe('Darks start with the coldest set: 600 s at 6 °C, gain 0.')
    expect(s[2].text).not.toContain('warmest')
  })

  it('draws the sensor line, the target and the rest of the ramp', () => {
    const box = { x0: 44, x1: 584, yTop: 14, yBottom: 176 }
    const ch = coolChart(
      history,
      { target: -11.57, setpoint: 7, endsAt: t(1, 44), now: T(1, 26) },
      box,
    )
    expect(ch.empty).toBe(false)
    expect(ch.sensor.startsWith('M44.0 ')).toBe(true)
    expect(ch.ramp).not.toBe('')
    expect(ch.target?.label).toBe('target −11.6 °C')
    expect(ch.end?.label).toBe('20:44')
    expect(ch.now?.label).toBe('7.0 °C now')
    expect(ch.yTicks[0].label).toBe('15')
    expect(ch.yTicks[ch.yTicks.length - 1].label).toBe('−15')
    expect(coolChart([history[0]], { now: T(1) }, box).empty).toBe(true)
  })
})

describe('darks card', () => {
  it('splits the set into earlier, this run and in progress', () => {
    const f = framesGrid(darksCal.set, true)!
    expect([f.old, f.done, f.now, f.total]).toEqual([5, 12, true, 25])
    expect(f.cells.filter((c) => c === 'now')).toHaveLength(1)
    expect(f.cells[17]).toBe('now')
    expect(framesGrid({}, true)).toBeNull()
  })

  it('uses the last image median only when its exposure matches', () => {
    const c = conditions({
      last_image: { source: 'prometheus', exposure: 300, median_adu: 504.2 },
    })
    const f = darkFacts(darksCal, c)
    expect(f.find((x) => x.label === 'Last dark')?.value).toBe('504 ADU')
    expect(f.find((x) => x.label === 'Air')).toEqual({
      label: 'Air',
      value: '18.3 °C',
      note: 'camera 11 °C below',
    })
    const other = conditions({
      last_image: { source: 'prometheus', exposure: 5, median_adu: 31100 },
    })
    expect(darkFacts(darksCal, other).find((x) => x.label === 'Last dark')?.value).toBe(
      NOT_MEASURED,
    )
  })

  it('names who needs the set', () => {
    const w = whoNeeds(
      combo({
        targets: Array.from({ length: 12 }, (_, i) => ({ name: 'T' + i, lights: 1200 - i })),
      }),
    )!
    expect(w.scope).toBe('lights at 5 to 7 °C, 300 s, gain 0')
    expect(w.text).toBe(
      'Lights from 12 targets wait on this set: 556 use a dark scaled from another temperature or exposure and 1,203 use a set of fewer than 25 darks. This set gives them a full set of 25 at their temperature.',
    )
    expect(w.pills).toHaveLength(9)
    expect(w.pills[0]).toEqual({ name: 'T0', lights: '1,200' })
    expect(w.more).toBe(3)
    expect(whoNeeds(undefined)).toBeNull()
  })
})

describe('flats card', () => {
  const cal: CalibrationStatus = {
    kind: 'flats',
    placement: 'flats',
    set: {
      filter: 'B',
      target_name: "Barnard's E",
      exposure: 5,
      frames_total: 30,
      frames_done: 13,
      panel_brightness: 48,
    },
    taken: [
      {
        kind: 'flats',
        filter: 'L',
        target_name: 'M 15',
        exposure: 3,
        frames: 30,
        ended_at: t(11, 41),
      },
    ],
  }

  it('shows panel brightness as a share only when the panel reports its maximum', () => {
    const fd = conditions({
      flat_device: { source: 'prometheus', connected: true, brightness: 48, brightness_max: 4096 },
    })
    expect(flatFacts(cal, fd)[0]).toEqual({
      label: 'Panel',
      value: '48 of 4,096',
      note: '1.2% brightness',
    })
    expect(flatFacts(cal, conditions())[0]).toEqual({ label: 'Panel', value: '48', note: '' })
    expect(flatFacts({ kind: 'flats' }, conditions())[0].value).toBe(NOT_MEASURED)
  })

  it('lists the flats taken and the current set', () => {
    expect(flatRows(cal)).toEqual([
      { done: '06:41', target: 'M 15', filter: 'L', flats: '30', exposure: '3 s', current: false },
      {
        done: 'now',
        target: "Barnard's E",
        filter: 'B',
        flats: '13 of 30',
        exposure: '5 s',
        current: true,
      },
    ])
  })
})

describe('nothing left', () => {
  const cal: CalibrationStatus = {
    kind: 'done',
    sun_limit_at: t(12, 7),
    sun_limit_degrees: -8,
    stop: { at: t(10, 31), code: 'sun', reason: 'x' },
    queue: [
      { set_temp: -19, exposure: 300, gain: 0, status: 'skipped', reason_code: 'cooler_capacity' },
      { set_temp: 3, exposure: 300, gain: 0, status: 'next' },
    ],
    taken: [
      {
        kind: 'darks',
        exposure: 300,
        gain: 0,
        offset: 50,
        set_temp: 6,
        frames: 20,
        started_at: t(1, 44),
        ended_at: t(3, 33),
      },
      {
        kind: 'darks',
        exposure: 600,
        gain: 0,
        offset: 50,
        set_temp: 4,
        frames: 25,
        started_at: t(6, 0),
        ended_at: t(10, 31),
      },
    ],
  }
  const recent: RecentCalibration = {
    runs: [
      {
        kind: 'darks',
        exposure: 300,
        gain: 0,
        offset: 50,
        set_temp: 6,
        frames: 20,
        clean: 19,
        leak: 1,
        started_at: t(1, 45),
        ended_at: t(3, 33),
      },
      {
        kind: 'darks',
        exposure: 300,
        gain: 0,
        offset: 50,
        set_temp: 6,
        frames: 5,
        clean: 5,
        started_at: t(10, 0),
        ended_at: t(10, 30),
      },
    ],
  }

  it('says why and lists the sets that wait', () => {
    const v = doneView(cal, conditions())
    expect(v.headline).toBe('Roof closed, no calibration left to take')
    expect(v.why).toBe(
      'Calibration stopped because the sun reaches 8° below the horizon at 07:07. The camera is at 7.0 °C.',
    )
    expect(v.facts[0]).toEqual({
      label: 'Darks tonight',
      value: '2 sets · 45 frames',
      note: '20:44 to 05:31',
    })
    expect(v.waits).toEqual([
      {
        set: '300 s at −19 °C, gain 0',
        reason:
          'The camera has never cooled to −19 °C at this air temperature. It waits for a cooler night.',
      },
    ])
  })

  it('joins clean counts from the frames on record by setup and time', () => {
    expect(matchRun(cal.taken![0], recent.runs)?.clean).toBe(19)
    expect(takenRows(cal, recent)).toEqual([
      { set: '300 s at 6 °C, gain 0', frames: '20', clean: '19', ended: '22:33' },
      { set: '600 s at 4 °C, gain 0', frames: '25', clean: 'not checked yet', ended: '05:31' },
    ])
    expect(takenRows(cal, null)[0].clean).toBe('not checked yet')
  })
})

describe('lower cards', () => {
  it('summarises the missing dark sets', () => {
    const v = missingView({
      frames_needed: 25,
      combos: [
        combo({ combo_key: 'a' }),
        combo({ combo_key: 'b', set_temp: -19, lights_blocked: 1368, lights_scaled: 0 }),
      ],
      unschedulable: [
        {
          exposure: 600,
          set_temp: -25,
          lights: 302,
          reason: 'the lights have no GAIN or OFFSET in their header',
        },
        {
          exposure: 300,
          set_temp: -25,
          lights: 118,
          reason: 'the lights have no GAIN or OFFSET in their header',
        },
      ],
    } as DarkBacklog)!
    expect(v.summary).toBe(
      '2 sets are short of 25 clean darks. 1,368 lights have no dark at all and 556 use a scaled one.',
    )
    expect(v.rows[0]).toMatchObject({
      set: '300 s at 6 °C, gain 0',
      have: '5 of 25',
      waiting: '556 scaled',
      bad: false,
      latest: '18 Sept',
    })
    expect(v.rows[1]).toMatchObject({ waiting: '1,368 with none', bad: true })
    expect(v.foot).toBe(
      '420 lights cannot be matched to any dark: their files have no gain or offset.',
    )
    expect(missingView(null)).toBeNull()
  })

  it('states the exposure rule when the stacker sends it', () => {
    const v = missingView({
      frames_needed: 25,
      frames_needed_long: 10,
      long_exposure_s: 120,
      combos: [combo({ combo_key: 'a', exposure: 300, frames_needed: 10, frames_have: 4 })],
      unschedulable: [],
    } as DarkBacklog)!
    expect(v.summary).toBe(
      '1 set is short of a full set of clean darks (25 for exposures under 120 s, 10 for 120 s and longer). 556 use a scaled one.',
    )
    expect(v.rows[0].have).toBe('4 of 10')
  })

  it('lists recent runs and the light-leak tally', () => {
    const v = recentView({
      newest_indexed: t(12, 4),
      runs: [
        {
          kind: 'flats',
          target_name: 'M 15',
          filter: 'L',
          exposure: 3,
          frames: 30,
          ended_at: t(11, 41),
        },
        {
          kind: 'darks',
          exposure: 300,
          gain: 0,
          set_temp: 9,
          frames: 25,
          clean: 25,
          leak: 0,
          unchecked: 0,
          ended_at: t(6, 22),
        },
      ],
    })!
    expect(v.rows[0]).toEqual({
      ended: '06:41',
      kind: 'Flats',
      set: 'Luminance, M 15, 3 s',
      frames: '30',
      leak: false,
    })
    expect(v.foot).toBe(
      'All 25 darks passed the light-leak check. Newest frame on record from 07:04.',
    )
    expect(recentView(null)).toBeNull()
  })

  it('shows the camera and air for an older plugin', () => {
    const v = unreportedView(
      conditions({
        camera: {
          source: 'prometheus',
          connected: true,
          temperature: -9.8,
          target_temperature: -11,
          cooler_on: true,
          cooler_power: 100,
        },
      }),
    )
    expect(v.headline).toBe('Roof closed, camera cooling')
    expect(v.facts.map((f) => f.value)).toEqual(['−9.8 °C', '−11 °C', '100%', '18.3 °C'])
    expect(unreportedView(null).facts.every((f) => f.value === NOT_MEASURED)).toBe(true)
  })
})

describe('contract details', () => {
  it('shows a cool-down for imaging only until the first exposure', () => {
    const cal: CalibrationStatus = { kind: 'cooling', purpose: 'imaging' }
    expect(calibCard(status({ state: 'imaging', calibration: cal }), conditions())).toBe('cooling')
    expect(
      calibCard(
        status({ state: 'imaging', calibration: cal, exposure: { filter: 'L', seconds: 300 } }),
        conditions(),
      ),
    ).toBeNull()
    expect(ninaPill('cooling', cal, conditions())?.value).toBe('cooling for imaging')
    expect(
      showCalibLower('cooling', status({ state: 'imaging', calibration: cal }), conditions()),
    ).toBe(false)
  })

  it('lets pause apply inside the wait and keeps the outside-the-scheduler line for the rest', () => {
    const wait = status({ calibration: { kind: 'darks', placement: 'before_wait' } })
    expect(pauseApplies(wait)).toBe(true)
    expect(outsideScheduler('darks', wait)).toBe(false)
    const unsafe = status({ calibration: { kind: 'darks', placement: 'while_unsafe' } })
    expect(pauseApplies(unsafe)).toBe(false)
    expect(outsideScheduler('darks', unsafe)).toBe(true)
    expect(
      outsideScheduler(
        'flats',
        status({ calibration: { kind: 'flats', placement: 'end_of_night' } }),
      ),
    ).toBe(true)
    expect(outsideScheduler('done', unsafe)).toBe(false)
  })

  it('words the flat reasons and stop codes', () => {
    expect(reasonText({ reason_code: 'untrained', filter: 'Ha' }, null)).toBe(
      'The flat panel has no trained exposure for H-a.',
    )
    expect(reasonText({ reason_code: 'already_taken' }, null)).toBe(
      'These flats were already taken in this run.',
    )
    expect(reasonText({ reason_code: 'error' }, null)).toBe('An error stopped this set.')
    expect(stopText({ stop: { code: 'safe' } })).toBe(
      'It turned safe, so calibration stopped for imaging.',
    )
    expect(stopText({ stop: { code: 'error', reason: 'camera lost' } })).toBe('Camera lost.')
    expect(stopText({})).toBe('')
  })

  it('merges a set taken in more than one run', () => {
    const a = { kind: 'darks', combo_key: 'k', exposure: 300, gain: 0, set_temp: 6 }
    const taken = [
      { ...a, frames: 10, started_at: t(1), ended_at: t(2) },
      { ...a, frames: 5, started_at: t(4), ended_at: t(5) },
      { kind: 'flats', target_name: 'M 15', filter: 'L', exposure: 3, frames: 30, ended_at: t(11) },
    ]
    const g = groupTaken(taken)
    expect(g).toHaveLength(2)
    expect(g[0].frames).toBe(15)
    const rows = takenRows(
      { kind: 'done', taken },
      {
        runs: [
          {
            kind: 'darks',
            exposure: 300,
            gain: 0,
            set_temp: 6,
            clean: 10,
            started_at: t(1),
            ended_at: t(2),
          },
        ],
      },
    )
    expect(rows[0]).toEqual({
      set: '300 s at 6 °C, gain 0',
      frames: '15',
      clean: '10 so far',
      ended: '00:00',
    })
    const flats = flatRows({
      kind: 'flats',
      set: { target_name: 'M 15', filter: 'L', frames_total: 30, frames_done: 31 },
      taken,
    })
    expect(flats).toHaveLength(1)
    expect(flats[0].current).toBe(true)
  })
})
