import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import {
  filterPlateau,
  plateauLabel,
  plateauRollupLabel,
  plateauTitle,
  plateauWhere,
  type FilterGoal,
  type Least,
  type LeastPlateau,
} from '@/scheduler/api/planning'
import { plateauFill, plateauText } from '@/scheduler/api/discover'
import { cardCircle, plateauCaption } from '@/scheduler/leastCards'
import PlateauLine from '@/scheduler/components/PlateauLine.vue'
import ProgressCircle from '@/components/ProgressCircle.vue'

const plateau = (p: Partial<LeastPlateau>): LeastPlateau => ({
  progress: 0.091,
  hours: 25.04,
  effectiveHours: 2.29,
  gainPerHourPct: 14.01,
  filter: 'H-a',
  target: 'North America Nebula Panel 1',
  unmeasured: 0,
  filters: 5,
  gainPct: 1.5,
  ...p,
})

const least = (l: Partial<Least>): Least => ({ enough: false, progress: null, unmeasured: 0, filters: 5, ...l })

describe('plateau text', () => {
  it('states the estimated plateau hours and how far along the stack is', () => {
    expect(plateauLabel(plateau({}))).toBe('plateau at ~25.0 h, 9% there')
    expect(plateauRollupLabel(plateau({}))).toBe('H-a plateau at ~25.0 h, 9% there')
    expect(plateauRollupLabel(plateau({}), true)).toBe('Panel 1 H-a plateau at ~25.0 h, 9% there')
    expect(plateauRollupLabel(plateau({ panel: 3, target: undefined }), true)).toBe(
      'Panel 3 H-a plateau at ~25.0 h, 9% there',
    )
  })

  it('names the filter and where its plateau is', () => {
    expect(plateauWhere(plateau({}))).toBe('H-a at ~25.0 h, 9% there')
    expect(plateauWhere(plateau({ progress: 1 }))).toBe('H-a reached')
    expect(plateauWhere(plateau({ progress: null, hours: null }))).toBe('H-a not measured yet')
  })

  it('says reached at the plateau and not measured without a fit', () => {
    expect(plateauLabel(plateau({ progress: 1 }))).toBe('plateau reached')
    expect(plateauLabel(plateau({ progress: null, hours: null }))).toBe('plateau not measured yet')
    expect(plateauLabel(null)).toBe('plateau not measured yet')
  })

  it('gives the basis and the threshold in the tooltip', () => {
    const t = plateauTitle(plateau({}))
    expect(t).toContain('H-a is furthest from its plateau: estimated at ~25.0 h effective, 9% of the way there.')
    expect(t).toContain('2.3 h effective now; one more hour lowers the noise by 14.0%.')
    expect(t).toContain('under 1.5%')
    expect(t).toContain('σ(t) = √(a²/t + b²)')
    expect(t).toContain('with no noise floor (b = 0) it falls at 32.6 h')
    const n = plateauTitle(plateau({ progress: null, hours: null, notMeasured: 'noise floor not measurable from 2 draw levels' }))
    expect(n).toMatch(/^Plateau not measured yet for H-a: noise floor not measurable from 2 draw levels\./)
  })

  it('reads a filter goal plateau', () => {
    const fg = {
      filter: 'Red',
      measurement: { effectiveHours: 1.43, gainPerHourPct: 21.45 },
      plateauAt: { progress: 0.05, hours: 28.1, gainPct: 1.5 },
    } as unknown as FilterGoal
    expect(filterPlateau(fg)).toMatchObject({ filter: 'Red', progress: 0.05, hours: 28.1, effectiveHours: 1.43, gainPct: 1.5 })
    expect(filterPlateau({ filter: 'Red' } as FilterGoal)).toBeNull()
  })
})

describe('plateau on cards', () => {
  it('shows goal met and the plateau far off together', () => {
    const c = cardCircle(least({ enough: true, progress: 1, filter: 'Luminance', plateau: plateau({}) }), 'ok', true)
    expect(c).toMatchObject({ percent: 100, caption: 'enough data' })
    expect(c.plateau).toMatchObject({ percent: 9, text: 'Panel 1 H-a at ~25.0 h, 9% there' })
    expect(plateauCaption(9)).toBe('9% to plateau')
    expect(plateauCaption(100)).toBe('plateau reached')
    expect(plateauCaption(null)).toBe('plateau not measured')
  })

  it('has no plateau without enabled plans', () => {
    expect(cardCircle(least({ filters: 0, plateau: plateau({}) }), 'ok').plateau).toBeUndefined()
  })

  it('draws an outer ring for the plateau', async () => {
    const el = document.createElement('div')
    const app = createApp({
      render: () => h(ProgressCircle, { percentage: 100, plateau: 9, plateauCaption: '9% to plateau' }),
    })
    app.mount(el)
    await nextTick()
    const ring = el.querySelector('[data-testid="plateau-ring"]')
    const c = 2 * Math.PI * 26
    expect(Number(ring?.getAttribute('stroke-dashoffset'))).toBeCloseTo(c * 0.91)
    expect(el.textContent).toContain('9% to plateau')
    app.unmount()
  })
})

describe('plateau line', () => {
  it('fills to the plateau progress and labels it', async () => {
    const el = document.createElement('div')
    const app = createApp({ render: () => h(PlateauLine, { plateau: plateau({}) }) })
    app.mount(el)
    await nextTick()
    const m = el.querySelector('[role="meter"]')
    expect(m?.getAttribute('aria-valuenow')).toBe('9')
    expect((el.querySelector('.pfill') as HTMLElement).style.width).toBe('9.1%')
    expect(el.textContent).toContain('H-a plateau at ~25.0 h, 9% there')
    app.unmount()
  })

  it('draws no fill when not measured', async () => {
    const el = document.createElement('div')
    const app = createApp({ render: () => h(PlateauLine, { plateau: plateau({ progress: null, hours: null }) }) })
    app.mount(el)
    await nextTick()
    expect(el.querySelector('.pfill')).toBeNull()
    expect(el.querySelector('[role="meter"]')?.hasAttribute('aria-valuenow')).toBe(false)
    expect(el.textContent).toContain('H-a plateau not measured yet')
    app.unmount()
  })
})

describe('plateau on catalogue tiles', () => {
  const progress = { percent: 1, target: 'North America Nebula Panel 1', enough: true, plateau: plateau({}) }

  it('marks done tiles with how far the plateau is', () => {
    expect(plateauFill({ status: 'done', progress })).toBeCloseTo(0.091)
    expect(plateauText({ status: 'done', progress })).toBe('H-a plateau at ~25.0 h, 9% there')
  })

  it('shows nothing for tiles not started or without a plateau', () => {
    expect(plateauFill({ status: 'not-started', progress })).toBeNull()
    expect(plateauText({ status: 'in-progress', progress: { ...progress, plateau: undefined } })).toBe('')
    expect(plateauFill({ status: 'in-progress', progress: { ...progress, plateau: plateau({ progress: null }) } })).toBeNull()
  })
})
