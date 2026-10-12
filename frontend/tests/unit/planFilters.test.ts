import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

vi.mock('@/scheduler/api/events', () => ({ onEvent: () => () => {}, onReconnect: () => () => {} }))

import SchedulerTabs from '@/scheduler/components/SchedulerTabs.vue'
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

const calls: { url: string; method: string; body: unknown }[] = []

const draft = {
  payload: { targets: [{ target_id: 84 }] },
  goals: [
    {
      project_id: 40,
      project_name: 'Garlic Nebula',
      goals: [
        {
          target_id: 84,
          target_guid: 'g',
          target_name: 'Garlic Nebula',
          filter: 'S-II',
          before: null,
          after: { kind: 0, snr_goal: 10, plateau_stop: true },
        },
      ],
    },
  ],
  effects: [],
}

function record(kind: string) {
  return { id: kind, kind, title: kind, status: 'queued', category: 'plans' }
}

async function render(over: Record<string, () => Response> = {}) {
  calls.length = 0
  const routes: Record<string, () => Response> = {
    'GET /planning/projects/40': () => json(real),
    'POST /planning/filters/draft': () => json(draft),
    'POST /commands': () => json(record('x')),
    ...over,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })
      const key = Object.keys(routes).find((k) => {
        const [m, path] = k.split(' ')
        return m === method && url.includes(path!)
      })
      if (key === 'POST /commands') return json(record(body.kind))
      return key ? routes[key]!() : json({ error: 'not found' }, 404)
    }),
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p', component: { render: () => h(SchedulerTabs, { projectId: 40 }) } },
      { path: '/', component: { render: () => null } },
    ],
  })
  router.push('/p?tab=plans')
  await router.isReady()
  const el = document.createElement('div')
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(el)
  await settle()
  return { el, app }
}

function chip(el: HTMLElement, name: string): HTMLButtonElement {
  const b = [...el.querySelectorAll<HTMLButtonElement>('.chip')].find(
    (x) => x.textContent?.trim() === name,
  )
  if (!b) throw new Error('no chip ' + name)
  return b
}

describe('project filters', () => {
  it('shows the seven filters grouped, the enabled ones pressed, and no template names', async () => {
    const { el, app } = await render()
    const labels = [...el.querySelectorAll('.group-label')].map((x) => x.textContent)
    expect(labels).toEqual(['Broadband', 'Narrowband'])
    const pressed = [...el.querySelectorAll('.chip[aria-pressed="true"]')].map((x) =>
      x.textContent?.trim(),
    )
    expect(pressed).toEqual(['Luminance', 'Red', 'Green', 'Blue', 'H-a', 'O-III'])
    expect(chip(el, 'S-II').getAttribute('aria-pressed')).toBe('false')
    const text = el.textContent ?? ''
    expect(text).not.toContain('R 600')
    expect(text).not.toContain('Template')
    expect(text).not.toContain('exposure set')
    app.unmount()
  })

  it('shows the measured progress rows from the goal data', async () => {
    const { el, app } = await render()
    const rows = [...el.querySelectorAll('.frow')]
    expect(rows.map((r) => r.querySelector('.fname')?.textContent?.trim())).toEqual([
      'Luminance',
      'Red',
      'Green',
      'Blue',
      'H-a',
      'O-III',
    ])
    const lum = rows[0]!.textContent ?? ''
    expect(lum).toContain('needs more · 68% of its goal')
    expect(lum).toContain('low confidence')
    expect(lum).toContain('8.3 of 10')
    expect(lum).toContain('8 of 11 taken')
    expect(lum).toContain('about 0.2 h')
    expect(lum).toContain('not measured yet')
    const ha = rows[4]!.textContent ?? ''
    expect(ha).toContain('68 of 175 taken')
    expect(ha).toContain('near 22.5 h')
    expect(ha).not.toContain('low confidence')
    app.unmount()
  })

  it('adds a filter through the filters draft and the apply-set command path', async () => {
    const { el, app } = await render()
    chip(el, 'S-II').click()
    await settle()
    const d = calls.find((c) => c.url.includes('/planning/filters/draft'))
    expect(d?.method).toBe('POST')
    expect(d?.body).toEqual({
      targetIds: [84],
      filters: ['Luminance', 'Red', 'Green', 'Blue', 'H-a', 'O-III', 'S-II'],
    })
    const sent = calls.filter((c) => c.url.includes('/commands')).map((c) => (c.body as { kind: string }).kind)
    expect(sent).toEqual(['exposureplan.applyset', 'goal.edit'])
    expect(chip(el, 'S-II').getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector('.frow[data-filter="S-II"]')?.textContent).toContain(
      'not measured yet · no subs taken',
    )
    app.unmount()
  })

  it('asks before stopping a filter with subs and sends nothing on Keep it', async () => {
    const { el, app } = await render()
    chip(el, 'O-III').click()
    await settle()
    const box = el.querySelector('.confirm')
    expect(box?.textContent).toContain('Stop imaging O-III?')
    expect(box?.textContent).toContain('Its 44 kept subs (of 127 taken) stay')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    const keep = [...box!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Keep it')!
    keep.click()
    await settle()
    expect(el.querySelector('.confirm')).toBeNull()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    chip(el, 'O-III').click()
    await settle()
    const stop = [...el.querySelectorAll('.confirm button')].find((b) =>
      b.textContent?.includes('Stop imaging O-III'),
    ) as HTMLButtonElement
    stop.click()
    await settle()
    const d = calls.find((c) => c.url.includes('/planning/filters/draft'))
    expect(d?.body).toEqual({
      targetIds: [84],
      filters: ['Luminance', 'Red', 'Green', 'Blue', 'H-a'],
    })
    expect(chip(el, 'O-III').getAttribute('aria-pressed')).toBe('false')
    app.unmount()
  })

  it('puts the chip back when the draft fails', async () => {
    const { el, app } = await render({
      'POST /planning/filters/draft': () => json({ error: 'no template uses the filter S-II' }, 422),
    })
    chip(el, 'S-II').click()
    await settle()
    expect(chip(el, 'S-II').getAttribute('aria-pressed')).toBe('false')
    expect(calls.some((c) => c.url.includes('/commands'))).toBe(false)
    app.unmount()
  })
})
