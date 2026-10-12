import { describe, expect, it } from 'vitest'
import { project } from '@/scheduler/api/mosaics'
import {
  TAIL_OFFSET,
  centeredFraming,
  frameCenter,
  frameCorners,
  fromCustom,
  headText,
  hoursText,
  modeOf,
  move,
  ninaPositionAngle,
  norm360,
  positionAngle,
  previewView,
  recenterHours,
  separation,
  tailFraming,
  toCustom,
  tonightPath,
  withFraming,
} from '@/scheduler/framing'
import type { BodyTrackRow } from '@/scheduler/api/comets'

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('sky geometry', () => {
  it('moves along position angles east of north', () => {
    const p = { ra: 100, dec: 0 }
    close(move(p, 0, 1).dec, 1)
    close(move(p, 90, 1).ra, 101)
    close(move(p, 180, 1).dec, -1)
    close(move(p, 270, 1).ra, 99)
    close(move(p, 90, -1).ra, 99)
    expect(move(p, 45, 0)).toEqual(p)
  })

  it('wraps right ascension at zero', () => {
    close(move({ ra: 359.8, dec: 0 }, 90, 0.5).ra, 0.3)
    close(move({ ra: 0.2, dec: 0 }, 270, 0.5).ra, 359.7)
    expect(norm360(-90)).toBe(270)
    expect(norm360(360)).toBe(0)
  })

  it('keeps distance and starting angle near the pole', () => {
    const body = { ra: 10, dec: 87.5 }
    for (const pa of [0, 45, 90, 135, 200, 300]) {
      const m = move(body, pa, 0.83)
      close(separation(body, m), 0.83, 1e-9)
      close(positionAngle(body, m), pa, 1e-6)
    }
  })
})

describe('framing', () => {
  const head = { ra: 321.33029, dec: 4.81158 }

  it('puts the frame centre toward the tail and the head sunward for tail framing', () => {
    const f = tailFraming(84.063)
    expect(f).toEqual({ rotation_deg: 84.06, offset_frac: TAIL_OFFSET })
    const c = frameCenter(head, f, 3.32)
    close(separation(head, c), 0.83, 1e-9)
    close(positionAngle(head, c), 84.06, 1e-6)
    expect(c.ra).toBeGreaterThan(head.ra)
    expect(headText(f, 84.063)).toBe('25% toward the sunward end')
    expect(headText({ rotation_deg: 84.06, offset_frac: 0.2 }, 84.063)).toBe(
      '20% toward the tail end',
    )
    expect(headText(centeredFraming(84.063), 84.063)).toBe('centered')
    expect(headText(null, 84.063)).toBe('centered')
    expect(headText({ rotation_deg: 10, offset_frac: -0.1 }, null)).toBe(
      '10% toward position angle 190°',
    )
    expect(frameCenter(head, null, 3.32)).toEqual(head)
  })

  it('draws the frame with its long side along the rotation', () => {
    const c = { ra: 321.9, dec: 4.85 }
    const corners = frameCorners(c, 84, 3.32, 2.22)
    expect(corners).toHaveLength(4)
    close(separation(corners[0], corners[1]), 2.22, 0.01)
    close(separation(corners[1], corners[2]), 3.32, 0.01)
    const front = {
      ra: (corners[0].ra + corners[1].ra) / 2,
      dec: (corners[0].dec + corners[1].dec) / 2,
    }
    close(positionAngle(c, front), 84, 0.2)
  })

  it('converts to and from the custom sliders', () => {
    expect(toCustom(tailFraming(84.06))).toEqual({ rotation: 84, offsetPct: -25 })
    expect(toCustom({ rotation_deg: 264.06, offset_frac: -0.25 })).toEqual({
      rotation: 84,
      offsetPct: 25,
    })
    expect(toCustom({ rotation_deg: 10, offset_frac: 0.9 })).toEqual({
      rotation: 10,
      offsetPct: 45,
    })
    expect(toCustom(null)).toEqual({ rotation: 0, offsetPct: 0 })
    expect(fromCustom({ rotation: 84, offsetPct: 25 })).toEqual({
      rotation_deg: 84,
      offset_frac: 0.25,
    })
    const flipped = fromCustom(toCustom({ rotation_deg: 264.06, offset_frac: -0.25 }))
    const a = frameCenter(head, flipped, 3.32)
    const b = frameCenter(head, { rotation_deg: 264.06, offset_frac: -0.25 }, 3.32)
    close(separation(a, b), 0, 0.02)
  })

  it('recognises the stored framing', () => {
    expect(modeOf(tailFraming(84.06), 84.063)).toBe('tail')
    expect(modeOf({ rotation_deg: 264.06, offset_frac: 0.25 }, 84.063)).toBe('tail')
    expect(modeOf(centeredFraming(84.06), 84.5)).toBe('center')
    expect(modeOf({ rotation_deg: 84, offset_frac: -0.1 }, 84)).toBe('custom')
    expect(modeOf({ rotation_deg: 120, offset_frac: -0.25 }, 84)).toBe('custom')
    expect(modeOf({ rotation_deg: 120, offset_frac: -0.25 }, null)).toBe('custom')
    expect(modeOf(null, 84)).toBeNull()
  })

  it('gives the NINA position angle and the re-centre interval', () => {
    expect(ninaPositionAngle(84.06)).toBe(174.1)
    expect(ninaPositionAngle(300)).toBe(30)
    const rate = Math.hypot(-292.5, 113.2) / 60
    const h = recenterHours(rate, 2.22)!
    close(h, (0.1 * 2.22 * 3600) / rate / 60, 1e-12)
    expect(hoursText(h)).toBe('2.5 h')
    expect(hoursText(0.4)).toBe('24 min')
    expect(hoursText(null)).toBe('not needed')
    expect(recenterHours(0, 2.22)).toBeNull()
  })

  it('keeps only dark rows above the horizon for the path', () => {
    const row = (dark: boolean, alt: number) => ({ dark, alt }) as BodyTrackRow
    expect(tonightPath([row(true, 10), row(false, 40), row(true, -2)])).toHaveLength(1)
  })

  it('fits the view around the head, the frame and the path', () => {
    const f = tailFraming(84.06)
    const c = frameCenter(head, f, 3.32)
    const v = previewView(
      head,
      c,
      { width_deg: 3.32, height_deg: 2.22, basis: '' },
      [{ ra: 320.68, dec: 5.06 }],
      4 / 3,
      project,
    )
    expect(v.center).toEqual(c)
    expect(v.fov).toBeGreaterThanOrEqual(3.32 * 1.5)
    expect(v.fov).toBeLessThanOrEqual(30)
  })

  it('adds the framing to every drafted target and leaves an unframed draft alone', () => {
    const draft = { project: { guid: 'p' }, targets: [{ guid: 't', designation: '161P' }] }
    expect(withFraming(draft, null)).toBe(draft)
    expect(withFraming(draft, tailFraming(84.06)).targets[0]).toEqual({
      guid: 't',
      designation: '161P',
      rotation_deg: 84.06,
      offset_frac: -0.25,
    })
  })
})
