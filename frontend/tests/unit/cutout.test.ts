import { describe, expect, it } from 'vitest'
import { cutoutUrl } from '@/scheduler/cutout'

describe('cutoutUrl', () => {
  it('wraps RA, rounds coordinates and clamps the field of view', () => {
    const u = new URL(
      cutoutUrl({ ra: -10, dec: 41.266666666, fov: 45, width: 160.4, height: 100 }),
      'http://x',
    )
    expect(u.pathname).toBe('/api/v1/sky/cutout')
    expect(u.searchParams.get('ra')).toBe('350.00000')
    expect(u.searchParams.get('dec')).toBe('41.26667')
    expect(u.searchParams.get('fov')).toBe('30.000')
    expect(u.searchParams.get('width')).toBe('160')
    expect(u.searchParams.get('rotation')).toBe('0')
  })
})
