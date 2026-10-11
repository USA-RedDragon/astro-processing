import { describe, expect, it } from 'vitest'
import type { SeasonHorizon } from '@/scheduler/api/mosaics'
import {
  STRATEGY_METHOD,
  balancingBadge,
  balancingText,
  horizonText,
  hoursNotWorkedOut,
  strategyNeedsText,
  type Balancing,
  evenTooFewPanels,
  strategyNotUsedText,
} from '@/scheduler/mosaicSeasons'

const hz = (over: Partial<SeasonHorizon>): SeasonHorizon => ({
  kind: 'minimumAltitude',
  minimumAltitude: 30,
  offset: 0,
  known: true,
  reason: null,
  ...over,
})

describe('horizonText', () => {
  it("keeps today's wording when the API has no horizon", () => {
    const old = "All panels above the project's minimum altitude in astronomical darkness"
    expect(horizonText(undefined)).toBe(old)
    expect(horizonText(null)).toBe(old)
  })

  it('names the minimum altitude', () => {
    expect(horizonText(hz({ minimumAltitude: 30 }))).toBe(
      "All panels above 30°, the project's minimum altitude, in astronomical darkness",
    )
    expect(horizonText(hz({ minimumAltitude: 27.5 }))).toContain('27.5°')
  })

  it('says the minimum altitude is not set instead of showing 0', () => {
    const t = horizonText(hz({ minimumAltitude: null }))
    expect(t).toBe('All panels in astronomical darkness; the project has no minimum altitude set')
    expect(t).not.toContain('0°')
  })

  it('describes the custom horizon with its offset and floor', () => {
    expect(horizonText(hz({ kind: 'custom', offset: 5, minimumAltitude: 20 }))).toBe(
      "All panels above the profile's custom horizon plus 5°, never below the project's minimum altitude of 20°, in astronomical darkness",
    )
    expect(horizonText(hz({ kind: 'custom', offset: -2, minimumAltitude: null }))).toBe(
      "All panels above the profile's custom horizon minus 2° in astronomical darkness",
    )
    expect(horizonText(hz({ kind: 'custom', offset: 0, minimumAltitude: 20 }))).toBe(
      "All panels above the profile's custom horizon, never below the project's minimum altitude of 20°, in astronomical darkness",
    )
  })

  it('says plainly when the custom horizon is not known yet, with the reason', () => {
    expect(
      horizonText(
        hz({ kind: 'custom', known: false, minimumAltitude: 25, reason: 'no horizon from the plugin yet.' }),
      ),
    ).toBe(
      "All panels above 25°, the project's minimum altitude, in astronomical darkness. The project uses the profile's custom horizon, but the observatory scheduler has not reported it, so these hours use the flat minimum altitude instead: no horizon from the plugin yet",
    )
    expect(horizonText(hz({ kind: 'custom', known: false, reason: null }))).toMatch(
      /has not reported it, so these hours use the flat minimum altitude instead$/,
    )
  })
})

describe('horizon reasons and missing minimum altitude', () => {
  it('shows the reason for a minimum-altitude horizon when the custom horizon is not applied', () => {
    expect(
      horizonText(hz({ minimumAltitude: 30, reason: 'The NINA profile has no custom horizon.' })),
    ).toBe(
      "All panels above 30°, the project's minimum altitude, in astronomical darkness. The NINA profile has no custom horizon",
    )
  })

  it('shows a reason on a known custom horizon too', () => {
    expect(horizonText(hz({ kind: 'custom', offset: 0, reason: 'note' }))).toMatch(/darkness\. note$/)
  })

  it('says the hours are not worked out when no minimum altitude is set', () => {
    const h = hz({ minimumAltitude: null, known: false, reason: null })
    expect(hoursNotWorkedOut(h)).toBe(true)
    expect(horizonText(h)).toBe(
      'Dark hours are not worked out because the project has no minimum altitude set',
    )
    expect(horizonText({ ...h, kind: 'custom' })).not.toContain('flat minimum altitude instead')
    expect(hoursNotWorkedOut(hz({}))).toBe(false)
    expect(hoursNotWorkedOut(undefined)).toBe(false)
  })
})

describe('strategy text', () => {
  it('gives each plan the Rule weights it needs', () => {
    expect(strategyNeedsText('weakest', 'off')).toBe(
      'This plan needs Panel Deficit above 0 and Even Panels off, set for every project in Rule weights.',
    )
    expect(strategyNeedsText('even', 'weakest')).toBe(
      'This plan needs Panel Deficit above 0, Even Panels on and 4 or more enabled panels, set for every project in Rule weights.',
    )
    expect(strategyNeedsText('off', 'even')).toBe(
      'This plan needs Panel Deficit at 0, set for every project in Rule weights.',
    )
  })

  it('needs nothing for the plan in force', () => {
    expect(strategyNeedsText('even', 'even')).toBe('')
    expect(strategyNeedsText('weakest', 'weakest')).toBe('')
    expect(strategyNeedsText('', 'weakest')).toBe('')
  })

  it('no longer says the scheduler has no rule for even', () => {
    expect(STRATEGY_METHOD.even).not.toContain('no rule')
    expect(STRATEGY_METHOD.even).toContain('Even Panels on, mosaics with 4 or more enabled panels')
    expect(STRATEGY_METHOD.weakest).toContain(
      'Even Panels off, or on a mosaic with fewer than 4 enabled panels',
    )
  })
})

describe('panel balancing', () => {
  const b = (over: Partial<Balancing>): Balancing => ({
    panelDeficit: 75,
    panelDeficitSet: true,
    mosaicCompletion: 0,
    on: true,
    onWeight: 75,
    ...over,
  })
  const behind = 'Panel 2 is furthest behind now.'

  it("keeps today's text when the API has no evenPanels", () => {
    expect(balancingText(b({}), behind, null)).toBe(
      'Panel Deficit is weighted 75 on this mosaic, so the scheduler adds weight to the panel furthest behind its goal and none to panels past it. Panel 2 is furthest behind now.',
    )
    expect(balancingBadge(b({}))).toBe('On · Panel Deficit 75')
  })

  it('says weakest panel first with Even Panels off', () => {
    const t = balancingText(b({ evenPanels: false }), behind, null)
    expect(t).toContain('with Even Panels off, so the weakest panel goes first')
    expect(t).toContain(behind)
    expect(balancingBadge(b({ evenPanels: false }))).toBe('On · Panel Deficit 75 · weakest first')
  })

  it('says even across panels this season with Even Panels on', () => {
    const t = balancingText(b({ evenPanels: true }), behind, null)
    expect(t).toContain('with Even Panels on, so the panels are kept even this season')
    expect(t).not.toContain(behind)
    expect(balancingBadge(b({ evenPanels: true }))).toBe('On · Panel Deficit 75 · even this season')
  })

  it('keeps a 2-panel mosaic weakest first with Even Panels on', () => {
    const two = b({ evenPanels: true, enabledPanels: 2, evenMinPanels: 4, evenSpreads: false })
    expect(evenTooFewPanels(two)).toBe(true)
    const t = balancingText(two, behind, null)
    expect(t).toContain(
      'with Even Panels on, but Even Panels spreads time only on mosaics with 4 or more enabled panels, and this one has 2, so the weakest panel goes first',
    )
    expect(t).toContain(behind)
    expect(balancingBadge(two)).toBe('On · Panel Deficit 75 · weakest first')
    expect(strategyNotUsedText('even', two)).toBe(
      'The scheduler does not use this plan on this mosaic: Even Panels spreads time only on mosaics with 4 or more enabled panels, and this one has 2. Its weakest panel goes first instead.',
    )
    expect(strategyNotUsedText('weakest', two)).toBe('')
  })

  it('keeps a 5-panel mosaic even with Even Panels on', () => {
    const five = b({ evenPanels: true, enabledPanels: 5, evenMinPanels: 4, evenSpreads: true })
    expect(evenTooFewPanels(five)).toBe(false)
    expect(balancingText(five, behind, null)).toContain(
      'with Even Panels on, so the panels are kept even this season',
    )
    expect(balancingBadge(five)).toBe('On · Panel Deficit 75 · even this season')
    expect(strategyNotUsedText('even', five)).toBe('')
  })

  it('says the even plan is not used on a 2-panel mosaic with Even Panels off', () => {
    const off = b({ evenPanels: false, enabledPanels: 2, evenMinPanels: 4, evenSpreads: false })
    expect(evenTooFewPanels(off)).toBe(true)
    expect(balancingText(off, behind, null)).toContain(
      'with Even Panels off, so the weakest panel goes first',
    )
    expect(strategyNotUsedText('even', off)).toContain('this one has 2')
  })

  it('notes Even Panels does nothing while Panel Deficit is 0', () => {
    const t = balancingText(b({ on: false, panelDeficit: 0, evenPanels: true }), behind, 0)
    expect(t).toContain('Even Panels is on, but it has no effect while Panel Deficit is 0.')
    expect(t).toMatch(/Panel Deficit is a global rule weight, 0 for every project\.$/)
    expect(balancingBadge(b({ on: false }))).toBe('Off')
  })

  it('flags a mosaic that differs from the global Panel Deficit', () => {
    expect(balancingText(b({}), behind, 50)).toContain('this mosaic differs from it')
  })
})
