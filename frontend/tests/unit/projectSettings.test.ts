import { describe, expect, it } from 'vitest'
import type { Project, ProjectSettingDefaults } from '@/scheduler/api/planning'
import {
  SETTINGS,
  defaultValues,
  defaultsBasisText,
  flatsLabel,
  flatsOptions,
  projectSettings,
  settingChanges,
  minimumAltitudeError,
  minimumTimeError,
  settingError,
  settingErrors,
  settingText,
  validFlats,
} from '@/scheduler/projectSettings'

const spec = (k: string) => SETTINGS.find((s) => s.key === k)!

const vals = {
  ditherEvery: 1,
  filterSwitchFrequency: 0,
  flatsHandling: 0,
  smartExposureOrder: false,
  meridianWindow: 0,
  useCustomHorizon: false,
  horizonOffset: 0,
  maximumAltitude: 0,
  enableGrader: false,
}

describe('flats', () => {
  it('labels the special values and day counts', () => {
    expect(flatsLabel(0)).toBe('Off')
    expect(flatsLabel(1)).toBe('Every day')
    expect(flatsLabel(7)).toBe('Every 7 days')
    expect(flatsLabel(100)).toBe('At target completion')
    expect(flatsLabel(200)).toBe('Use with immediate')
  })

  it('accepts 0 to 99, 100 and 200 only', () => {
    for (const v of [0, 1, 50, 99, 100, 200]) expect(validFlats(v)).toBe(true)
    for (const v of [-1, 101, 150, 199, 201, 2.5]) expect(validFlats(v)).toBe(false)
  })

  it('offers the Target Scheduler choices and keeps an odd current value', () => {
    expect(flatsOptions()).toEqual([0, 1, 2, 3, 5, 7, 10, 14, 100, 200])
    expect(flatsOptions(4)).toEqual([0, 1, 2, 3, 4, 5, 7, 10, 14, 100, 200])
    expect(flatsOptions(150)).toEqual([0, 1, 2, 3, 5, 7, 10, 14, 100, 200])
  })
})

describe('settingError', () => {
  it('bounds whole-number fields', () => {
    expect(settingError(spec('ditherEvery'), 999)).toBe('')
    expect(settingError(spec('ditherEvery'), 1000)).toMatch(/0 to 999/)
    expect(settingError(spec('ditherEvery'), -1)).toMatch(/0 to 999/)
    expect(settingError(spec('ditherEvery'), 1.5)).toMatch(/whole number/)
    expect(settingError(spec('meridianWindow'), 720)).toBe('')
    expect(settingError(spec('meridianWindow'), 721)).toMatch(/0 to 720/)
    expect(settingError(spec('ditherEvery'), NaN)).toMatch(/number/)
  })

  it('allows fractional degrees within 0 to 90', () => {
    expect(settingError(spec('horizonOffset'), 2.5)).toBe('')
    expect(settingError(spec('horizonOffset'), 91)).toMatch(/0 to 90°/)
  })

  it('needs maximum altitude above the minimum unless off', () => {
    expect(settingError(spec('maximumAltitude'), 0, 30)).toBe('')
    expect(settingError(spec('maximumAltitude'), 30, 30)).toMatch(/above the minimum altitude \(30°\)/)
    expect(settingError(spec('maximumAltitude'), 31, 30)).toBe('')
    expect(settingError(spec('maximumAltitude'), 95, 30)).toMatch(/0 to 90/)
  })

  it('checks flats and booleans', () => {
    expect(settingError(spec('flatsHandling'), 150)).toMatch(/Flats must be/)
    expect(settingError(spec('flatsHandling'), 200)).toBe('')
    expect(settingError(spec('enableGrader'), true)).toBe('')
  })

  it('collects errors by key', () => {
    expect(settingErrors({ ...vals, ditherEvery: -1, maximumAltitude: 20 }, 25)).toEqual({
      ditherEvery: expect.stringMatching(/0 to 999/),
      maximumAltitude: expect.stringMatching(/above the minimum/),
    })
    expect(settingErrors(vals, 25)).toEqual({})
  })
})

describe('settingText', () => {
  it('names zero values by meaning', () => {
    expect(settingText(spec('ditherEvery'), 0)).toBe('Never')
    expect(settingText(spec('ditherEvery'), 1)).toBe('1 exposure')
    expect(settingText(spec('ditherEvery'), 3)).toBe('3 exposures')
    expect(settingText(spec('filterSwitchFrequency'), 0)).toBe('All of one filter first')
    expect(settingText(spec('meridianWindow'), 0)).toBe('Off')
    expect(settingText(spec('meridianWindow'), 60)).toBe('60 min')
    expect(settingText(spec('maximumAltitude'), 0)).toBe('Off')
    expect(settingText(spec('horizonOffset'), 5)).toBe('5°')
    expect(settingText(spec('flatsHandling'), 100)).toBe('At target completion')
    expect(settingText(spec('enableGrader'), true)).toBe('On')
  })
})

describe('projectSettings and settingChanges', () => {
  const project = { grader: true, ...vals, enableGrader: undefined } as unknown as Project

  it('reads the project fields, grader as enableGrader', () => {
    expect(projectSettings(project)).toEqual({ ...vals, enableGrader: true })
  })

  it('returns null when an older stacker leaves the fields out', () => {
    expect(projectSettings({ grader: false } as Project)).toBeNull()
  })

  it('sends only changed fields with command names', () => {
    const before = { ...vals, enableGrader: true }
    expect(
      settingChanges(before, { ditherEvery: 1, flatsHandling: 7, enableGrader: false }),
    ).toEqual([
      { field: 'flatshandling', before: 0, after: 7 },
      { field: 'enablegrader', before: true, after: false },
    ])
    expect(settingChanges(before, {})).toEqual([])
  })
})

describe('defaults', () => {
  const d: ProjectSettingDefaults = {
    ...vals,
    basis: 'profile',
    projects: 79,
    profileId: 'abc',
  }

  it('explains the basis', () => {
    expect(defaultsBasisText(d)).toBe('Most common among 79 projects on this profile')
    expect(defaultsBasisText({ ...d, projects: 1 })).toBe('Most common among 1 project on this profile')
    expect(defaultsBasisText({ ...d, basis: 'target-scheduler', projects: 0 })).toMatch(
      /^Target Scheduler defaults/,
    )
  })

  it('keeps only the setting values', () => {
    expect(defaultValues(d)).toEqual(vals)
  })
})

describe('minimum time and altitude', () => {
  it('takes the plugin edit ranges', () => {
    expect(minimumTimeError(1)).toBe('')
    expect(minimumTimeError(1440)).toBe('')
    expect(minimumTimeError(0)).toMatch(/1 to 1440/)
    expect(minimumTimeError(1441)).toMatch(/1 to 1440/)
    expect(minimumTimeError(30.5)).toMatch(/whole number/)
    expect(minimumTimeError(NaN)).toMatch(/1 to 1440/)
    expect(minimumAltitudeError(0)).toBe('')
    expect(minimumAltitudeError(90)).toBe('')
    expect(minimumAltitudeError(91)).toMatch(/0 to 90/)
    expect(minimumAltitudeError(NaN)).toMatch(/0 to 90/)
  })
})
