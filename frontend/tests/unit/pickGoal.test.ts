import { describe, expect, it } from 'vitest'
import { pickGoalText } from '@/scheduler/api/planning'

describe('pick goal label', () => {
  it('names the goal the new target gets', () => {
    expect(pickGoalText({ kind: 'snr', snr: 10, depth: 0 })).toBe('faint-signal SNR 10')
    expect(pickGoalText({ kind: 'depth', snr: 10, depth: 26.5 })).toBe('depth 26.5 mag/arcsec²')
    expect(pickGoalText({ kind: 'depth', snr: 10, depth: 0 })).toBe('the default depth per filter')
    expect(pickGoalText(undefined)).toBe('goal')
  })
})
