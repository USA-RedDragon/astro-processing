import { describe, expect, test } from 'vitest';
import { apply, autoStretch, mtf, normalize, parseLinear, stats, TARGET_BACKGROUND } from '@/lib/stretch';

function linear(width: number, height: number, values: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(12 + values.length * 4);
  const view = new DataView(buf);
  'APLP'.split('').forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
  view.setUint32(4, width, true);
  view.setUint32(8, height, true);
  values.forEach((v, i) => view.setFloat32(12 + i * 4, v, true));
  return buf;
}

// A deterministic noisy sky around 0.01 with σ 0.0005.
function sky(n: number): Float32Array {
  const out = new Float32Array(n);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 12; k++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      s += seed / 2147483648;
    }
    out[i] = 0.01 + 0.0005 * (s - 6);
  }
  return out;
}

describe('parseLinear', () => {
  test('reads the header and samples', () => {
    const img = parseLinear(linear(3, 2, [0, 0.25, 0.5, 1, 0.75, 0.125]));
    expect(img.width).toBe(3);
    expect(img.height).toBe(2);
    expect(Array.from(img.data)).toEqual([0, 0.25, 0.5, 1, 0.75, 0.125]);
  });

  test('rejects other formats and truncated data', () => {
    const bad = linear(1, 1, [0]);
    new DataView(bad).setUint8(0, 'X'.charCodeAt(0));
    expect(() => parseLinear(bad)).toThrow(/not a linear preview/);
    expect(() => parseLinear(linear(4, 4, [1, 2]))).toThrow(/truncated/);
  });
});

describe('stretch', () => {
  test('mtf matches PixInsight', () => {
    expect(mtf(0.5, 0.3)).toBeCloseTo(0.3);
    expect(mtf(0.25, 0.25)).toBe(0.5);
    expect(mtf(0.1, -1)).toBe(0);
    expect(mtf(0.1, 2)).toBe(1);
  });

  test('auto-stretch puts the median at the target background', () => {
    const data = sky(50_000);
    const s = stats(data);
    expect(s.median).toBeCloseTo(0.01, 4);
    expect(s.madn).toBeGreaterThan(0.0003);
    expect(s.madn).toBeLessThan(0.0007);
    expect(apply(s.median, autoStretch(s))).toBeCloseTo(TARGET_BACKGROUND, 2);
  });

  test('stats ignore pixels no sub covered', () => {
    const data = sky(1000);
    const withBorder = new Float32Array(2000);
    withBorder.set(data, 1000);
    expect(stats(withBorder).median).toBeCloseTo(stats(data).median, 6);
  });

  test('normalize centres on the median in units of σ', () => {
    const data = sky(20_000);
    const s = stats(data);
    const n = normalize(data, s);
    const ns = stats(n);
    expect(Math.abs(ns.median)).toBeLessThan(0.05);
    expect(ns.madn).toBeCloseTo(1, 1);
  });
});
