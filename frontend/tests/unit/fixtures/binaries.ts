import type {
  Binary,
  BinaryList,
  DipperView,
  DipWindow,
  OtherStar,
  EclipsePlan,
  Kit,
  KitCheck,
  KitField,
  KitFile,
  PlannedEclipse,
  Timing,
  TimingRecord,
  Trend,
} from '@/scheduler/api/binaries'

export function star(over: Partial<Binary> = {}): Binary {
  return {
    source_id: 101,
    name: 'Gaia DR3 1000000000000000101',
    alt_name: '',
    field: 'Test Field A',
    magnitude: 'G 15.10',
    type: 'EA',
    type_words: 'EA, oval orbit',
    period: 7.25,
    period_text: '7.25000',
    alt_period_text: '',
    eclipses: [
      { kind: 'primary', phase: 0, depth: 0.4, band: 'r', duration_hours: 5 },
      { kind: 'secondary', phase: 0.6, depth: 0.2, band: 'r', duration_hours: null },
    ],
    depth_text: '0.40 and 0.20 mag (r)',
    confidence: 'high',
    period_settled: true,
    flags: [],
    vsx: { submitted: false, ref: '', submitted_at: null },
    notes: '',
    facts_state: 'ready',
    facts_error: '',
    share: { state: 'none', url: '', version: 0, note: 'Made-up note: no colour picture yet.' },
    timing: { count: 0, text: 'Made-up: no timings yet.', flags: [] },
    ...over,
  }
}

export const submitted = () =>
  star({
    source_id: 202,
    name: '2MASS J00000000+0000000',
    alt_name: 'Gaia DR3 1000000000000000202',
    field: 'Test Field B',
    vsx: { submitted: true, ref: 'https://vsx.example/202', submitted_at: '2026-10-01T00:00:00Z' },
    notes: 'First made-up note.\n- Second made-up note.',
  })

export const flagged = () =>
  star({
    source_id: 303,
    name: 'Gaia DR3 1000000000000000303',
    field: 'Test Field C',
    type_words: '',
    period_text: '3.10000',
    alt_period_text: 'or 6.20000 (twice that)',
    depth_text: '0.30 mag (r), no second eclipse seen',
    confidence: 'medium',
    period_settled: false,
    flags: [{ id: 'twice', label: 'Period could be twice this', why: 'Made-up reason one.' }],
    facts_state: 'pending',
  })

export function other(over: Partial<OtherStar> = {}): OtherStar {
  return {
    source_id: 201,
    name: 'Gaia DR3 1000000000000000201',
    alt_name: '',
    field: 'Test Field B',
    magnitude: 'G 16.20',
    vet_kind: 'periodic',
    vet_line: 'Repeats every 4.318 days',
    waiting: '',
    period: 4.318,
    period_text: '4.318',
    confidence: 'medium',
    star_type: { key: 'rot', words: 'Spotted star', verb: 'rotates', vsx: 'ROT' },
    vsx: { submitted: false, ref: '', submitted_at: null },
    notes: '',
    share: { state: 'none', url: '', version: 0, note: '' },
    ...over,
  }
}

export const starTypes = [
  { key: 'rot', words: 'Spotted star', verb: 'rotates', vsx: 'ROT' },
  { key: 'dipper', words: 'Dipper', verb: 'dips recur', vsx: '' },
  { key: 'variable', words: 'Variable star', verb: 'repeats', vsx: 'VAR' },
]

export const list = (stars: Binary[] = [submitted(), star(), flagged()]): BinaryList => ({
  stars,
  discoverer: '',
  facts: { state: 'idle', done: 0, total: 0 },
})

export function field(over: Partial<KitField> = {}): KitField {
  return {
    key: 'period',
    label: 'Period (days)',
    value: '7.25000',
    state: 'value',
    hint: '',
    editable: false,
    ...over,
  }
}

export function file(over: Partial<KitFile> = {}): KitFile {
  return {
    key: 'phased',
    title: 'Supporting file 1: phased light curve',
    state: 'ready',
    url: '/api/v1/discoveries/binaries/101/files/phased.png',
    caption: 'Made-up caption for the folded curve.',
    bytes: 52000,
    note: '',
    ...over,
  }
}

export function check(over: Partial<KitCheck> = {}): KitCheck {
  return { key: 'name', text: 'Press "Check name"', done: false, auto: false, note: '', ...over }
}

export function kit(over: Partial<Kit> = {}): Kit {
  return {
    star: star(),
    lede: 'A made-up star in Test Field A.',
    fields: [
      field({
        key: 'position',
        label: 'Position (J2000)',
        value: '01 02 03.4 +05 06 07.8',
        hint: 'Made-up hint.',
      }),
      field({
        key: 'primary_name',
        label: 'Primary name',
        value: 'Gaia DR3 1000000000000000101',
        editable: true,
      }),
      field({ key: 'other_names', label: 'Other names', value: '', state: 'not_looked_up' }),
      field({ key: 'spectral_type', label: 'Spectral type', value: '', state: 'empty' }),
      field(),
      field({ key: 'duration', label: 'Eclipse duration (%)', value: '', state: 'not_measured' }),
      field({
        key: 'discoverer',
        label: 'Discoverer',
        value: '',
        state: 'not_set',
        editable: true,
      }),
    ],
    files: [
      file(),
      file({
        key: 'own',
        title: 'Supporting file 2: your own eclipse',
        state: 'none',
        url: '',
        caption: '',
        bytes: 0,
        note: 'Made-up note: no eclipse caught yet.',
      }),
      file({
        key: 'chart',
        title: 'Finding chart',
        state: 'pending',
        url: '',
        caption: '',
        bytes: 0,
        note: 'Made-up note: being made.',
      }),
    ],
    checklist: [
      check({
        key: 'vsx',
        text: 'No VSX entry nearby',
        done: true,
        auto: true,
        note: 'Checked by the app',
      }),
      check(),
      check({ key: 'upload', text: 'Upload the light curve', done: true }),
    ],
    ...over,
  }
}

export function eclipse(over: Partial<PlannedEclipse> = {}): PlannedEclipse {
  return {
    source_id: 101,
    name: 'Gaia DR3 1000000000000000101',
    field: 'Test Field A',
    magnitude: 'G 15.10',
    period_text: '7.25000',
    alt_period_text: '',
    kind: 'primary',
    kind_label: 'Deeper eclipse',
    mid: '2026-10-20T08:00:00Z',
    day_label: 'Tue Oct 20',
    time_label: '3:00 AM',
    zone: 'CDT',
    err_minutes: 4,
    duration_hours: 5,
    observable: true,
    observable_note: 'Dark and 40° up at mid-eclipse',
    purpose: 'own',
    why: 'Made-up reason: adds your own eclipse.',
    window: { start: '2026-10-20T04:00:00Z', end: '2026-10-20T12:00:00Z' },
    request: null,
    ...over,
  }
}

export function dip(over: Partial<DipWindow> = {}): DipWindow {
  return {
    source_id: 15523,
    name: 'Gaia DR3 1000000000000015523',
    field: 'Test Field D',
    magnitude: 'G 16.90',
    period_text: '9.356',
    n: 12,
    mid: '2026-10-20T20:35:00Z',
    start: '2026-10-20T10:35:00Z',
    end: '2026-10-21T06:35:00Z',
    group_at: '2026-10-21T00:05:00Z',
    day_label: 'Tue Oct 20',
    window_text: '5:35 AM to 1:35 AM',
    zone: 'CDT',
    mid_text: '3:35 PM Oct 20',
    mid_label: 'Oct 20, 3:35 PM',
    dark: [{ start: '2026-10-21T00:05:00Z', end: '2026-10-21T06:35:00Z' }],
    dark_minutes: 390,
    dark_text: '7:05 PM to 1:35 AM',
    dark_note: 'dark from 7:05 PM to 1:35 AM, 6 h 30 min',
    observable: true,
    observable_note: '',
    why: 'Made-up reason: a dip here would back the cycle.',
    every_window: false,
    over: false,
    request: null,
    imaging: null,
    result: { state: 'waiting', label: 'Not imaged yet', note: '' },
    ...over,
  }
}

export function dipper(over: Partial<DipperView> = {}): DipperView {
  return {
    source_id: 15523,
    ephemeris: {
      period: 9.356,
      epoch_mjd: 60000.5,
      window_hours: 20,
      depth_low: 0.15,
      depth_high: 0.6,
      dur_low_hours: 2,
      dur_high_hours: 18,
      active_share: 0.25,
      past_surveys: 'ZTF and ATLAS',
      past_dips: 3,
      past_years: 2,
      past_active: 3,
      past_covered: 9,
    },
    every_window: false,
    windows_text: 'every 9.356 days, 20 hours wide (made-up)',
    dips_text: '0.15 to 0.6 mag, made-up',
    past_text: 'Past windows from made-up surveys: 3 dips over 2 years.',
    zone_note: 'Times are US Central (made-up zone note).',
    windows: [],
    ...over,
  }
}

export const plan = (eclipses: PlannedEclipse[], over: Partial<EclipsePlan> = {}): EclipsePlan => ({
  from: '2026-10-17T05:00:00Z',
  to: '2026-11-16T06:00:00Z',
  zone_note: 'Times are US Central (made-up zone note).',
  site_known: true,
  eclipses,
  hidden: 0,
  ...over,
})

export function timing(over: Partial<Timing> = {}): Timing {
  return {
    id: 1,
    kind: 'secondary',
    kind_label: 'Second eclipse',
    night: '2026-10-11',
    mid: '2026-10-12T09:33:00Z',
    filter: 'Luminance',
    bjd_tdb: 2461325.90389,
    hjd_utc: 2461325.9031,
    err_minutes: 5.5,
    late_minutes: 0.6,
    late_text: '0.6 minutes late',
    cycle: 323,
    points: 28,
    method: "Fit of the eclipse's own shape",
    check_minutes: null,
    used: true,
    state: 'good',
    note: '',
    request_id: null,
    ...over,
  }
}

export function trendRows(): Trend[] {
  return [
    {
      id: 'ephemeris',
      label: 'Predicted times need updating',
      state: 'need',
      why: 'Not enough timings yet. Made-up need one.',
      basis: '',
    },
    {
      id: 'period',
      label: 'Period changing',
      state: 'clear',
      why: 'Made-up clear finding.',
      basis: 'Made-up basis.',
    },
    {
      id: 'orbit',
      label: 'Orbit turning',
      state: 'flag',
      why: 'Made-up flag finding.',
      basis: 'Made-up flag basis.',
    },
    {
      id: 'third',
      label: 'Possible third star',
      state: 'need',
      why: 'Not enough timings yet. Made-up need four.',
      basis: '',
    },
  ]
}

export function record(over: Partial<TimingRecord> = {}): TimingRecord {
  return {
    source_id: 101,
    name: 'Gaia DR3 1000000000000000101',
    period_text: '7.25000',
    epoch_bjd_tdb: 2460000.5,
    epoch_hjd_utc: 2460000.4995,
    summary: 'Made-up summary: 1 good timing so far.',
    timings: [timing()],
    untimed: [
      {
        id: 2,
        kind: 'primary',
        kind_label: 'Deeper eclipse',
        night: '2025-10-22',
        mid: '2025-10-23T06:00:00Z',
        state: 'none',
        note: 'Not timed: made-up reason.',
        request_id: null,
      },
    ],
    points: [{ year: 2026.78, kind: 'secondary', minutes: 0.6, err_minutes: 5.5, used: true }],
    lines: [],
    trends: trendRows(),
    updated: null,
    season: null,
    ...over,
  }
}

export const emptyRecord = () =>
  record({
    summary: 'Made-up: no timings yet.',
    timings: [],
    untimed: [],
    points: [],
    trends: trendRows().map((t) => ({ ...t, state: 'need' as const, basis: '' })),
  })
