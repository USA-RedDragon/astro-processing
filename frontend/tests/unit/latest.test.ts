import { describe, expect, it } from 'vitest'
import { latestOnly } from '@/scheduler/latest'

describe('latestOnly', () => {
  it('keeps only the newest request current', () => {
    const l = latestOnly()
    const a = l.next()
    expect(a()).toBe(true)
    const b = l.next()
    expect(a()).toBe(false)
    expect(b()).toBe(true)
    l.cancel()
    expect(b()).toBe(false)
  })
})
