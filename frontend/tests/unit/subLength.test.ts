import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  candidateText,
  lengthsNote,
  reviewLengths,
  compactLengths,
  pickLengthView,
  planLengthView,
  publishText,
  siteLengthView,
} from '@/scheduler/subLength'
import { getSubLengths, type SubLengthResult, type SubLengthRow } from '@/scheduler/api/sublength'

function row(over: Partial<SubLengthRow>): SubLengthRow {
  return {
    target_guid: 'g-1',
    target: 'M 31',
    objects: ['M 31'],
    object: 'M 31',
    project: 'M 31',
    filter: 'H-a',
    gain: 100,
    offset: 50,
    bucket: 'dark',
    exposure: 300,
    ideal: 300,
    current: 600,
    sky_limited: 212,
    sky_rate: 0.41,
    sky_subs: 64,
    sky_source: 'this target',
    read_noise_e: 1.6,
    e_per_adu: 0.25,
    overhead: 13.5,
    saturation_cap: 0.02,
    snr_rate_change: 0.012,
    ideal_snr_rate_gain: 0,
    candidates: [
      {
        exposure: 300,
        darks: true,
        read_noise_share: 0.96,
        duty_cycle: 0.957,
        kept: 0.98,
        efficiency: 0.9,
        sky_to_read_noise: 6.9,
        saturated_share: 0.004,
        relative_snr_rate: 1.012,
      },
    ],
    basis: 'Sky 0.41 e⁻/s per pixel (median of 64 subs, this target).',
    ...over,
  }
}

function result(over: Partial<SubLengthResult>): SubLengthResult {
  return { computed_at: '2026-10-11T03:00:00Z', mode: 'on', rows: [], site: [], ...over }
}

const plan = { filter: 'H-a', gain: 100, exposure: 600, exposureRaw: -1 }

describe('planLengthView', () => {
  it('says chosen automatically with the buckets in glare order when publishing is on', () => {
    const rows = [
      row({ bucket: 'mid', exposure: 120 }),
      row({ bucket: 'dark', exposure: 300 }),
      row({ bucket: 'low', exposure: 180 }),
      row({ bucket: 'bright', exposure: 60 }),
    ]
    const v = planLengthView({ result: result({ rows }), error: '' }, plan, 'g-1')
    expect(v.state).toBe('auto')
    expect(v.compact).toBe('300 s (dark) / 180 s (low) / 120 s (mid) / 60 s (bright)')
    expect(v.text).toBe(
      'Chosen automatically: 300 s (dark) / 180 s (low) / 120 s (mid) / 60 s (bright) because each is the shortest length with a full dark set within 5% of the best SNR per hour for the sky measured on this target.',
    )
  })

  it('names the buckets that still fall back to the template', () => {
    const v = planLengthView({ result: result({ rows: [row({})] }), error: '' }, plan, 'g-1')
    expect(v.text).toContain('300 s (dark) because it is')
    expect(v.text).toContain(
      'low, mid, bright are not measured yet, so the template length (600 s) is used there.',
    )
  })

  it('says would be chosen and keeps the template length while publishing is off or a dry run', () => {
    for (const mode of ['off', 'dry-run'] as const) {
      const v = planLengthView({ result: result({ mode, rows: [row({})] }), error: '' }, plan, 'g-1')
      expect(v.state).toBe('would')
      expect(v.text).toMatch(/^Would be chosen automatically: 300 s \(dark\) because/)
      expect(v.text).toContain('until publishing is on, the template length (600 s) is used.')
    }
  })

  it("names the plan's own length when the plan overrides the template", () => {
    const v = planLengthView(
      { result: result({ mode: 'off', rows: [row({})] }), error: '' },
      { ...plan, exposureRaw: 600 },
      'g-1',
    )
    expect(v.text).toContain("the plan's length (600 s) is used")
  })

  it('says not measured yet when the route 404s', () => {
    const v = planLengthView({ result: null, error: '' }, plan, 'g-1')
    expect(v.state).toBe('unmeasured')
    expect(v.parts).toEqual([])
    expect(v.text).toBe(
      'Chosen automatically once measured; not measured yet; the template length (600 s) is used until then.',
    )
  })

  it('says not measured yet when nothing matches, and keeps the stacker reason', () => {
    const v = planLengthView(
      {
        result: result({ rows: [row({ target_guid: 'other' }), row({ gain: 0 })], reason: 'no site' }),
        error: '',
      },
      plan,
      'g-1',
    )
    expect(v.state).toBe('unmeasured')
    expect(v.note).toBe('The stacker says: no site.')
  })

  it('falls back to the site rows for a target with no rows of its own, without claiming they are used', () => {
    const site = [
      row({ target_guid: '', sky_source: 'every target at this site', exposure: 600 }),
      row({ target_guid: '', sky_source: 'every target at this site', filter: 'O-III' }),
    ]
    const v = planLengthView({ result: result({ site }), error: '' }, plan, 'g-1')
    expect(v.state).toBe('site')
    expect(v.compact).toBe('600 s (dark)')
    expect(v.text).toBe(
      'Not computed for this target yet. From the sky at this site it would be 600 s (dark) because it is the shortest length with a full dark set within 5% of the best SNR per hour for the sky measured on every target at this site; the template length (600 s) is used until then.',
    )
  })

  it('matches filter names loosely and keeps one gain', () => {
    const rows = [row({ filter: 'Ha', gain: 100 }), row({ filter: 'H-a', gain: 0, bucket: 'low' })]
    const v = planLengthView({ result: result({ rows }), error: '' }, { ...plan, gain: null }, 'g-1')
    expect(v.parts.map((p) => p.bucket)).toEqual(['dark'])
  })

  it('drops rows with no recommendation', () => {
    const v = planLengthView({ result: result({ rows: [row({ exposure: 0 })] }), error: '' }, plan, 'g-1')
    expect(v.state).toBe('unmeasured')
  })
})

describe('pickLengthView', () => {
  const lengths = [
    { gain: 100, bucket: 'low' as const, exposure: 180, basis: 'low basis' },
    { gain: 100, bucket: 'dark' as const, exposure: 300, basis: 'dark basis' },
  ]

  it('uses the pick lengths and finds candidates on the matching site row', () => {
    const site = [row({ target_guid: '', basis: 'dark basis', sky_source: 'every target at this site' })]
    const v = pickLengthView(
      { result: result({ site }), error: '' },
      { automatic: true, lengths, lengthBasis: 'Chosen automatically per moon glare.' },
      600,
    )
    expect(v.state).toBe('auto')
    expect(v.compact).toBe('300 s (dark) / 180 s (low)')
    expect(v.parts[0]!.candidates).toHaveLength(1)
    expect(v.parts[1]!.candidates).toHaveLength(0)
    expect(v.note).toBe('Chosen automatically per moon glare.')
    expect(v.text).toContain('mid, bright are not measured yet, so the template length (600 s) is used there.')
  })

  it('says would be chosen when the pick is not automatic', () => {
    const v = pickLengthView(null, { automatic: false, lengths, lengthBasis: '' }, 300)
    expect(v.state).toBe('would')
    expect(v.text).toContain('until publishing is on, the template length (300 s) is used.')
  })

  it('says not measured yet for a pick from a stacker without lengths', () => {
    const v = pickLengthView({ result: null, error: '' }, {}, 300)
    expect(v.state).toBe('unmeasured')
    expect(v.text).toBe(
      'Chosen automatically once measured; not measured yet; the template length (300 s) is used until then.',
    )
  })

  it('leaves the length out when the template length is unknown', () => {
    const v = pickLengthView(null, {}, null)
    expect(v.text).toBe(
      'Chosen automatically once measured; not measured yet; the template length is used until then.',
    )
  })
})

describe('siteLengthView and publishText', () => {
  it('reads site rows by template filter and gain', () => {
    const site = [row({ target_guid: '', bucket: 'low', exposure: 180 })]
    const s = { result: result({ mode: 'dry-run', site }), error: '' }
    expect(siteLengthView(s, 'H-a', 100, 600).compact).toBe('180 s (low)')
    expect(siteLengthView(s, 'H-a', 0, 600).state).toBe('unmeasured')
    expect(siteLengthView(s, 'H-α', 100, 600).compact).toBe('180 s (low)')
    expect(siteLengthView(null, 'H-a', 100, 600).state).toBe('unmeasured')
  })

  it('describes each publishing mode and the missing route', () => {
    expect(publishText({ result: null, error: '' })).toContain('not measured yet')
    expect(publishText({ result: null, error: 'boom' })).toContain('(boom)')
    expect(publishText({ result: result({ mode: 'on' }), error: '' })).toMatch(/^Publishing is on/)
    expect(publishText({ result: result({ mode: 'off' }), error: '' })).toMatch(/^Publishing is off/)
    expect(publishText({ result: result({ mode: 'dry-run' }), error: '' })).toMatch(/dry run/)
  })

  it('formats lengths and candidates from the measured values only', () => {
    expect(compactLengths([{ bucket: 'dark', exposure: 299.96 }])).toBe('300 s (dark)')
    expect(
      compactLengths([
        { bucket: 'dark', exposure: 300 },
        { bucket: 'low', exposure: 120 },
        { bucket: 'mid', exposure: 120 },
        { bucket: 'bright', exposure: 300 },
      ]),
    ).toBe('300 s (dark) / 120 s (low, mid) / 300 s (bright)')
    expect(candidateText(row({}).candidates![0]!)).toBe(
      '94.9% of ideal SNR per hour · full dark set · 0.4% of stars saturated',
    )
    expect(
      candidateText({ ...row({}).candidates![0]!, darks: false, saturated_share: null, blocked: 'saturates' }),
    ).toBe('94.9% of ideal SNR per hour · no dark set · not used: saturates')
  })
})

describe('getSubLengths', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('treats a 404 as not measured and other failures as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('404 page not found', { status: 404 })))
    expect(await getSubLengths({ target_guid: 'g' })).toEqual({ result: null, error: '' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'no scheduler database' }), { status: 503 })),
    )
    expect(await getSubLengths()).toEqual({ result: null, error: 'no scheduler database' })
  })

  it('asks for one target', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(result({})), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const s = await getSubLengths({ target_guid: 'g-1' })
    expect(s.result?.mode).toBe('on')
    expect((f.mock.calls[0] as unknown[])[0]).toBe('/api/v1/sublength?target_guid=g-1')
  })
})

describe('review summary', () => {
  const auto = planLengthView({ result: result({ rows: [row({})] }), error: '' }, plan, 'g-1')
  const would = planLengthView({ result: result({ mode: 'off', rows: [row({})] }), error: '' }, plan, 'g-1')
  const none = planLengthView({ result: null, error: '' }, plan, 'g-1')

  it('lists lengths only where measured and says which length is used', () => {
    expect(reviewLengths([{ name: 'H-a', view: auto }, { name: 'O-III', view: none }])).toBe(
      'H-a (300 s (dark)), O-III. Sub lengths are chosen automatically per moon glare where the sky is measured, and the template length is used elsewhere.',
    )
    expect(lengthsNote([would, none])).toMatch(/^Sub lengths would be chosen automatically/)
    expect(lengthsNote([none])).toMatch(/not measured yet/)
    expect(lengthsNote([])).toBe('')
    expect(reviewLengths([])).toBe('')
  })
})
