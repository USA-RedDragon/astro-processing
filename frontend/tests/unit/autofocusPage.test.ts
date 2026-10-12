import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

vi.mock('@/scheduler/api/events', () => ({ onEvent: () => () => {}, onReconnect: () => () => {} }))

import AutofocusPage from '@/scheduler/pages/AutofocusPage.vue'
import AutofocusPanel from '@/scheduler/components/AutofocusPanel.vue'
import { shell } from '@/scheduler/shell'
import { fromStatus, type AfRun, type AfRuns } from '@/scheduler/autofocus'
import real from './fixtures/autofocusReal.json'

afterEach(() => {
  vi.unstubAllGlobals()
  shell.scheduler = { reachable: 'unknown' }
})

const NOW = Date.parse('2026-10-12T09:00:00Z')
const all = (real as AfRuns).runs as AfRun[]
const tonight = all.filter((r) => r.finished_at >= '2026-10-11T17:00:00Z')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

async function page(handler: (url: string) => Response) {
  shell.now = NOW
  const fetch = vi.fn(async (url: string) => handler(url))
  vi.stubGlobal('fetch', fetch)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/autofocus', name: 'autofocus', component: AutofocusPage }],
  })
  router.push('/autofocus')
  await router.isReady()
  const el = document.createElement('div')
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(el)
  await settle()
  return { el, app, fetch }
}

async function panel(props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/autofocus', name: 'autofocus', component: { render: () => null } }],
  })
  const el = document.createElement('div')
  const app = createApp({ render: () => h(AutofocusPanel, props) })
  app.use(router)
  app.mount(el)
  await settle()
  return { el, app }
}

describe('AutofocusPage', () => {
  it("asks for tonight's runs and lists them newest first", async () => {
    const { el, app, fetch } = await page(() =>
      json({ since: '2026-10-11T17:00:00Z', available: true, runs: tonight }),
    )
    expect(fetch.mock.calls[0]![0]).toBe(
      '/api/v1/scheduler/autofocus?since=2026-10-11T17%3A00%3A00.000Z&limit=200',
    )
    const rows = [...el.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(5)
    const cells = (i: number) => [...rows[i].querySelectorAll('td')].map((td) => td.textContent?.trim())
    expect(cells(0).slice(0, 8)).toEqual(['03:49', 'Red', '21.1 °C', '26209', '26208', '−1', '1.63', '2:10'])
    expect(cells(1).slice(0, 8)).toEqual(['00:46', 'Red', '23.0 °C', '26206', '26214', '+8', '1.62', '2:10'])
    expect(rows[0].getAttribute('aria-selected')).toBe('true')
    expect(el.textContent).toContain('Focused at 03:49 · Red')
    expect(el.textContent).toContain('moved −1 steps from 26209 · 2:10')
    expect(el.querySelectorAll('.drift svg circle').length).toBe(10)
    ;(rows[1] as HTMLElement).click()
    await settle()
    expect(el.textContent).toContain('Focused at 00:46 · Red')
    expect(el.textContent).toContain('moved +8 steps from 26206')
    expect(rows[1].getAttribute('aria-selected')).toBe('true')
    app.unmount()
  })

  it('says when the history table does not exist yet', async () => {
    const { el, app } = await page(() => json({ since: '2026-10-11T17:00:00Z', available: false, runs: [] }))
    expect(el.textContent).toContain('no autofocus table yet')
    expect(el.querySelector('table')).toBeNull()
    app.unmount()
  })

  it('says when there are no runs tonight', async () => {
    const { el, app } = await page(() => json({ since: '2026-10-11T17:00:00Z', available: true, runs: [] }))
    expect(el.textContent).toContain('No autofocus runs since 12:00 tonight.')
    expect(el.querySelector('table')).toBeNull()
    expect(el.querySelector('svg circle')).toBeNull()
    app.unmount()
  })

  it('shows the error when the history fails', async () => {
    const { el, app } = await page(() => json({ error: 'database down' }, 500))
    expect(el.textContent).toContain('Autofocus history is not available: database down')
    app.unmount()
  })

  it('shows the run in progress first', async () => {
    shell.scheduler = {
      reachable: 'online',
      autofocus: {
        run_id: 'live',
        state: 'running',
        started_at: '2026-10-12T08:58:36Z',
        filter: 'Red',
        points: tonight[1].points!.slice(0, 6),
      },
    }
    const { el, app } = await page(() => json({ since: '2026-10-11T17:00:00Z', available: true, runs: tonight }))
    expect(el.textContent).toContain('Running now')
    expect(el.textContent).toContain('Focusing · Red · 1:24')
    expect(el.textContent).toContain('point 6 · last focus 26208')
    expect(el.querySelector('tbody tr[aria-selected="true"]')).toBeNull()
    app.unmount()
  })
})

describe('AutofocusPanel', () => {
  it('draws a running run with the dashed fit so far', async () => {
    const run = tonight[1]
    const view = fromStatus(
      { run_id: 'x', state: 'running', started_at: '2026-10-12T05:44:00Z', filter: 'Red', points: run.points!.slice(0, 6) },
      tonight[2],
    )
    const { el, app } = await panel({ view, now: Date.parse('2026-10-12T05:45:24Z'), last: tonight[2] })
    expect(el.textContent).toContain('Focusing · Red · 1:24')
    expect(el.textContent).toMatch(/fit so far 262\d\d · HFR 1\.\d\d/)
    expect(el.textContent).toContain('best point 26226 · HFR 1.62')
    expect(el.textContent).toContain('last run 23:40 · 26206')
    expect(el.querySelector('path[stroke-dasharray="6 5"]')).not.toBeNull()
    expect(el.querySelectorAll('circle.latest')).toHaveLength(1)
    expect(el.querySelector('rect[fill="none"]')).not.toBeNull()
    app.unmount()
  })

  it('asks for 4 points before fitting', async () => {
    const view = fromStatus({ run_id: 'x', state: 'running', points: tonight[1].points!.slice(0, 2) })
    const { el, app } = await panel({ view, now: NOW })
    expect(el.textContent).toContain('needs 4 points, has 2')
    expect(el.querySelector('path[stroke-dasharray="6 5"]')).toBeNull()
    app.unmount()
  })

  it('shows a failed run with its error', async () => {
    const view = fromStatus({
      run_id: 'f',
      state: 'failed',
      started_at: '2026-10-12T05:44:00Z',
      finished_at: '2026-10-12T05:45:10Z',
      filter: 'Red',
      error: 'Not enough stars detected',
      points: [],
    })
    const { el, app } = await panel({ view, now: NOW, history: true })
    expect(el.textContent).toContain('Autofocus failed at 00:45 · Red')
    expect(el.querySelector('.af-error')?.textContent).toContain('Not enough stars detected')
    expect(el.textContent).toContain('NINA recorded no points for this run.')
    expect(el.textContent).toContain('Autofocus history')
    app.unmount()
  })

  it('shows a finished run with NINA fit and chosen marker', async () => {
    const r = tonight[1]
    const view = fromStatus({ ...r, run_id: r.id, state: 'finished' })
    const { el, app } = await panel({ view, now: NOW })
    expect(el.textContent).toContain('Focused at 00:46 · Red')
    expect(el.textContent).toContain('moved +8 steps from 26206 · 2:10')
    expect(el.textContent).toContain("NINA's hyperbolic fit")
    expect(el.textContent).toContain('9 points, 10 steps apart')
    expect(el.querySelector('rect[fill="var(--warn)"]')).not.toBeNull()
    expect(el.querySelector('path[stroke-dasharray="6 5"]')).toBeNull()
    app.unmount()
  })
})
