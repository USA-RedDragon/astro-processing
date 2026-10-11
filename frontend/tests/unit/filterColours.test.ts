import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, '../../src/styles/scheduler.css'), 'utf8')
const FILTERS = ['ha', 'oiii', 'sii', 'lum', 'red', 'green', 'blue']

type Rgb = [number, number, number]

function block(selector: string): string {
  const start = css.indexOf(selector + ' {')
  return css.slice(start, css.indexOf('}', start))
}

function tokens(text: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {}
  for (const m of text.matchAll(/--(\w+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g))
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return out
}

function linear([l, c, h]: [number, number, number]): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

function oklab([r, g, b]: Rgb): Rgb {
  const cbrt = Math.cbrt
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const MACHADO: Record<string, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

const enc = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
const dec = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)

function simulate(rgb: Rgb, kind: string): Rgb {
  const m = MACHADO[kind]
  if (!m) return rgb
  const s = rgb.map(enc)
  return m.map((row) => dec(Math.min(1, Math.max(0, row[0] * s[0] + row[1] * s[1] + row[2] * s[2])))) as Rgb
}

function distance(a: Rgb, b: Rgb): number {
  const x = oklab(a)
  const y = oklab(b)
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

const light = tokens(block(':root'))
const themes = { light, dark: { ...light, ...tokens(block('.dark')) } }

describe('filter colours', () => {
  for (const [theme, t] of Object.entries(themes)) {
    it(`keeps every filter apart in the ${theme} theme, also with colour-blind vision`, () => {
      for (const kind of ['normal', 'protan', 'deutan', 'tritan']) {
        for (let i = 0; i < FILTERS.length; i++)
          for (let j = i + 1; j < FILTERS.length; j++) {
            const a = FILTERS[i]
            const b = FILTERS[j]
            const d = distance(simulate(linear(t[a]), kind), simulate(linear(t[b]), kind))
            expect(d, `${theme} ${kind} ${a}/${b}`).toBeGreaterThan(kind === 'normal' ? 15 : 6.5)
          }
      }
    })
  }
})
