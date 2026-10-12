import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

vi.mock('@/scheduler/api/events', () => ({ onEvent: () => () => {}, onReconnect: () => () => {} }))

import AddTargetPage from '@/scheduler/pages/AddTargetPage.vue'
import real from './fixtures/project40Real.json'

afterEach(() => vi.unstubAllGlobals())

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

const object = {
  id: 'ngc7000',
  designation: 'NGC 7000',
  name: 'North America Nebula',
  type: 'HII',
  aliases: [],
  ra: 314.7,
  dec: 44.3,
  majorArcmin: 120,
  minorArcmin: 100,
  pa: 0,
  source: 'test',
}

const snapshot = {
  frame: { widthDeg: null, heightDeg: null, reason: 'not measured', basis: {} },
  projects: [real.project],
  templates: real.templates,
  sets: real.sets,
  rules: [],
  defaults: {
    goal: {
      kind: 'snr',
      snr: 10,
      depthSnr: 5,
      depths: [],
      plateauStop: true,
      plateauGainPct: 1.5,
      bandLowPercentile: 50,
      bandHighPercentile: 90,
    },
    panelDeficitWeight: 0,
  },
}

const pick = {
  class: 'emission',
  classLabel: 'Emission nebula',
  palette: 'HOO',
  reason: 'bright H-alpha',
  halpha: null,
  halphaMap: { state: 'ready', source: '', fetchedAt: null, error: null },
  rules: [],
  filters: [
    { filter: 'H-α', template: { id: 14, name: 'H-a', filter: 'H-a' }, templateBasis: '', subs: 0, hours: {} },
    { filter: 'O-III', template: { id: 15, name: 'O-III', filter: 'O-III' }, templateBasis: '', subs: 0, hours: {} },
  ],
  set: null,
  missing: [],
  goalSnr: 10,
  skyBrightness: null,
  skyBrightnessBasis: { source: '', band: '', nights: 0, reason: null },
}

const posts: { url: string; body: Record<string, unknown> }[] = []

async function render() {
  posts.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init?.body)) })
        if (url.includes('/planning/projects/draft'))
          return json({ project: { guid: 'p', name: 'x' }, targets: [{ name: 'x', plans: [1, 2] }], goals: [] })
        return json({ error: 'not mocked' }, 404)
      }
      if (url.endsWith('/planning')) return json(snapshot)
      if (url.includes('/catalog/objects/ngc7000/pick')) return json(pick)
      if (url.includes('/catalog/objects/ngc7000'))
        return json({ object, status: '', subjects: [], links: [], fit: { fill: 0.5, panels: 1, columns: 1, rows: 1, category: '' } })
      return json({ error: 'not found' }, 404)
    }),
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/add', component: AddTargetPage },
      { path: '/', name: 'targets', component: { render: () => null } },
    ],
  })
  router.push('/add?object=ngc7000')
  await router.isReady()
  const el = document.createElement('div')
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(el)
  await settle()
  await settle()
  const step4 = [...el.querySelectorAll<HTMLButtonElement>('.steps button')].find((b) =>
    b.textContent?.includes('Filters and goal'),
  )!
  step4.click()
  await settle()
  return { el, app }
}

function pressed(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.chip[aria-pressed="true"]')].map((x) => x.textContent!.trim())
}

function button(el: HTMLElement, text: string): HTMLButtonElement {
  return [...el.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )!
}

describe('add target filters step', () => {
  it('is named Filters and goal and starts from the suggested filters', async () => {
    const { el, app } = await render()
    expect(el.querySelector('#filters-h')?.textContent).toBe('Filters')
    expect(el.querySelector('#goal-h')).not.toBeNull()
    expect(pressed(el)).toEqual(['H-a', 'O-III'])
    expect(el.querySelector('[data-test="chosen"]')?.textContent).toBe('2 filters chosen.')
    const text = el.textContent ?? ''
    expect(text).not.toContain('Template')
    expect(text).not.toContain('exposure set')
    expect(text).not.toContain('R 600')
    app.unmount()
  })

  it('fills the chips from the quick picks and single toggles', async () => {
    const { el, app } = await render()
    button(el, 'LRGB').click()
    await settle()
    expect(pressed(el)).toEqual(['Luminance', 'Red', 'Green', 'Blue'])
    button(el, 'All seven').click()
    await settle()
    expect(pressed(el)).toHaveLength(7)
    button(el, 'Narrowband (H-a, O-III, S-II)').click()
    await settle()
    expect(pressed(el)).toEqual(['H-a', 'O-III', 'S-II'])
    ;[...el.querySelectorAll<HTMLButtonElement>('.chip')].filter((c) => c.getAttribute('aria-pressed') === 'true').forEach((c) => c.click())
    await settle()
    expect(el.querySelector('[data-test="chosen"]')?.textContent).toBe('Choose at least one filter.')
    expect(button(el, 'Next').disabled).toBe(true)
    app.unmount()
  })

  it('drafts the project with filter names, no set and no template ids', async () => {
    const { el, app } = await render()
    button(el, 'LRGB').click()
    await settle()
    const blue = [...el.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.textContent?.trim() === 'Blue')!
    blue.click()
    await settle()
    const sel = el.querySelector<HTMLSelectElement>('select')!
    sel.value = 'Normal'
    sel.dispatchEvent(new Event('change'))
    await settle()
    button(el, 'Next').click()
    await settle()
    const d = posts.find((p) => p.url.includes('/planning/projects/draft'))!
    expect(d.body.filters).toEqual(['Luminance', 'Red', 'Green'])
    expect(d.body).not.toHaveProperty('setId')
    expect(d.body).not.toHaveProperty('plans')
    expect(el.textContent).toContain('Luminance, Red, Green.')
    app.unmount()
  })
})
