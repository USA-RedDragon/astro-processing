import { describe, expect, it } from 'vitest'
import { frameToView, maskRect, pctLabel, viewToFrame } from '../../src/scheduler/faintmask'

const crop = {
  x: 0.002560819462227913,
  y: 0.011494252873563218,
  w: 0.9846350832266325,
  h: 0.9770114942528736,
}
const mask = { width: 1562, height: 1044, bin: 4, frame_width: 6248, frame_height: 4176 }

describe('faint signal mask geometry', () => {
  it('round-trips region points through the preview crop', () => {
    const p = { x: 0.31, y: 0.77 }
    const back = viewToFrame(frameToView(p, crop), crop)
    expect(back.x).toBeCloseTo(p.x, 12)
    expect(back.y).toBeCloseTo(p.y, 12)
    expect(frameToView({ x: crop.x, y: crop.y }, crop)).toEqual({ x: 0, y: 0 })
  })

  it('treats a missing crop as the whole frame', () => {
    expect(viewToFrame({ x: 0.25, y: 0.5 }, undefined)).toEqual({ x: 0.25, y: 0.5 })
    const r = maskRect(mask, null, 1000, 668)!
    expect([r.x + 0, r.y + 0, r.width, r.height]).toEqual([0, 0, 1000, 668])
  })

  it('places the binned mask on the frame, not on the cropped preview', () => {
    const r = maskRect(mask, crop, 1000, 663)!
    expect(r.x).toBeCloseTo((-crop.x / crop.w) * 1000, 9)
    expect(r.y).toBeCloseTo((-crop.y / crop.h) * 663, 9)
    expect(r.width).toBeCloseTo(1000 / crop.w, 9)
    expect(r.height).toBeCloseTo(663 / crop.h, 9)
  })

  it('leaves out the frame edge the 4x4 bins do not cover', () => {
    const r = maskRect({ ...mask, width: 1561, frame_width: 6247 }, null, 1000, 668)!
    expect(r.width).toBeCloseTo((1561 * 4 * 1000) / 6247, 9)
  })

  it('rejects an empty mask', () => {
    expect(maskRect({ ...mask, width: 0 }, crop, 1000, 663)).toBeNull()
  })

  it('formats percentages', () => {
    expect(pctLabel(0)).toBe('0%')
    expect(pctLabel(0.04)).toBe('<0.1%')
    expect(pctLabel(6.838)).toBe('6.8%')
    expect(pctLabel(27.97)).toBe('28%')
  })
})
