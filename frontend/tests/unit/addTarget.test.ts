import { describe, expect, it } from 'vitest'
import { landingStep } from '@/scheduler/addTarget'

describe('add target landing step', () => {
  it('opens the requested step when nothing needs deciding', () => {
    expect(landingStep('frame', false)).toBe(2)
    expect(landingStep('mosaic', false)).toBe(3)
    expect(landingStep(undefined, false)).toBe(1)
  })

  it('stays on Find while a name match waits for a decision', () => {
    expect(landingStep('frame', true)).toBe(1)
    expect(landingStep('mosaic', true)).toBe(1)
  })
})
