import { describe, expect, it } from 'vitest'
import { verdictBadge } from '@/scheduler/plan'

describe('night status', () => {
  it("labels a moving body's sub registered to its own night", () => {
    expect(verdictBadge('night')).toEqual({ label: "Added to its night's stack", tone: 'ok' })
    expect(verdictBadge('added')).toEqual({ label: 'Added', tone: 'ok' })
  })
})
