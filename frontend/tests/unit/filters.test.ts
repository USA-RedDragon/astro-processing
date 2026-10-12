import { describe, expect, it } from 'vitest'
import {
  chosenText,
  emptyHeadline,
  filterChoices,
  filterSubs,
  goalFact,
  groupFilters,
  hasFilter,
  isNarrowband,
  pickFilters,
  planStatsLabel,
  plateauFact,
  QUICK_PICKS,
  selectedFilters,
  stopText,
  timeFact,
  withFilter,
} from '@/scheduler/filters'
import type { FilterGoal, ProjectDetail } from '@/scheduler/api/planning'
import real from './fixtures/project40Real.json'

const detail = real as unknown as ProjectDetail
const target = detail.project.targets[0]!
const goal = (f: string) => target.goals.find((g) => g.filter === f) as FilterGoal

describe('filter choices', () => {
  it('uses the snapshot filter list when the stacker sends one', () => {
    const got = filterChoices({
      filters: [
        { name: 'S-II', narrowband: true },
        { name: 'Blue', narrowband: false },
        { name: 'Luminance', narrowband: false },
      ],
      templates: [{ filter: 'Clear' }],
    })
    expect(got.map((f) => f.name)).toEqual(['Luminance', 'Blue', 'S-II'])
  })

  it('derives the seven filters from the live templates and plans, never a template name', () => {
    const got = filterChoices({ templates: detail.templates, plans: target.plans })
    expect(got.map((f) => f.name)).toEqual(['Luminance', 'Red', 'Green', 'Blue', 'H-a', 'O-III', 'S-II'])
    const groups = groupFilters(got)
    expect(groups.map((g) => [g.label, g.filters.map((f) => f.name)])).toEqual([
      ['Broadband', ['Luminance', 'Red', 'Green', 'Blue']],
      ['Narrowband', ['H-a', 'O-III', 'S-II']],
    ])
    expect(got.map((f) => f.name)).not.toContain('R 600')
  })

  it('knows narrowband by name', () => {
    expect(['H-a', 'Ha', 'OIII', 'S-II', 'S2'].every(isNarrowband)).toBe(true)
    expect(['Luminance', 'Red', 'Clear'].some(isNarrowband)).toBe(false)
  })
})

describe('selected filters', () => {
  it('are the filters with an enabled plan', () => {
    expect(selectedFilters(detail.project.targets)).toEqual([
      'Luminance',
      'Red',
      'Green',
      'Blue',
      'H-a',
      'O-III',
    ])
    expect(
      selectedFilters([
        {
          plans: [
            { ...target.plans[0]!, enabled: false },
            { ...target.plans[4]!, enabled: true },
          ],
        },
      ]),
    ).toEqual(['H-a'])
  })

  it('adds and removes one filter, matching names loosely', () => {
    expect(withFilter(['Luminance', 'Red'], 'red', false)).toEqual(['Luminance'])
    expect(withFilter(['Luminance'], 'S-II', true)).toEqual(['Luminance', 'S-II'])
    expect(hasFilter(['H-a'], 'Ha')).toBe(true)
  })

  it('counts kept and taken subs for the stop confirmation', () => {
    const s = filterSubs(detail.project.targets, 'O-III')
    expect(s).toEqual({ kept: 44, taken: 127 })
    expect(stopText('O-III', s)).toBe(
      "Its 44 kept subs (of 127 taken) stay on disk and stay in this project's stacks. If you add O-III back later, it continues from them.",
    )
  })
})

describe('quick picks', () => {
  it('fill only filters the observatory has', () => {
    const all = filterChoices({ templates: detail.templates })
    expect(QUICK_PICKS.map((p) => pickFilters(p, all).length)).toEqual([4, 3, 7])
    const lrgbOnly = filterChoices({ templates: [{ filter: 'Red' }, { filter: 'Luminance' }] })
    expect(pickFilters(QUICK_PICKS[2]!, lrgbOnly)).toEqual(['Luminance', 'Red'])
  })

  it('says how many are chosen', () => {
    expect(chosenText(0)).toBe('Choose at least one filter.')
    expect(chosenText(1)).toBe('1 filter chosen.')
    expect(chosenText(4)).toBe('4 filters chosen.')
  })
})

describe('progress facts', () => {
  it('match the live Garlic Nebula values', () => {
    expect(goalFact(goal('Luminance'), 'snr').value).toBe('8.3 of 10')
    expect(timeFact(goal('Luminance')).value).toBe('about 0.2 h')
    expect(plateauFact(goal('Luminance'))).toEqual({
      label: 'Where more time stops helping',
      value: 'not measured yet',
      measured: false,
    })
    expect(plateauFact(goal('H-a')).value).toBe('near 22.5 h')
    expect(timeFact(goal('O-III')).value).toBe('about 9.1 h')
  })

  it('says not measured when there is no measurement', () => {
    expect(goalFact(undefined, 'depth')).toEqual({
      label: 'Depth',
      value: 'not measured yet',
      measured: false,
    })
    expect(timeFact(undefined).value).toBe('not measured yet')
    expect(emptyHeadline({ kept: 0, taken: 0 })).toBe('not measured yet · no subs taken')
    expect(emptyHeadline({ kept: 1, taken: 3 })).toBe('not measured yet · 3 subs taken')
  })

  it('shows a met goal as no time needed', () => {
    const g = { ...goal('H-a'), enough: true, progress: { ...goal('H-a').progress!, done: true, progress: 1 } }
    expect(timeFact(g).value).toBe('none, goal met')
  })
})

describe('plan stats label', () => {
  it('names the filter, never the template', () => {
    expect(
      planStatsLabel({ filter_name: 'Red', exposure: 600, gain: 0, offset: -1, enabled: true }),
    ).toBe('Red (600s, Gain 0, Offset Default)')
    expect(planStatsLabel({ filter_name: '', enabled: false })).toBe('Unknown filter · off')
  })
})
