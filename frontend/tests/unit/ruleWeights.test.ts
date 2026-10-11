import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import RuleWeightsConfirm from '@/scheduler/components/RuleWeightsConfirm.vue'
import type { ApplyResult, GlobalRule, GlobalWeights } from '@/scheduler/api/ruleweights'
import type { CommandRecord } from '@/scheduler/api/commands'
import {
  applyOutcome,
  basisText,
  changedWeights,
  diffText,
  forText,
  supportsWeightOverrides,
  switchKeys,
  switchStates,
  weightChanges,
  weightValue,
  weightsFromQuery,
  weightsToQuery,
} from '@/scheduler/ruleWeights'

const rule = (key: string, extra: Partial<GlobalRule> = {}): GlobalRule => ({
  key,
  rule: key,
  label: key,
  defaultWeight: 0,
  new: false,
  switch: false,
  for: 'all',
  mosaicOnly: false,
  description: '',
  ...extra,
})

const rules: GlobalRule[] = [
  rule('Novelty', { label: 'Novelty, single targets', for: 'single' }),
  rule('Novelty (mosaic)', { rule: 'Novelty', label: 'Novelty, mosaics', for: 'mosaic' }),
  rule('Panel Deficit', { mosaicOnly: true }),
  rule('Rarity'),
  rule('Filter Steering', { switch: true }),
]

const g: GlobalWeights = {
  rules,
  weights: {
    Novelty: 10,
    'Novelty (mosaic)': 10,
    'Panel Deficit': 0,
    Rarity: 75,
    'Filter Steering': 0,
  },
  basis: 'projects',
  saved: {},
  projects: 73,
  mosaics: 22,
  differing: [],
}

describe('rule weight helpers', () => {
  it('keeps only drafted values that differ from the global set', () => {
    expect(changedWeights(g.weights, { Novelty: 40, Rarity: 75, 'Novelty (mosaic)': 5 })).toEqual({
      Novelty: 40,
      'Novelty (mosaic)': 5,
    })
  })

  it('lists changes in rule order with labels and switch words', () => {
    const c = weightChanges(g, { 'Filter Steering': 100, Novelty: 38.5, Rarity: 75 })
    expect(c).toEqual([
      { key: 'Novelty', label: 'Novelty, single targets', from: '10', to: '38.5' },
      { key: 'Filter Steering', label: 'Filter Steering', from: 'off', to: 'on' },
    ])
  })

  it('says which projects take each value', () => {
    expect(forText(rules[0]!)).toContain('Single-target')
    expect(forText(rules[1]!)).toContain('Mosaic projects')
    expect(forText(rules[2]!)).toContain('scores only mosaic panels')
    expect(forText(rules[3]!)).toBe('Every project takes this value.')
  })

  it('describes a project difference and a missing row', () => {
    expect(diffText(rules, { key: 'Novelty (mosaic)', rule: 'Novelty', project: 10, global: 5 })).toBe(
      'Novelty, mosaics 10, global 5',
    )
    expect(diffText(rules, { key: 'Rarity', rule: 'Rarity', project: null, global: 20 })).toBe(
      'Rarity not set, global 20',
    )
    expect(weightValue(undefined, 3.333)).toBe('3.33')
  })

  it('explains where the values come from', () => {
    const when = (iso: string) => 'on ' + iso
    expect(basisText({ basis: 'saved', savedAt: 'T', savedBy: 'jacob' }, when)).toBe('Saved on T by jacob.')
    expect(basisText({ basis: 'projects' }, when)).toContain('most of your projects')
    expect(basisText({ basis: 'defaults' }, when)).toContain("Target Scheduler's defaults")
  })

  it('summarises an apply', () => {
    const rec = { id: 'a' } as CommandRecord
    const r: ApplyResult = { global: rec, projects: [rec, rec], failed: [], weights: g }
    expect(applyOutcome(r)).toEqual({
      text: 'Saved · Global rule weights',
      sub: '2 projects get the global weights; Target Scheduler applies them when the current exposure ends.',
      tone: undefined,
    })
    const none = applyOutcome({ projects: [], failed: [], weights: g })
    expect(none.text).toBe('Rule weights reset to the global set')
    expect(none.sub).toBe('Every project already has the global weights.')
    expect(applyOutcome({ projects: [], failed: ['Heart: boom'], weights: g })).toMatchObject({
      tone: 'bad',
      sub: 'Not sent: Heart: boom.',
    })
  })

  it('knows when the plugin simulates rule weights', () => {
    expect(supportsWeightOverrides({ override_kinds: ['project', 'ruleweight'] })).toBe(true)
    expect(supportsWeightOverrides({ override_kinds: ['project'] })).toBe(false)
    expect(supportsWeightOverrides({})).toBe(false)
    expect(supportsWeightOverrides(null)).toBe(false)
  })

  it('round-trips drafted weights through the Tonight link', () => {
    const q = weightsToQuery({ Novelty: 40, 'Novelty (mosaic)': 5 })
    expect(weightsFromQuery(q, rules)).toEqual({ Novelty: 40, 'Novelty (mosaic)': 5 })
    expect(weightsFromQuery('Made Up=3;Rarity=101;Rarity=x;Novelty=7', rules)).toEqual({ Novelty: 7 })
    expect(weightsFromQuery(undefined)).toEqual({})
  })
})

describe('RuleWeightsConfirm', () => {
  it('lists the changes and the projects that get an update', async () => {
    const el = document.createElement('div')
    const projects = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      guid: 'g' + i,
      name: 'P' + (i + 1),
      state: 'Active',
      isMosaic: i === 0,
      diffs: [{ key: 'Rarity', rule: 'Rarity', project: 75, global: 20 }],
    }))
    const app = createApp({
      render: () =>
        h(RuleWeightsConfirm, {
          title: 'Apply?',
          action: 'Apply for real',
          changes: [{ key: 'Rarity', label: 'Rarity', from: '75', to: '20' }],
          extra: ['Sadr · priority Normal → High'],
          projects,
        }),
    })
    app.mount(el)
    await nextTick()
    const text = el.textContent ?? ''
    expect(text).toContain('Rarity: 75 to 20')
    expect(text).toContain('Sadr · priority Normal → High')
    expect(text).toContain('sends a rule weight update to 14 projects')
    expect(text).toContain('P1 · 1 rule · mosaic')
    expect(text).toContain('and 2 more projects')
    expect(text).not.toContain('P13')
    app.unmount()
  })

  it('says when nothing would be sent and blocks apply while loading', async () => {
    const el = document.createElement('div')
    const app = createApp({
      render: () => h(RuleWeightsConfirm, { title: 'x', action: 'Go', changes: [], projects: [] }),
    })
    app.mount(el)
    await nextTick()
    expect(el.textContent).toContain('nothing is sent to Target Scheduler')
    app.unmount()
    const el2 = document.createElement('div')
    const app2 = createApp({
      render: () =>
        h(RuleWeightsConfirm, { title: 'x', action: 'Go', changes: [], projects: null, loading: true }),
    })
    app2.mount(el2)
    await nextTick()
    const go = [...el2.querySelectorAll('button')].find((b) => b.textContent?.includes('Go'))
    expect(go?.disabled).toBe(true)
    app2.unmount()
  })
})

describe('switch rules', () => {
  const sw: GlobalRule[] = [
    rule('Rarity'),
    rule('Filter Steering', { switch: true, description: 'Steers filters.' }),
    rule('Even Panels', { switch: true, mosaicOnly: true, description: 'Keeps panels even.' }),
  ]
  const g = { rules: sw, weights: { Rarity: 50, 'Filter Steering': 100, 'Even Panels': 0 } }

  it('lists every switch rule for a mosaic, mosaic-only ones included', () => {
    expect(switchStates(g, [], true)).toEqual([
      { key: 'Filter Steering', label: 'Filter Steering', description: 'Steers filters.', on: true, set: true, global: undefined },
      { key: 'Even Panels', label: 'Even Panels', description: 'Keeps panels even.', on: false, set: true, global: undefined },
    ])
  })

  it('leaves mosaic-only switches off single targets', () => {
    expect(switchStates(g, [], false).map((s) => s.key)).toEqual(['Filter Steering'])
  })

  it("takes the project's own value where it differs from the global set", () => {
    const st = switchStates(
      g,
      [
        { key: 'Even Panels', rule: 'Even Panels', project: 100, global: 0 },
        { key: 'Filter Steering', rule: 'Filter Steering', project: null, global: 100 },
      ],
      true,
    )
    expect(st.find((s) => s.key === 'Even Panels')).toMatchObject({ on: true, set: true, global: false })
    expect(st.find((s) => s.key === 'Filter Steering')).toMatchObject({ on: false, set: false, global: true })
  })

  it('names switch rules so scoring rows can skip them', () => {
    expect([...switchKeys(g)].sort()).toEqual(['Even Panels', 'Filter Steering'])
    expect(switchKeys(null).size).toBe(0)
  })

  it('shows a switch value as on or off', () => {
    expect(weightValue(sw[2], 100)).toBe('on')
    expect(weightValue(sw[2], 0)).toBe('off')
  })
})
