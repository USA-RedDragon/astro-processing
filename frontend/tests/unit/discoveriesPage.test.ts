import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import DiscoveriesPage from '@/scheduler/pages/DiscoveriesPage.vue'
import type { DiscoveryCandidate } from '@/scheduler/api/discoveries'
import { candidate, run } from './fixtures/discoveries'

afterEach(() => vi.unstubAllGlobals())

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

async function render(handler: Handler, path = '/discoveries') {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', fetch)
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/discoveries', component: DiscoveriesPage }],
  })
  router.push(path)
  await router.isReady()
  const el = document.createElement('div')
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(el)
  await settle()
  await settle()
  return { el, app, fetch, router }
}

const list = (): DiscoveryCandidate[] => [
  candidate({ id: 11, snr: 50.5 }),
  candidate({ id: 12, class: 'low_confidence', snr: 5.8, delta_mag: null, night_mag: null, gaia_g: null, matches: [] }),
  candidate({ id: 13, kind: 'mover', class: 'known_asteroid', body_v: 17.9, present_in: 12, rate_arcsec_per_min: 0.57, offset_arcsec: 1.5, matches: [{ catalog: 'SkyBoT', name: 'Randoross', sep_arcsec: 1.5, mag: 17.9 }] }),
]

function stacker(over: Partial<Record<string, unknown>> = {}): Handler {
  return (url, init) => {
    const u = new URL(url, 'http://x')
    const p = u.pathname
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      const id = Number(p.split('/')[5])
      return json({ ...list().find((c) => c.id === id), vetting: body.state, vet_note: body.note })
    }
    if (p === '/api/v1/discoveries/nights')
      return json(over.nights ?? [{ night: '2025-02-28', runs: 1, candidates: 3, new: 0 }])
    if (p === '/api/v1/discoveries/runs') return json(over.runs ?? [run()])
    if (p === '/api/v1/discoveries/candidates') return json(over.candidates ?? list())
    if (p === '/api/v1/discoveries/status') return json(over.status ?? { state: 'idle', queued: 0, done_in_pass: 0 })
    const m = /^\/api\/v1\/discoveries\/candidates\/(\d+)$/.exec(p)
    if (m) {
      const c = list().find((x) => x.id === Number(m[1]))
      return json({
        ...c,
        run: run(),
        light: [
          { frame_id: 1, filter: 'Luminance', time: '2025-03-01T03:00:00Z', flux: 10, flux_err: 1, delta_mag: -0.2, mag_err: 0.03 },
          { frame_id: 2, filter: 'Luminance', time: '2025-03-01T04:00:00Z', flux: 12, flux_err: 1, delta_mag: -0.1, mag_err: 0.03 },
        ],
      })
    }
    return json({ error: 'not found' }, 404)
  }
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text))

describe('DiscoveriesPage', () => {
  it('says it is loading, not that nothing changed, while the night is still on its way', async () => {
    let release: () => void = () => {}
    const pending = new Promise<void>((r) => (release = r))
    const base = stacker()
    const { el, app } = await render(async (url, init) => {
      if (new URL(url, 'http://x').pathname === '/api/v1/discoveries/runs') await pending
      return base(url, init)
    }, '/discoveries?night=2025-02-28')
    expect(el.textContent).toContain('Loading discoveries')
    expect(el.textContent).not.toContain('No changes found')
    release()
    await settle()
    await settle()
    expect(el.textContent).not.toContain('Loading discoveries')
    app.unmount()
  })

  it('shows the newest night with chips, summary, cards and movers', async () => {
    const { el, app, router } = await render(stacker())
    expect((el.querySelector('#disc-night') as HTMLSelectElement).value).toBe('2025-02-28')
    expect(router.currentRoute.value.query.night).toBe('2025-02-28')
    expect(button(el, 'All')!.textContent).toContain('2')
    expect(button(el, 'Known variables')!.textContent).toContain('1')
    expect(el.querySelector('.summary')!.textContent).toContain('16 vs 48')
    expect(el.querySelector('.summary')!.textContent).toContain('20.2')
    const cards = el.querySelectorAll('.cand')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.classList.contains('known')).toBe(true)
    expect(cards[0]!.textContent).toContain('0.16 mag brighter')
    expect(cards[0]!.textContent).not.toContain('−0.16')
    expect(cards[1]!.textContent).toContain('not measured')
    expect(cards[1]!.textContent).toContain('no catalogued star')
    const detail = el.querySelector('.detail')!
    expect(detail.textContent).toContain('Candidate at 12h 37m 14.1s +14° 26′ 32″')
    expect(detail.textContent).toContain('Variable-star catalog, known asteroids, alert feeds, galaxy catalog')
    expect(detail.querySelectorAll('.chart circle')).toHaveLength(2)
    expect(detail.querySelector('a[href^="https://simbad"]')).not.toBeNull()
    const rows = el.querySelectorAll('.movers tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.textContent).toContain('Randoross')
    expect(rows[0]!.textContent).toContain('0.57″/min')
    expect(el.textContent).not.toContain('VSX,')
    app.unmount()
  })

  it('opens the night from the morning-report link and keeps chip state in the query', async () => {
    const { el, app, fetch, router } = await render(stacker(), '/discoveries?night=2025-02-28&show=low')
    const urls = fetch.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain('/api/v1/discoveries/runs?night=2025-02-28')
    expect(el.querySelectorAll('.cand')).toHaveLength(1)
    button(el, 'Known variables')!.click()
    await settle()
    expect(router.currentRoute.value.query.show).toBe('known')
    app.unmount()
  })

  it('vets the selected candidate and clears it on a second click', async () => {
    const { el, app, fetch } = await render(stacker())
    const real = () => [...el.querySelectorAll('.vet button')].find((b) => b.textContent?.trim() === 'Real change') as HTMLButtonElement
    real().click()
    await settle()
    const put = fetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')!
    expect(String(put[0])).toBe('/api/v1/discoveries/candidates/11/vetting')
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ state: 'real', note: '' })
    expect(real().classList.contains('primary')).toBe(true)
    real().click()
    await settle()
    const puts = fetch.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
    expect(JSON.parse(String((puts[1]![1] as RequestInit).body)).state).toBe('')
    app.unmount()
  })

  it('says when no night has been compared yet', async () => {
    const { el, app } = await render(stacker({ nights: [] }))
    expect(el.textContent).toContain('once the target has 3 nights of subs')
    app.unmount()
  })

  it('says when a night is still being compared', async () => {
    const { el, app } = await render(
      stacker({
        nights: [],
        runs: [run({ state: 'running' }), run({ id: 8, state: 'queued', group: 'H-a' })],
        candidates: [],
        status: { state: 'running', object: 'M 31', night: '2026-10-14', stage: 'saving', queued: 1, done_in_pass: 0 },
      }),
      '/discoveries?night=2026-10-14',
    )
    expect(el.textContent).toContain('Still comparing this night: 2 comparisons are queued or running')
    expect(el.textContent).toContain('Comparing M 31 Oct 14 2026: saving')
    expect(el.querySelector('.summary')!.textContent).toContain('not measured')
    app.unmount()
  })
})
