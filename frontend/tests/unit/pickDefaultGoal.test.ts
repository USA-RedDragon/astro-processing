import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickDefaultGoal, pickRequestGoal } from '@/scheduler/addTarget'
import { getPick } from '@/scheduler/api/planning'

afterEach(() => vi.unstubAllGlobals())

describe('pick goal kind', () => {
  it('leaves the kind to the API until the user picks one', () => {
    expect(pickRequestGoal(false, 'snr', null, null)).toEqual({ snr: 0, depth: 0 })
    expect(pickRequestGoal(false, 'depth', 12, 26.5)).toEqual({ snr: 12, depth: 26.5 })
    expect(pickRequestGoal(true, 'snr', null, 26.5)).toEqual({ kind: 'snr', snr: 0, depth: 0 })
    expect(pickRequestGoal(true, 'depth', null, 26.5)).toEqual({ kind: 'depth', snr: 0, depth: 26.5 })
  })

  it('does not change the request when the default kind comes back', () => {
    const before = JSON.stringify(pickRequestGoal(false, 'snr', null, null))
    expect(JSON.stringify(pickRequestGoal(false, 'depth', null, null))).toBe(before)
  })

  it('takes the default kind and its basis from the pick', () => {
    const basis =
      'depth by default for a open cluster: its broadband light is set by depth, not by one faint band'
    expect(pickDefaultGoal({ goal: { kind: 'depth', snr: 10, depth: 0 }, goalBasis: basis })).toEqual({
      kind: 'depth',
      basis,
    })
    expect(pickDefaultGoal({ goal: { kind: 'snr', snr: 10, depth: 0 }, goalBasis: 'chosen' })).toEqual({
      kind: 'snr',
      basis: '',
    })
  })

  it('falls back to the returned kind on an API without a basis', () => {
    expect(pickDefaultGoal({ goal: { kind: 'snr', snr: 10, depth: 0 } })).toEqual({ kind: 'snr', basis: '' })
    expect(pickDefaultGoal({})).toBeNull()
    expect(pickDefaultGoal(null)).toBeNull()
  })

  it('sends no goal kind in the pick request until one is chosen', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        urls.push(u)
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }),
    )
    await getPick('M 34', pickRequestGoal(false, 'snr', null, null))
    await getPick('M 34', pickRequestGoal(true, 'depth', null, 26.5))
    expect(urls[0]).toBe('/api/v1/catalog/objects/M%2034/pick')
    expect(urls[1]).toBe('/api/v1/catalog/objects/M%2034/pick?goal=depth&depth=26.5')
  })
})
