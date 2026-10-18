import type {
  Binary,
  BinaryList,
  EclipsePlan,
  Kit,
  KitCheck,
  KitField,
  KitFile,
  PlannedEclipse,
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
      field({ key: 'position', label: 'Position (J2000)', value: '01 02 03.4 +05 06 07.8', hint: 'Made-up hint.' }),
      field({ key: 'primary_name', label: 'Primary name', value: 'Gaia DR3 1000000000000000101', editable: true }),
      field({ key: 'other_names', label: 'Other names', value: '', state: 'not_looked_up' }),
      field({ key: 'spectral_type', label: 'Spectral type', value: '', state: 'empty' }),
      field(),
      field({ key: 'duration', label: 'Eclipse duration (%)', value: '', state: 'not_measured' }),
      field({ key: 'discoverer', label: 'Discoverer', value: '', state: 'not_set', editable: true }),
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
      file({ key: 'chart', title: 'Finding chart', state: 'pending', url: '', caption: '', bytes: 0, note: 'Made-up note: being made.' }),
    ],
    checklist: [
      check({ key: 'vsx', text: 'No VSX entry nearby', done: true, auto: true, note: 'Checked by the app' }),
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

export const plan = (eclipses: PlannedEclipse[], over: Partial<EclipsePlan> = {}): EclipsePlan => ({
  from: '2026-10-17T05:00:00Z',
  to: '2026-11-16T06:00:00Z',
  zone_note: 'Times are US Central (made-up zone note).',
  site_known: true,
  eclipses,
  hidden: 0,
  ...over,
})
