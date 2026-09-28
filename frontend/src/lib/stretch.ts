// Palette mixing works on the stacker's linear previews: small float32
// images that line up pixel for pixel across a target's filters.

// PixInsight's STF auto-stretch defaults, matching the stacker's previews.
export const SHADOWS_CLIP = -2.8;
export const TARGET_BACKGROUND = 0.25;
const MAD_TO_SIGMA = 1.4826;

export interface LinearImage {
  width: number;
  height: number;
  data: Float32Array;
}

// parseLinear reads the stacker's linear preview format: "APLP", then
// little-endian uint32 width and height, then width×height float32 samples.
export function parseLinear(buf: ArrayBuffer): LinearImage {
  const view = new DataView(buf);
  const magic = String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(i)));
  if (magic !== 'APLP') {
    throw new Error(`not a linear preview (magic ${JSON.stringify(magic)})`);
  }
  const width = view.getUint32(4, true);
  const height = view.getUint32(8, true);
  if (buf.byteLength < 12 + width * height * 4) {
    throw new Error('linear preview is truncated');
  }
  // Copy out of the header offset: Float32Array needs 4-byte alignment.
  const data = new Float32Array(buf.slice(12, 12 + width * height * 4));
  return { width, height, data };
}

// mtf is PixInsight's midtones transfer function.
export function mtf(m: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x === m) return 0.5;
  return ((m - 1) * x) / ((2 * m - 1) * x - m);
}

export interface Stats {
  median: number;
  madn: number; // MAD scaled to σ
}

// stats estimates the median and σ of the non-zero samples from a strided
// sample; zeros are pixels no sub covered.
export function stats(data: Float32Array, maxSamples = 200_000): Stats {
  const stride = Math.max(1, Math.floor(data.length / maxSamples));
  const sample: number[] = [];
  for (let i = 0; i < data.length; i += stride) {
    const v = data[i] ?? 0;
    if (v !== 0 && Number.isFinite(v)) sample.push(v);
  }
  if (sample.length === 0) return { median: 0, madn: 0 };
  sample.sort((a, b) => a - b);
  const median = sample[Math.floor(sample.length / 2)] ?? 0;
  const dev = sample.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  return { median, madn: (dev[Math.floor(dev.length / 2)] ?? 0) * MAD_TO_SIGMA };
}

export interface StretchParams {
  shadows: number;
  midtones: number;
}

// autoStretch computes STF parameters: shadows clipped at median + clip·σ,
// midtones chosen so the median lands at TARGET_BACKGROUND.
export function autoStretch(s: Stats, max = 1): StretchParams {
  const shadows = Math.min(Math.max(s.median + SHADOWS_CLIP * s.madn, 0), max);
  const span = max - shadows || 1;
  return { shadows, midtones: mtf(TARGET_BACKGROUND, (s.median - shadows) / span) };
}

// apply stretches one sample to 0-1.
export function apply(v: number, p: StretchParams, max = 1): number {
  const span = max - p.shadows || 1;
  return mtf(p.midtones, (v - p.shadows) / span);
}

// normalize returns a copy scaled so the median is 0 and σ is 1, which lets
// filters with very different levels be blended fairly.
export function normalize(data: Float32Array, s: Stats): Float32Array {
  const out = new Float32Array(data.length);
  const scale = s.madn > 0 ? 1 / s.madn : 1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? 0;
    out[i] = v === 0 ? 0 : (v - s.median) * scale;
  }
  return out;
}
