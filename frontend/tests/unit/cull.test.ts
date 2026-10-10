import { describe, expect, it } from 'vitest'
import { isCulled } from '@/lib/cull'

describe('isCulled', () => {
  it('uses the stacker cut by default', () => {
    expect(isCulled(0.2, 0.24, null)).toBe(true)
    expect(isCulled(0.25, 0.24, null)).toBe(false)
    expect(isCulled(0.2, null, null)).toBe(false)
  })
  it('uses a typed threshold instead', () => {
    expect(isCulled(0.25, 0.24, 0.3)).toBe(true)
  })
  it('never culls an unscored sub', () => {
    expect(isCulled(null, 0.24, 0.9)).toBe(false)
  })
})
