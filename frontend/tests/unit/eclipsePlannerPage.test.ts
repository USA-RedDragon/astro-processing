import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import EclipsePlannerPage from '@/scheduler/pages/EclipsePlannerPage.vue'
import type { EclipsePlan } from '@/scheduler/api/binaries'
import { eclipse, plan } from './fixtures/binaries'

afterEach(() => vi.unstubAllGlobals())

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

async function render(handler: Handler, path = '/discoveries/eclipses') {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', fetch)
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/discoveries/eclipses', name: 'discovery-eclipses', component: EclipsePlannerPage }],
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

const rows = () => [
  eclipse({
    source_id: 7,
    name: 'Made-up Star Seven',
    field: 'Test Field S',
    purpose: 'flag',
    alt_period_text: '(or 2.5)',
    kind_label: 'Eclipse A (both equally deep)',
    why: 'Made-up: settles the period doubt.',
    err_minutes: 95,
    duration_hours: null,
  }),
  eclipse({
    source_id: 8,
    name: 'Made-up Star Eight',
    purpose: 'period',
    kind: 'secondary',
    kind_label: 'Second eclipse',
    mid: '2026-10-20T10:00:00Z',
    time_label: '5:00 AM',
    request: { id: 41, state: 'sent', note: 'Made-up project made' },
  }),
  eclipse({ day_label: 'Wed Oct 21', mid: '2026-10-21T08:00:00Z', time_label: '3:00 AM' }),
]

function stacker(over: Partial<EclipsePlan> = {}): Handler {
  return (url, init) => {
    const p = new URL(url, 'http://x').pathname
    if (p === '/api/v1/discoveries/eclipses/requests' && init?.method === 'POST')
      return json({ id: 55, state: 'waiting', note: '' })
    if (p.startsWith('/api/v1/discoveries/eclipses/requests/') && init?.method === 'DELETE')
      return new Response(null, { status: 204 })
    if (p === '/api/v1/discoveries/eclipses') return json(plan(rows(), { hidden: 4, ...over }))
    return json({ error: 'not found' }, 404)
  }
}

const button = (el: Element, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as
    HTMLButtonElement | undefined

const calls = (fetch: ReturnType<typeof vi.fn>, path: string) =>
  fetch.mock.calls.filter((c) => new URL(String(c[0]), 'http://x').pathname === path)

describe('EclipsePlannerPage', () => {
  it('opens on the eclipses that settle a flag, with the API time labels', async () => {
    const { el, app, fetch } = await render(stacker())
    const q = new URL(String(calls(fetch, '/api/v1/discoveries/eclipses')[0]![0]), 'http://x')
      .searchParams
    expect(q.get('days')).toBe('30')
    expect(q.get('all')).toBeNull()
    expect(el.textContent).toContain(
      'Predicted eclipses of your confirmed binaries from Sat Oct 17 to Mon Nov 16, 2026.',
    )
    expect(el.textContent).toContain('Times are US Central (made-up zone note).')
    const chips = [...el.querySelectorAll('.chip')].map((c) => c.textContent?.replace(/\s+/g, ' ').trim())
    expect(chips).toEqual(['Settles a flag 1', 'Period check 1', 'All 3'])
    const shown = el.querySelectorAll('.ecl')
    expect(shown).toHaveLength(1)
    expect(shown[0]!.classList.contains('flag')).toBe(true)
    const text = shown[0]!.textContent!.replace(/\s+/g, ' ')
    expect(text).toContain('3:00 AM CDT')
    expect(text).toContain('give or take 1.6 h')
    expect(text).toContain('every 7.25000 days (or 2.5)')
    expect(text).toContain('Eclipse A (both equally deep)')
    expect(text).toContain('lasts not measured yet')
    expect(text).toContain('Dark and 40° up at mid-eclipse')
    expect(text).toContain('Made-up: settles the period doubt.')
    expect(el.querySelector('.day h3')!.textContent).toBe('Tue Oct 20')
    expect(el.textContent).toContain('Hiding 4 eclipses the site cannot see.')
    app.unmount()
  })

  it('groups all eclipses by day and shows a request already sent', async () => {
    const { el, app } = await render(stacker())
    button(el, 'All')!.click()
    await settle()
    expect([...el.querySelectorAll('.day h3')].map((h) => h.textContent)).toEqual([
      'Tue Oct 20',
      'Wed Oct 21',
    ])
    const sent = el.querySelectorAll('.ecl')[1]!
    expect(sent.textContent).toContain('Sent to the scheduler')
    expect(sent.textContent).toContain('Made-up project made')
    expect(button(sent, 'Request imaging')).toBeUndefined()
    expect(button(sent, 'Cancel request')).toBeDefined()
    app.unmount()
  })

  it('preselects the star from the link and shows all its eclipses', async () => {
    const { el, app } = await render(stacker(), '/discoveries/eclipses?star=8')
    expect((el.querySelector('#ecl-star') as HTMLSelectElement).value).toBe('8')
    expect(el.querySelector('.chip[aria-pressed="true"]')!.textContent).toContain('All')
    const shown = el.querySelectorAll('.ecl')
    expect(shown).toHaveLength(1)
    expect(shown[0]!.textContent).toContain('Made-up Star Eight')
    app.unmount()
  })

  it('says when the linked star has no eclipses listed', async () => {
    const { el, app } = await render(stacker(), '/discoveries/eclipses?star=999')
    expect(el.querySelectorAll('.ecl')).toHaveLength(0)
    expect(el.textContent).toContain('No eclipses of this star in the next 30 days.')
    app.unmount()
  })

  it('requests imaging and cancels it', async () => {
    const { el, app, fetch } = await render(stacker())
    const row = () => el.querySelector('.ecl')!
    button(row(), 'Request imaging')!.click()
    await settle()
    const post = calls(fetch, '/api/v1/discoveries/eclipses/requests')[0]!
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      source_id: 7,
      kind: 'primary',
      mid: '2026-10-20T08:00:00Z',
    })
    expect(row().textContent).toContain('Requested')
    button(row(), 'Cancel request')!.click()
    await settle()
    const del = fetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')!
    expect(String(del[0])).toBe('/api/v1/discoveries/eclipses/requests/55')
    expect(button(row(), 'Request imaging')).toBeDefined()
    app.unmount()
  })

  it('asks for every eclipse with the toggle and blocks requests the site cannot see', async () => {
    const base = stacker()
    const { el, app, fetch, router } = await render((url, init) => {
      if (new URL(url, 'http://x').searchParams.get('all') === '1')
        return json(
          plan([
            eclipse({
              purpose: 'flag',
              observable: false,
              observable_note: 'Sun up',
            }),
          ]),
        )
      return base(url, init)
    })
    const box = el.querySelector('#ecl-all') as HTMLInputElement
    box.checked = true
    box.dispatchEvent(new Event('change'))
    await settle()
    const last = calls(fetch, '/api/v1/discoveries/eclipses').at(-1)!
    expect(new URL(String(last[0]), 'http://x').searchParams.get('all')).toBe('1')
    expect(router.currentRoute.value.query.all).toBe('1')
    expect(el.textContent).not.toContain('Hiding')
    const row = el.querySelector('.ecl')!
    expect(row.classList.contains('unseen')).toBe(true)
    expect(row.textContent).toContain('Sun up')
    expect(button(row, 'Request imaging')!.disabled).toBe(true)
    app.unmount()
  })

  it('shows a failed request with its note and offers to ask again', async () => {
    const { el, app } = await render(() =>
      json(plan([eclipse({ purpose: 'flag', request: { id: 3, state: 'failed', note: 'Made-up scheduler error' } })])),
    )
    const row = el.querySelector('.ecl')!
    expect(row.textContent).toContain('Request failed')
    expect(row.textContent).toContain('Made-up scheduler error')
    expect(button(row, 'Request again')).toBeDefined()
    app.unmount()
  })

  it('says when the site is not known and when the stacker is down', async () => {
    const { el, app } = await render(stacker({ site_known: false }))
    expect(el.textContent).toContain('The site location is not known yet')
    app.unmount()
    const down = await render(() => json({ error: 'stacker restarting' }, 502))
    expect(down.el.textContent).toContain('The stacker did not answer: stacker restarting')
    down.app.unmount()
  })
})
