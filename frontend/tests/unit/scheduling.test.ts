import { describe, expect, it } from 'vitest'
import { GLOBAL_SETTINGS, globalChanged, globalErrors } from '@/scheduler/scheduling'
import type { GlobalSettings } from '@/scheduler/api/scheduling'

const base: GlobalSettings = {
  ditherEvery: 2,
  filterSwitchFrequency: 1,
  flatsHandling: 1,
  smartExposureOrder: false,
  meridianWindow: 0,
  maximumAltitude: 0,
  enableGrader: true,
}

describe('global scheduling settings', () => {
  it('lists the shared settings and leaves the horizon to the system', () => {
    expect(GLOBAL_SETTINGS.map((s) => s.key)).toEqual([
      'ditherEvery',
      'filterSwitchFrequency',
      'smartExposureOrder',
      'flatsHandling',
      'meridianWindow',
      'maximumAltitude',
      'enableGrader',
    ])
  })

  it('checks each value and the maximum against the minimum altitude', () => {
    expect(globalErrors(base, 15)).toEqual({})
    expect(Object.keys(globalErrors({ ...base, ditherEvery: -1, flatsHandling: 150 }, 15))).toEqual([
      'ditherEvery',
      'flatsHandling',
    ])
    expect(globalErrors({ ...base, maximumAltitude: 12 }, 15).maximumAltitude).toContain('above the minimum altitude')
    expect(globalErrors({ ...base, maximumAltitude: 80 }, 15)).toEqual({})
  })

  it('is changed only when a draft value differs', () => {
    expect(globalChanged(base, {})).toBe(false)
    expect(globalChanged(base, { ditherEvery: 2 })).toBe(false)
    expect(globalChanged(base, { ditherEvery: 3 })).toBe(true)
  })
})
