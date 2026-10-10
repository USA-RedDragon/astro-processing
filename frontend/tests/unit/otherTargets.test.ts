import { describe, expect, it } from 'vitest'
import { unrecordedLights } from '@/lib/otherTargets'

describe('unrecordedLights', () => {
  it('counts lights Target Scheduler did not record', () => {
    expect(unrecordedLights({ lights: 184, recorded: 0 })).toBe(
      '184 of 184 lights not recorded by Target Scheduler',
    )
    expect(unrecordedLights({ lights: 3, recorded: 2 })).toBe(
      '1 of 3 lights not recorded by Target Scheduler',
    )
  })
  it('says light for one', () => {
    expect(unrecordedLights({ lights: 1, recorded: 0 })).toBe(
      '1 of 1 light not recorded by Target Scheduler',
    )
  })
})
