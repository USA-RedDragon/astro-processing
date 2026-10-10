import type { Point } from './api/planning'

export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 }

function usable(c?: Crop | null): Crop {
  return c && c.w > 0 && c.h > 0 ? c : FULL
}

export function frameToView(p: Point, crop?: Crop | null): Point {
  const c = usable(crop)
  return { x: (p.x - c.x) / c.w, y: (p.y - c.y) / c.h }
}

export function viewToFrame(p: Point, crop?: Crop | null): Point {
  const c = usable(crop)
  return { x: c.x + p.x * c.w, y: c.y + p.y * c.h }
}

export function maskRect(
  mask: { width: number; height: number; bin: number; frame_width: number; frame_height: number },
  crop: Crop | null | undefined,
  viewW: number,
  viewH: number,
): Rect | null {
  if (!(mask.frame_width > 0 && mask.frame_height > 0 && mask.width > 0 && mask.height > 0)) {
    return null
  }
  const c = usable(crop)
  const fw = (mask.width * mask.bin) / mask.frame_width
  const fh = (mask.height * mask.bin) / mask.frame_height
  return {
    x: (-c.x / c.w) * viewW,
    y: (-c.y / c.h) * viewH,
    width: (fw / c.w) * viewW,
    height: (fh / c.h) * viewH,
  }
}

export function pctLabel(v: number): string {
  if (!(v > 0)) return '0%'
  if (v < 0.1) return '<0.1%'
  return (v < 10 ? v.toFixed(1) : v.toFixed(0)) + '%'
}
