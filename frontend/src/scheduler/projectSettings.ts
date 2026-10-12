import type { Project, ProjectSettingDefaults, ProjectSettingValues } from './api/planning'

export type SettingKey = keyof ProjectSettingValues

export type ProjectSettingCurrent = { [K in SettingKey]: ProjectSettingValues[K] | null }

export const NOT_SET = 'Not set'

export const HARD_MIN_ALTITUDE = 15

export interface SettingSpec {
  key: SettingKey
  field: string
  label: string
  kind: 'int' | 'number' | 'bool' | 'flats'
  min?: number
  max?: number
  unit?: string
  help: string
}

export const FLATS_OFF = 0
export const FLATS_TARGET_COMPLETION = 100
export const FLATS_WITH_IMMEDIATE = 200
export const FLATS_OPTIONS = [0, 1, 2, 3, 5, 7, 10, 14, 100, 200]

export const SETTINGS: SettingSpec[] = [
  {
    key: 'ditherEvery',
    field: 'ditherevery',
    label: 'Dither every',
    kind: 'int',
    min: 0,
    max: 999,
    unit: 'exposures',
    help: "Dither after this many exposures. 0 never dithers at the project level, but a template's own dither setting can still apply.",
  },
  {
    key: 'filterSwitchFrequency',
    field: 'filterswitchfrequency',
    label: 'Filter switch frequency',
    kind: 'int',
    min: 0,
    max: 999,
    unit: 'exposures',
    help: 'Exposures of one filter before switching to the next. 0 takes all of one filter first.',
  },
  {
    key: 'smartExposureOrder',
    field: 'smartexposureorder',
    label: 'Smart exposure order',
    kind: 'bool',
    help: 'Let Target Scheduler pick the filter order by the moon instead of the fixed order.',
  },
  {
    key: 'flatsHandling',
    field: 'flatshandling',
    label: 'Flats',
    kind: 'flats',
    help: 'When Target Scheduler takes flats for this project.',
  },
  {
    key: 'meridianWindow',
    field: 'meridianwindow',
    label: 'Meridian window',
    kind: 'int',
    min: 0,
    max: 720,
    unit: 'min',
    help: 'Image only within this many minutes of the meridian. 0 is off.',
  },
  {
    key: 'useCustomHorizon',
    field: 'usecustomhorizon',
    label: 'Use custom horizon',
    kind: 'bool',
    help: "Use the NINA profile's horizon plus the horizon offset instead of the minimum altitude.",
  },
  {
    key: 'horizonOffset',
    field: 'horizonoffset',
    label: 'Horizon offset',
    kind: 'number',
    min: 0,
    max: 90,
    unit: '°',
    help: 'Degrees added to the custom horizon.',
  },
  {
    key: 'maximumAltitude',
    field: 'maximumaltitude',
    label: 'Maximum altitude',
    kind: 'number',
    min: 0,
    max: 90,
    unit: '°',
    help: 'Do not image above this altitude. 0 is off; otherwise it must be above the minimum altitude.',
  },
  {
    key: 'enableGrader',
    field: 'enablegrader',
    label: 'Image grader',
    kind: 'bool',
    help: "Grade each exposure with Target Scheduler's image grader.",
  },
]

export function flatsLabel(v: number): string {
  if (v === FLATS_OFF) return 'Off'
  if (v === FLATS_TARGET_COMPLETION) return 'At target completion'
  if (v === FLATS_WITH_IMMEDIATE) return 'Use with immediate'
  if (v === 1) return 'Every day'
  return `Every ${v} days`
}

export function flatsOptions(current?: number): number[] {
  if (current === undefined || FLATS_OPTIONS.includes(current) || !validFlats(current))
    return FLATS_OPTIONS
  return [...FLATS_OPTIONS, current].sort((a, b) => a - b)
}

export function validFlats(v: number): boolean {
  return (
    Number.isInteger(v) &&
    ((v >= 0 && v <= 99) || v === FLATS_TARGET_COMPLETION || v === FLATS_WITH_IMMEDIATE)
  )
}

export function settingText(spec: SettingSpec, v: number | boolean | null): string {
  if (v === null) return NOT_SET
  if (spec.kind === 'bool') return v ? 'On' : 'Off'
  const n = Number(v)
  if (spec.kind === 'flats') return flatsLabel(n)
  if (n === 0) {
    if (spec.key === 'ditherEvery') return 'Never'
    if (spec.key === 'filterSwitchFrequency') return 'All of one filter first'
    if (spec.key === 'meridianWindow' || spec.key === 'maximumAltitude') return 'Off'
  }
  if (spec.unit === '°') return `${n}°`
  if (spec.unit === 'exposures') return `${n} ${n === 1 ? 'exposure' : 'exposures'}`
  return `${n} ${spec.unit ?? ''}`.trim()
}

export function settingError(
  spec: SettingSpec,
  v: number | boolean | null,
  minimumAltitude?: number | null,
): string {
  if (v === null) return ''
  if (spec.kind === 'bool') return typeof v === 'boolean' ? '' : `${spec.label} must be on or off`
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${spec.label} must be a number`
  if (spec.kind === 'flats')
    return validFlats(v)
      ? ''
      : 'Flats must be off, every 1 to 99 days, at target completion or use with immediate'
  if (spec.kind === 'int' && !Number.isInteger(v)) return `${spec.label} must be a whole number`
  if (v < (spec.min ?? -Infinity) || v > (spec.max ?? Infinity))
    return `${spec.label} must be ${spec.min} to ${spec.max}${spec.unit === '°' ? '°' : ''}`
  if (
    spec.key === 'maximumAltitude' &&
    v !== 0 &&
    minimumAltitude !== null &&
    minimumAltitude !== undefined &&
    v <= minimumAltitude
  )
    return `Maximum altitude must be above the minimum altitude (${minimumAltitude}°), or 0 for off`
  return ''
}

export function settingErrors(
  vals: ProjectSettingCurrent,
  minimumAltitude?: number | null,
): Partial<Record<SettingKey, string>> {
  const out: Partial<Record<SettingKey, string>> = {}
  for (const spec of SETTINGS) {
    const e = settingError(spec, vals[spec.key], minimumAltitude)
    if (e) out[spec.key] = e
  }
  return out
}

export function projectSettings(p: Project): ProjectSettingCurrent | null {
  const v = {
    ditherEvery: p.ditherEvery,
    filterSwitchFrequency: p.filterSwitchFrequency,
    flatsHandling: p.flatsHandling,
    smartExposureOrder: p.smartExposureOrder,
    meridianWindow: p.meridianWindow,
    useCustomHorizon: p.useCustomHorizon,
    horizonOffset: p.horizonOffset,
    maximumAltitude: p.maximumAltitude,
    enableGrader: p.grader,
  }
  return Object.values(v).some((x) => x === undefined) ? null : (v as ProjectSettingCurrent)
}

export function settingChanges(
  before: ProjectSettingCurrent,
  draft: Partial<ProjectSettingValues>,
): { field: string; before: unknown; after: unknown }[] {
  const out: { field: string; before: unknown; after: unknown }[] = []
  for (const spec of SETTINGS) {
    const after = draft[spec.key]
    if (after === undefined || after === before[spec.key]) continue
    out.push({ field: spec.field, before: before[spec.key], after })
  }
  return out
}

export function defaultValues(d: ProjectSettingDefaults): ProjectSettingValues {
  const out = {} as Record<SettingKey, number | boolean>
  for (const spec of SETTINGS) out[spec.key] = d[spec.key]
  return out as unknown as ProjectSettingValues
}

export function defaultsBasisText(d: ProjectSettingDefaults): string {
  if (d.basis === 'profile')
    return `Most common among ${d.projects} ${d.projects === 1 ? 'project' : 'projects'} on this profile`
  return 'Target Scheduler defaults, because this profile has no projects yet'
}

export function settingsSummary(vals: ProjectSettingValues): string {
  return SETTINGS.map((s) => `${s.label}: ${settingText(s, vals[s.key])}`).join(' · ')
}

export const MINIMUM_TIME_RANGE = { min: 1, max: 1440 }
export const MINIMUM_ALTITUDE_RANGE = { min: 0, max: 90 }

export function minimumTimeError(v: number): string {
  if (!Number.isInteger(v) || v < MINIMUM_TIME_RANGE.min || v > MINIMUM_TIME_RANGE.max)
    return `Minimum time must be a whole number of minutes, ${MINIMUM_TIME_RANGE.min} to ${MINIMUM_TIME_RANGE.max}`
  return ''
}

export function minimumAltitudeError(v: number): string {
  if (!Number.isFinite(v) || v < MINIMUM_ALTITUDE_RANGE.min || v > MINIMUM_ALTITUDE_RANGE.max)
    return `Minimum altitude must be ${MINIMUM_ALTITUDE_RANGE.min} to ${MINIMUM_ALTITUDE_RANGE.max}°`
  return ''
}
