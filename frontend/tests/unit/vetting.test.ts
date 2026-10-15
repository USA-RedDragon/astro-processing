import { describe, expect, it } from 'vitest'
import type { SourceChecks, VetChart } from '@/scheduler/api/discoveries'
import {
  bandOf,
  checkedText,
  decimalsOf,
  isActive,
  nearest,
  pendingText,
  plotOf,
  PLOT,
  reportOffer,
  runLine,
  savedText,
  statusOf,
  tallyText,
  tipText,
  toneOf,
  verdictLabel,
  xTickText,
} from '@/scheduler/vetting'
import andromedaJson from './fixtures/checksAndromeda.json'
import cygnusJson from './fixtures/checksCygnus.json'

const andromeda = andromedaJson as unknown as SourceChecks
const cygnus = cygnusJson as unknown as SourceChecks

describe('verdict', () => {
  it('labels the suggestion with its confidence', () => {
    expect(verdictLabel(andromeda.report!.suggestion)).toBe('Suggested verdict · High confidence')
    expect(verdictLabel({ ...andromeda.report!.suggestion, confidence: 'low' })).toBe(
      'Suggested verdict · Low confidence',
    )
    expect(verdictLabel(null)).toBe('Your verdict')
  })

  it('colors the box by the suggested state', () => {
    expect(toneOf(andromeda.report!.suggestion)).toBe('new')
    expect(toneOf(cygnus.report!.suggestion)).toBe('nova')
    expect(toneOf(null)).toBe('')
  })

  it('says the suggestion is not saved until the user picks', () => {
    expect(savedText('', true)).toBe(
      'Not vetted yet. The suggestion is not saved until you pick one.',
    )
    expect(savedText('', false)).toBe('Not vetted yet.')
    expect(savedText('real', true)).toBe('Saved as Real.')
    expect(savedText('known', true)).toBe('Saved as Already known.')
  })

  it('offers a report draft only when the checks call it real', () => {
    const src = { kind: 'change' as const, class: 'new_variable_candidate' as const }
    expect(reportOffer(andromeda.report!.suggestion, src)).toEqual({
      link: 'Report draft (VSX form)',
    })
    expect(
      reportOffer(andromeda.report!.suggestion, { kind: 'change', class: 'nova_candidate' }),
    ).toEqual({ link: 'Report draft (TNS form)' })
    expect(reportOffer(cygnus.report!.suggestion, src)).toEqual({
      off: 'Report draft: not offered for artifacts',
    })
    expect(reportOffer({ ...cygnus.report!.suggestion, state: 'unsure' }, src)).toBeNull()
    expect(reportOffer(null, src)).toBeNull()
  })
})

describe('checks', () => {
  it('counts each group, leaving out zeros', () => {
    const g = andromeda.report!.groups!
    expect(g.map((x) => tallyText(x.checks))).toEqual([
      '4 not run',
      '3 pass',
      '5 pass · 3 not run',
      '4 pass · 1 not run',
      '1 pass',
    ])
    expect(tallyText(cygnus.report!.groups![0]!.checks)).toBe('1 fail · 3 not run')
    expect(tallyText([])).toBe('')
  })

  it('treats an unknown status as not run', () => {
    expect(statusOf('pass')).toBe('pass')
    expect(statusOf('fail')).toBe('fail')
    expect(statusOf('skip')).toBe('skip')
    expect(statusOf('maybe')).toBe('skip')
  })

  it('names the surveys still being fetched', () => {
    expect(pendingText(andromeda.report!.pending)).toBe('Still fetching: ATLAS, NEOWISE.')
    expect(pendingText(undefined)).toBe('')
    expect(pendingText([])).toBe('')
  })
})

describe('run state', () => {
  const base = { source_id: 2, report: null, error: '', requested_at: null, finished_at: null }

  it('says where the run stands without inventing anything', () => {
    expect(runLine({ ...base, state: 'none' })).toEqual({
      kind: 'none',
      text: 'Automatic checks have not run yet.',
    })
    expect(runLine({ ...base, state: 'queued' }).text).toBe('Checks are running.')
    expect(runLine({ ...base, state: 'running' }).kind).toBe('running')
    expect(runLine({ ...andromeda, state: 'running' }).kind).toBe('rerunning')
    expect(runLine({ ...base, state: 'failed', error: 'ZTF did not answer' }).text).toBe(
      'The checks did not finish: ZTF did not answer',
    )
    expect(runLine({ ...base, state: 'failed' }).text).toBe('The checks did not finish.')
    expect(runLine(andromeda).text).toMatch(/^Checked \w{3} \d+ \w{3} at \d\d:\d\d \w+\.$/)
  })

  it('polls only while queued or running', () => {
    expect(isActive({ ...base, state: 'queued' })).toBe(true)
    expect(isActive({ ...base, state: 'running' })).toBe(true)
    expect(isActive(andromeda)).toBe(false)
    expect(isActive({ ...base, state: 'failed' })).toBe(false)
    expect(isActive(null)).toBe(false)
  })

  it('says when the checks ran in site time', () => {
    expect(checkedText('2026-10-14T02:14:31Z')).toBe('Checked Tue 13 Oct at 21:14 CDT.')
    expect(checkedText(null)).toBe('')
  })
})

describe('charts', () => {
  const own = andromeda.report!.charts![0]!
  const fold = andromeda.report!.charts![1]!
  const years = cygnus.report!.charts![1]!

  it('writes the hover text in the units of each chart', () => {
    expect(tipText(own, own.points![0]!)).toBe('−39 min: 0.188 mag fainter, ±0.010')
    expect(tipText(own, { x: 0.2, y: 0.302, err: 0.009 })).toBe(
      '+12 min: 0.302 mag fainter, ±0.009',
    )
    expect(tipText(own, { x: 0, y: -0.05 })).toBe('0 min: 0.050 mag brighter')
    expect(tipText(fold, { x: 0.5023, y: 0.291 })).toBe('cycle 0.502: 0.291 mag fainter')
    expect(tipText(years, { x: 2019.486, y: 17.9898 })).toBe('2019.49: r 17.99')
    expect(tipText({ ...years, title: 'Brightness by year' }, { x: 2020, y: 18 })).toBe(
      '2020.00: 18.00 mag',
    )
  })

  it('reads the band from the title', () => {
    expect(bandOf('ZTF r over seven years')).toBe('r')
    expect(bandOf('ZTF r, folded on 9.98715 days')).toBe('r')
    expect(bandOf('ATLAS o over two years')).toBe('o')
    expect(bandOf('Your night, Oct 11')).toBe('')
  })

  it('labels ticks with as few decimals as they need', () => {
    expect(decimalsOf([0, 0.1, 0.2])).toBe(1)
    expect(decimalsOf([-0.25, 0, 0.25])).toBe(2)
    expect(decimalsOf([2018, 2020])).toBe(0)
    expect(xTickText('hours', -0.5, 1)).toBe('−0.5 h')
    expect(xTickText('hours', 0, 1)).toBe('0 h')
    expect(xTickText('hours', 1, 1)).toBe('+1 h')
    expect(xTickText('phase', -0.25, 2)).toBe('−0.25')
    expect(xTickText('phase', 0, 2)).toBe('0')
    expect(xTickText('year', 2024, 0)).toBe('2024')
  })

  it('puts y0 at the top so fainter is lower', () => {
    const p = plotOf(own)!
    const { L, R, T, H, B, W } = PLOT
    expect(p.yTicks.map((t) => t.label)).toEqual(['0.0', '0.1', '0.2', '0.3', '0.4'])
    expect(p.yTicks[0]!.y).toBeLessThan(p.yTicks[4]!.y)
    expect(p.xTicks.map((t) => t.label)).toEqual(['−0.5 h', '0 h', '+0.5 h', '+1 h', '+1.5 h'])
    expect(p.vref).toBeCloseTo(L + (0.9 / 2.9) * (W - L - R))
    expect(p.points).toHaveLength(28)
    const first = p.points[0]!
    expect(first.cy).toBeCloseTo(T + ((0.1879 + 0.05) / 0.47) * (H - T - B))
    expect(first.e1!).toBeLessThan(first.cy)
    expect(first.e2!).toBeGreaterThan(first.cy)
    expect(p.path.startsWith('M')).toBe(true)
    expect(p.path.split('L')).toHaveLength(28)
    expect(p.r).toBe(3.5)
  })

  it('draws many points small and leaves out error bars it does not have', () => {
    const p = plotOf(fold)!
    expect(p.points).toHaveLength(600)
    expect(p.r).toBe(2)
    expect(p.points.every((x) => x.e1 === null)).toBe(true)
    const y = plotOf(years)!
    expect(y.refs.map((r) => r.style)).toEqual(['base', 'fade'])
    expect(y.refs[0]!.y).toBeLessThan(y.refs[1]!.y)
    expect(y.vref).toBeNull()
    expect(y.path).toBe('')
  })

  it('has nothing to draw for an empty chart or a broken range', () => {
    expect(plotOf(cygnus.report!.charts![0]!)).toBeNull()
    expect(plotOf({ ...own, x1: own.x0 } as VetChart)).toBeNull()
    expect(plotOf({ ...own, points: null } as VetChart)).toBeNull()
    expect(
      plotOf({
        ...own,
        points: [
          { x: Number.NaN, y: 1 },
          { x: 0, y: 0.1 },
        ],
      })!.points,
    ).toHaveLength(1)
  })

  it('finds the point nearest the pointer, and none when far away', () => {
    const pts = [
      { cx: 10, cy: 10 },
      { cx: 50, cy: 50 },
    ]
    expect(nearest(pts, 12, 11)).toBe(0)
    expect(nearest(pts, 45, 45)).toBe(1)
    expect(nearest(pts, 200, 200)).toBe(-1)
  })
})
