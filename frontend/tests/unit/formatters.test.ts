import { describe, expect, it } from 'vitest'
import { formatRA } from '@/lib/formatters'

describe('formatRA', () => {
  it('reads Target Scheduler RA as hours', () => {
    expect(formatRA(0.712222222222222)).toBe('0h 42m 44s')
    expect(formatRA(16.4280)).toBe('16h 25m 41s')
  })

  it('carries rounded seconds into minutes and hours', () => {
    expect(formatRA(1.9999999)).toBe('2h 0m 0s')
    expect(formatRA(23.99999999)).toBe('0h 0m 0s')
  })
})
