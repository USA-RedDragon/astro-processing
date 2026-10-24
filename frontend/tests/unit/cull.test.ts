import { describe, expect, it } from 'vitest'
import { cutRange, isCulled } from '@/lib/cull'

describe('isCulled', () => {
  it('uses the stacker cut by default', () => {
    expect(isCulled(0.2, 0.24, null)).toBe(true)
    expect(isCulled(0.25, 0.24, null)).toBe(false)
    expect(isCulled(0.2, null, null)).toBe(false)
  })
  it('uses a typed threshold instead', () => {
    expect(isCulled(0.25, 0.24, 0.3)).toBe(true)
    expect(isCulled(0.5, 0.24, 0.3, 0.1, 0.3)).toBe(false)
  })
  it('never culls an unscored sub', () => {
    expect(isCulled(null, 0.24, 0.9)).toBe(false)
  })
  it('culls a sub whose clarity is under the min score', () => {
    expect(isCulled(0.5, 0.24, null, 0.21, 0.3)).toBe(true)
    expect(isCulled(0.5, 0.24, null, 0.9, 0.3)).toBe(false)
    expect(isCulled(0.5, 0.24, null, 0.21, null)).toBe(false)
  })
})

describe('cutRange', () => {
  it('shows one cut when all subs share it', () => {
    expect(cutRange(0.24, 0.24)).toBe('0.24')
  })
  it('shows the range of per-sub cuts', () => {
    expect(cutRange(0.024, 0.24)).toBe('0.02 to 0.24')
  })
  it('is empty when no cut is known', () => {
    expect(cutRange(null, 0.24)).toBe('')
    expect(cutRange(undefined, undefined)).toBe('')
  })
})
