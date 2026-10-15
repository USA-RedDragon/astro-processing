import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import DiscoveriesPage from '@/scheduler/pages/DiscoveriesPage.vue'
import type { DiscoverySource, DiscoverySourceList } from '@/scheduler/api/discoveries'
import { cygnus, nova, run } from './fixtures/discoveries'

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
    routes: [
      { path: '/discoveries', component: DiscoveriesPage },
      { path: '/discoveries/report/:id', component: { render: () => null } },
    ],
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

const page = (sources: DiscoverySource[] = [cygnus(), nova()]): DiscoverySourceList => ({
  sources,
  total: sources.length,
  counts: { look: 2, known: 1199, movers: 49, new_movers: 0, low: 1265, vetted: 0, all: 2515 },
  since: '2026-09-14',
})

const recentRuns = () => [
  run({
    id: 30,
    object: "Barnard's E",
    night: '2026-10-13',
    night_subs: 14,
    ref_subs: 12,
    depth: 17.9,
    needs_look: 5,
    classes: { known_variable: 101 },
    tracks: 0,
  }),
  run({
    id: 31,
    object: 'M 15',
    night: '2026-10-13',
    state: 'skipped',
    error: 'too few subs',
    depth: null,
  }),
]

function stacker(over: Partial<Record<string, unknown>> = {}): Handler {
  let vetted: Partial<DiscoverySource> = {}
  return (url, init) => {
    const p = new URL(url, 'http://x').pathname
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      vetted = { vetting: body.state, vet_note: body.note, needs_look: !body.state }
      return json(cygnus(vetted))
    }
    if (p === '/api/v1/discoveries/sources')
      return json(over.sources ?? page([cygnus(vetted), nova()]))
    if (p === '/api/v1/discoveries/sources/77') return json(cygnus({ id: 77, object: 'Deep link' }))
    if (p === '/api/v1/discoveries/runs') return json(over.runs ?? recentRuns())
    if (p === '/api/v1/discoveries/status')
      return json(over.status ?? { state: 'idle', queued: 0, done_in_pass: 0 })
    return json({ error: 'not found' }, 404)
  }
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as
    HTMLButtonElement | undefined

const pressed = (el: HTMLElement) =>
  [...el.querySelectorAll('.chip[aria-pressed="true"]')].map((b) => b.textContent?.trim() ?? '')

const sourceCalls = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls
    .map((c) => new URL(String(c[0]), 'http://x'))
    .filter((u) => u.pathname === '/api/v1/discoveries/sources')

describe('DiscoveriesPage', () => {
  it('says it is loading, not that nothing changed, while the sources are on their way', async () => {
    let release: () => void = () => {}
    const pending = new Promise<void>((r) => (release = r))
    const base = stacker()
    const { el, app } = await render(async (url, init) => {
      if (new URL(url, 'http://x').pathname === '/api/v1/discoveries/sources') await pending
      return base(url, init)
    })
    expect(el.textContent).toContain('Loading discoveries')
    expect(el.textContent).not.toContain('Nothing changed')
    release()
    await settle()
    await settle()
    expect(el.textContent).not.toContain('Loading discoveries')
    app.unmount()
  })

  it('opens on the sources that need a look in the last 30 days, one card per spot', async () => {
    const { el, app, fetch } = await render(stacker())
    const q = sourceCalls(fetch)[0]!.searchParams
    expect(q.get('view')).toBe('look')
    expect(q.get('since')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(q.get('night')).toBeNull()
    expect(pressed(el)).toEqual(['Needs a look 2'])
    expect(button(el, 'Known variables')!.textContent).toContain('1,199')
    expect(button(el, 'Moving objects')!.textContent).toContain('49 known')
    const cards = el.querySelectorAll('.src')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.textContent).toContain('Cygnis Loop Panel 2')
    expect(cards[0]!.textContent).toContain('20h 57m 17.0s +28° 43′ 07″')
    expect(cards[0]!.textContent).toContain('Fainter by 0.41 to 0.67 mag on 3 nights')
    expect(cards[0]!.textContent).toContain('seen on 3 of the 4 nights it was compared')
    expect(cards[0]!.querySelectorAll('.spark circle')).toHaveLength(4)
    expect(cards[1]!.classList.contains('nova')).toBe(true)
    const detail = el.querySelector('.detail')!
    expect(detail.querySelectorAll('.nrow')).toHaveLength(3)
    expect(detail.querySelectorAll('.nrow')[2]!.textContent).toContain('S-II and H-a · 6 of 7 subs')
    expect(detail.textContent).toContain('3 of the 4 nights this field was compared since Oct 5')
    expect(detail.textContent).toContain('Could not check: Star database')
    expect(detail.querySelector('a[href="/discoveries/report/14082"]')).not.toBeNull()
    expect(detail.querySelector('a[href^="https://simbad"]')).not.toBeNull()
    const rows = el.querySelectorAll('.recent tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('14 vs 12')
    expect(rows[0]!.textContent).toContain('5 need a look · 101 known variables')
    expect(rows[1]!.textContent).toContain('Skipped: too few subs')
    expect(rows[1]!.textContent).toContain('not measured')
    app.unmount()
  })

  it('opens the night from the morning-report link and lets it go', async () => {
    const { el, app, fetch, router } = await render(stacker(), '/discoveries?night=2026-10-06')
    const q = sourceCalls(fetch)[0]!.searchParams
    expect(q.get('night')).toBe('2026-10-06')
    expect(q.get('view')).toBeNull()
    expect(q.get('since')).toBeNull()
    expect(pressed(el)).toEqual([])
    button(el, 'Night of Oct 6')!.click()
    await settle()
    expect(router.currentRoute.value.query.night).toBeUndefined()
    expect(sourceCalls(fetch).at(-1)!.searchParams.get('view')).toBe('look')
    app.unmount()
  })

  it('switches views and keeps them in the query, a second click shows everything', async () => {
    const { el, app, fetch, router } = await render(stacker())
    button(el, 'Known variables')!.click()
    await settle()
    expect(router.currentRoute.value.query.show).toBe('known')
    expect(sourceCalls(fetch).at(-1)!.searchParams.get('view')).toBe('known')
    button(el, 'Known variables')!.click()
    await settle()
    expect(router.currentRoute.value.query.show).toBe('all')
    expect(sourceCalls(fetch).at(-1)!.searchParams.get('view')).toBeNull()
    app.unmount()
  })

  it('vets the whole source and clears it on a second click', async () => {
    const { el, app, fetch } = await render(stacker())
    const real = () =>
      [...el.querySelectorAll('.vet button')].find(
        (b) => b.textContent?.trim() === 'Real change',
      ) as HTMLButtonElement
    real().click()
    await settle()
    const put = fetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')!
    expect(String(put[0])).toBe('/api/v1/discoveries/sources/1/vetting')
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ state: 'real', note: '' })
    expect(real().classList.contains('primary')).toBe(true)
    real().click()
    await settle()
    const puts = fetch.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
    expect(JSON.parse(String((puts[1]![1] as RequestInit).body)).state).toBe('')
    app.unmount()
  })

  it('opens a source by its link even when it is not in the list', async () => {
    const { el, app } = await render(stacker(), '/discoveries?source=77')
    await settle()
    expect(el.querySelector('.detail h2')!.textContent).toContain('Deep link')
    app.unmount()
  })

  it('opens a recent night with everything it found', async () => {
    const { el, app, fetch, router } = await render(stacker())
    ;(el.querySelector('.recent tbody tr') as HTMLElement).click()
    await settle()
    expect(router.currentRoute.value.query).toMatchObject({
      night: '2026-10-13',
      target: "Barnard's E",
    })
    const q = sourceCalls(fetch).at(-1)!.searchParams
    expect(q.get('object')).toBe("Barnard's E")
    expect(q.get('view')).toBeNull()
    app.unmount()
  })

  it('says when comparisons are still running', async () => {
    const { el, app } = await render(
      stacker({
        runs: [run({ state: 'running' }), run({ id: 8, state: 'queued', group: 'H-a' })],
        status: {
          state: 'running',
          object: 'M 31',
          night: '2026-10-14',
          stage: 'saving',
          queued: 1,
          done_in_pass: 0,
        },
      }),
    )
    expect(el.textContent).toContain('Still comparing: 2 comparisons are queued or running')
    expect(el.textContent).toContain('Comparing M 31 Oct 14 2026: saving')
    app.unmount()
  })

  it('says when nothing changed and when the stacker is down', async () => {
    const counts = { look: 0, known: 0, movers: 0, new_movers: 0, low: 0, vetted: 0, all: 0 }
    const { el, app } = await render(stacker({ sources: { ...page([]), counts } }))
    expect(el.textContent).toContain('Nothing changed on these nights.')
    app.unmount()
    const down = await render(() => json({ error: 'stacker restarting' }, 502))
    expect(down.el.textContent).toContain('The stacker did not answer: stacker restarting')
    down.app.unmount()
  })
})
