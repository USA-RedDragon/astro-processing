import { describe, expect, it } from 'vitest'
import type { LightPoint } from '@/scheduler/api/discoveries'
import { candidate, run } from './fixtures/discoveries'
import {
  cards,
  chartOf,
  chipCounts,
  classLabel,
  decText,
  deltaText,
  edgeOf,
  inChip,
  links,
  matchText,
  movers,
  moverName,
  nextVetting,
  nightChoices,
  nightLabel,
  pillOf,
  raText,
  sourceWords,
  starText,
  statusText,
  summarize,
} from '@/scheduler/discoveries'

const light = (over: Partial<LightPoint> = {}): LightPoint => ({
  frame_id: 1,
  filter: 'Luminance',
  time: '2025-03-01T03:00:00Z',
  flux: 120,
  flux_err: 10,
  ...over,
})

describe('classes', () => {
  it('maps classes to edges and plain labels', () => {
    expect(edgeOf('known_variable')).toBe('known')
    expect(edgeOf('known_asteroid')).toBe('known')
    expect(edgeOf('known_transient')).toBe('known')
    expect(edgeOf('low_confidence')).toBe('low')
    expect(edgeOf('nova_candidate')).toBe('new')
    expect(edgeOf('supernova_candidate')).toBe('new')
    expect(edgeOf('new_variable_candidate')).toBe('new')
    expect(edgeOf('unknown_mover')).toBe('new')
    expect(classLabel('nova_candidate')).toBe('Possible nova')
    expect(classLabel('supernova_candidate')).toBe('Possible supernova')
    expect(classLabel('new_variable_candidate')).toBe('New variable?')
    expect(classLabel('known_transient')).toBe('Known transient')
  })

  it('gives a possible nova its own pill color and the supernova pill the edge color', () => {
    expect(pillOf('nova_candidate')).toEqual(['new', 'nova'])
    expect(pillOf('supernova_candidate')).toEqual(['new'])
    expect(pillOf('known_variable')).toEqual(['known'])
  })

  it('names the galaxy a possible nova or supernova sits in', () => {
    const m31 = [{ catalog: 'galaxy', name: 'M 31', sep_arcsec: 900 }]
    expect(matchText(candidate({ class: 'nova_candidate', matches: m31 }))).toBe('No catalogued star, inside M 31')
    expect(matchText(candidate({ class: 'supernova_candidate', matches: m31 }))).toBe('No catalogued star, inside M 31')
    expect(matchText(candidate({ class: 'nova_candidate', matches: [] }))).toBe('No catalogued star, inside a galaxy')
  })

  it('counts each chip', () => {
    const list = [
      candidate({ id: 1 }),
      candidate({ id: 2, class: 'low_confidence' }),
      candidate({ id: 3, class: 'supernova_candidate' }),
      candidate({ id: 4, class: 'new_variable_candidate', vetting: 'real' }),
      candidate({ id: 5, class: 'unknown_mover', kind: 'mover' }),
      candidate({ id: 6, class: 'known_variable', vetting: 'known' }),
      candidate({ id: 7, class: 'nova_candidate' }),
    ]
    expect(chipCounts(list)).toEqual({ all: 7, look: 3, known: 2, low: 1, vetted: 2 })
    expect(inChip(list[6]!, 'look')).toBe(true)
    expect(inChip(list[3]!, 'look')).toBe(false)
    expect(inChip(list[4]!, 'look')).toBe(true)
  })

  it('puts changes and unknown movers on cards, the rest of the movers in the table', () => {
    const list = [
      candidate({ id: 1, snr: 10 }),
      candidate({ id: 2, class: 'low_confidence', snr: 6.5 }),
      candidate({ id: 3, class: 'supernova_candidate', snr: 8 }),
      candidate({ id: 4, kind: 'mover', class: 'known_asteroid', body_v: 18.5 }),
      candidate({ id: 5, kind: 'mover', class: 'unknown_mover', body_v: null, snr: 7 }),
      candidate({ id: 6, kind: 'mover', class: 'known_asteroid', body_v: 17.5 }),
      candidate({ id: 7, snr: 30 }),
      candidate({ id: 8, class: 'nova_candidate', snr: 7.5 }),
    ]
    expect(cards(list).map((c) => c.id)).toEqual([3, 8, 5, 7, 1, 2])
    expect(movers(list).map((c) => c.id)).toEqual([5, 6, 4])
    expect(moverName(list[4]!)).toBe('Unknown')
    expect(moverName(candidate({ kind: 'mover', class: 'known_asteroid', matches: [{ catalog: 'SkyBoT', name: 'Randoross', sep_arcsec: 1.5 }] }))).toBe('Randoross')
  })
})

describe('magnitude text', () => {
  it('says brighter or fainter than the reference', () => {
    expect(deltaText(candidate({ delta_mag: -0.158 }), true)).toBe('0.16 mag brighter than the reference')
    expect(deltaText(candidate({ delta_mag: 0.33 }))).toBe('0.33 mag fainter')
    expect(deltaText(candidate({ delta_mag: 0.001 }))).toBe('no change')
  })

  it('falls back to the night magnitude, then to not measured', () => {
    expect(deltaText(candidate({ delta_mag: null, night_mag: 19.43 }))).toBe('new source, G≈19.4')
    expect(deltaText(candidate({ delta_mag: null, night_mag: null }))).toBe('not measured')
  })

  it('calls a change with nothing in the reference a new or faded source, not a magnitude change', () => {
    expect(deltaText(candidate({ delta_mag: -4.91, ref_mag: null, gaia_g: null, night_mag: 20.4 }))).toBe('new source, G≈20.4')
    expect(deltaText(candidate({ delta_mag: -1.3, ref_mag: null, gaia_g: null, night_mag: null }))).toBe('new source')
    expect(deltaText(candidate({ sign: -1, delta_mag: 1.66, ref_mag: null, gaia_g: null }))).toBe('faded source')
  })

  it('names the catalogued star or says there is none', () => {
    expect(starText(candidate({ gaia_g: 15.912 }))).toBe('Gaia G 15.91')
    expect(starText(candidate({ gaia_g: null }))).toBe('no catalogued star')
  })
})

describe('positions', () => {
  it('formats RA and Dec with seconds', () => {
    expect(raText(189.30894)).toBe('12h 37m 14.1s')
    expect(decText(14.44218)).toBe('+14° 26′ 32″')
    expect(decText(-5.39)).toBe('−05° 23′ 24″')
    expect(raText(359.99999)).toBe('00h 00m 00.0s')
    expect(decText(22.99999)).toBe('+23° 00′ 00″')
  })

  it('builds the outside links in decimal degrees', () => {
    const l = links(189.30894, -14.5)
    expect(l.aladin).toBe('https://aladin.cds.unistra.fr/AladinLite/?target=189.30894%20-14.5&fov=0.1')
    expect(l.vsx).toBe(
      'https://www.aavso.org/vsx/index.php?view=results.submit1&ql=1&coords=189.30894+-14.5&format=d&size=10&unit=3',
    )
    expect(l.simbad).toBe(
      'https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=189.30894+-14.5&Radius=10&Radius.unit=arcsec',
    )
  })
})

describe('vetting', () => {
  it('sets a state and clears it when clicked again', () => {
    expect(nextVetting('', 'real')).toBe('real')
    expect(nextVetting('real', 'artifact')).toBe('artifact')
    expect(nextVetting('artifact', 'artifact')).toBe('')
  })
})

describe('summary', () => {
  it('sums subs over the runs and takes the best depth', () => {
    const runs = [
      run({ id: 1, night_subs: 16, ref_subs: 48, depth: 20.2 }),
      run({ id: 2, group: 'H-a', night_subs: 10, ref_subs: 30, depth: 19.1 }),
      run({ id: 3, state: 'running', night_subs: 99, ref_subs: 99, depth: 25 }),
    ]
    const list = [
      candidate({ class: 'supernova_candidate' }),
      candidate({ class: 'nova_candidate' }),
      candidate({ class: 'known_asteroid', kind: 'mover' }),
      candidate({ class: 'unknown_mover', kind: 'mover', vetting: 'artifact' }),
    ]
    expect(summarize(runs, list)).toEqual({
      look: 2,
      knownVariables: 0,
      low: 0,
      knownAsteroids: 1,
      unknownMovers: 1,
      nightSubs: 26,
      refSubs: 78,
      depth: 20.2,
    })
    expect(summarize([run({ depth: null })], []).depth).toBeNull()
  })

  it('names what was checked in plain words', () => {
    expect(sourceWords(['VSX', 'SkyBoT', 'ALeRCE', 'Fink', 'TNS', 'galaxies'])).toEqual([
      'variable-star catalog',
      'known asteroids',
      'alert feeds',
      'galaxy catalog',
    ])
  })

  it('labels nights and keeps an asked-for night in the list', () => {
    expect(nightLabel('2025-02-28')).toBe('Feb 28 2025')
    const nights = [
      { night: '2025-03-02', runs: 1, candidates: 1, new: 0 },
      { night: '2025-02-27', runs: 1, candidates: 1, new: 0 },
    ]
    expect(nightChoices(nights, '2025-02-28')).toEqual(['2025-03-02', '2025-02-28', '2025-02-27'])
  })

  it('shows the running comparison only', () => {
    expect(statusText({ state: 'running', object: 'M 31', night: '2026-10-13', stage: 'saving', queued: 0, done_in_pass: 0 })).toBe(
      'Comparing M 31 Oct 13 2026: saving',
    )
    expect(statusText({ state: 'idle', queued: 0, done_in_pass: 0 })).toBe('')
  })
})

describe('per-sub chart', () => {
  it('plots measured magnitude changes only, brighter up, with error bars', () => {
    const c = chartOf([
      light({ frame_id: 1, time: '2025-03-01T03:00:00Z', delta_mag: -0.2, mag_err: 0.05 }),
      light({ frame_id: 2, time: '2025-03-01T04:00:00Z', delta_mag: null }),
      light({ frame_id: 3, time: '2025-03-01T05:00:00Z', delta_mag: 0.1, mag_err: 0.02 }),
    ])!
    expect(c.mode).toBe('delta')
    expect(c.points).toHaveLength(2)
    const [a, b] = c.points
    expect(a!.x).toBe(c.left)
    expect(b!.x).toBe(c.right)
    expect(a!.y).toBeLessThan(c.refY)
    expect(b!.y).toBeGreaterThan(c.refY)
    expect(a!.hi - a!.lo).toBeGreaterThan(b!.hi - b!.lo)
    expect(a!.lo).toBeLessThan(a!.y)
    expect(a!.hi).toBeGreaterThan(a!.y)
    expect(c.filters).toEqual([])
    expect(a!.colour).toBe('currentColor')
  })

  it('falls back to flux when no sub has a magnitude change', () => {
    const c = chartOf([
      light({ time: '2025-03-01T03:00:00Z', flux: 50, flux_err: 5 }),
      light({ time: '2025-03-01T04:00:00Z', flux: -20, flux_err: 5 }),
    ])!
    expect(c.mode).toBe('flux')
    expect(c.points[0]!.y).toBeLessThan(c.refY)
    expect(c.points[1]!.y).toBeGreaterThan(c.refY)
  })

  it('colours points by filter when there is more than one', () => {
    const c = chartOf([
      light({ filter: 'Red', time: '2025-03-01T03:00:00Z', delta_mag: 0.1 }),
      light({ filter: 'Blue', time: '2025-03-01T04:00:00Z', delta_mag: 0.2 }),
    ])!
    expect(c.points.map((p) => p.colour)).toEqual(['var(--red)', 'var(--blue)'])
    expect(c.filters.map((f) => f.name)).toEqual(['Red', 'Blue'])
  })

  it('draws nothing without measurements', () => {
    expect(chartOf([])).toBeNull()
    expect(chartOf(null)).toBeNull()
  })
})
