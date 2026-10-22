import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import EclipsePlannerPage from '@/scheduler/pages/EclipsePlannerPage.vue'
import type { EclipsePlan } from '@/scheduler/api/binaries'
import { dip, eclipse, plan } from './fixtures/binaries'

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
    routes: [
      { path: '/discoveries/eclipses', name: 'discovery-eclipses', component: EclipsePlannerPage },
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
    request: { id: 41, state: 'sent', note: 'Made-up project made', auto: false },
  }),
  eclipse({ day_label: 'Wed Oct 21', mid: '2026-10-21T08:00:00Z', time_label: '3:00 AM' }),
]

function stacker(over: Partial<EclipsePlan> = {}): Handler {
  return (url, init) => {
    const p = new URL(url, 'http://x').pathname
    if (p === '/api/v1/discoveries/eclipses/requests' && init?.method === 'POST')
      return json({ id: 55, state: 'waiting', note: '', auto: false })
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
    const chips = [...el.querySelectorAll('.chip')].map((c) =>
      c.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(chips).toEqual(['Settles a flag 1', 'Period check 1', 'Dip windows 0', 'All 3'])
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
    const del = fetch.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
    )!
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
      json(
        plan([
          eclipse({
            purpose: 'flag',
            request: { id: 3, state: 'failed', note: 'Made-up scheduler error', auto: false },
          }),
        ]),
      ),
    )
    const row = el.querySelector('.ecl')!
    expect(row.textContent).toContain('Request failed')
    expect(row.textContent).toContain('Made-up scheduler error')
    expect(button(row, 'Request again')).toBeDefined()
    app.unmount()
  })

  it('says why a vague second eclipse is not requested and offers no request', async () => {
    const held =
      "Not requested: the second eclipse's timing is uncertain by ±5.7 h, so its dip could fall anywhere in 42.1 h, more than the 9.0 h the star is up in the dark that night. It comes back when its timing is measured better."
    const { el, app } = await render(() =>
      json(
        plan([
          eclipse({
            purpose: 'flag',
            kind: 'secondary',
            kind_label: 'Second eclipse',
            request: null,
            held,
          }),
        ]),
      ),
    )
    const row = el.querySelector('.ecl')!
    expect(row.textContent).toContain(held)
    expect(button(row, 'Request imaging')).toBeUndefined()
    app.unmount()
  })

  it('marks a request the app made and lets it be cancelled', async () => {
    const { el, app } = await render(() =>
      json(
        plan([
          eclipse({ purpose: 'flag', request: { id: 9, state: 'waiting', note: '', auto: true } }),
        ]),
      ),
    )
    const row = el.querySelector('.ecl')!
    expect(row.textContent).toContain('Requested')
    expect(row.textContent).toContain('Asked by the app')
    expect(button(row, 'Cancel request')).toBeDefined()
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

  it('lists dip windows in the night they fall in, with the dark time and the Every window badge', async () => {
    const { el, app, fetch } = await render((url, init) => {
      const p = new URL(url, 'http://x').pathname
      if (p === '/api/v1/discoveries/dippers/15523/requests' && init?.method === 'POST')
        return json({ id: 77, state: 'waiting', note: '', auto: false })
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return json(
        plan(rows(), {
          dips: [
            dip({ every_window: true }),
            dip({
              source_id: 15524,
              name: 'Made-up Dipper Two',
              mid: '2026-10-21T20:00:00Z',
              group_at: '2026-10-22T01:00:00Z',
              day_label: 'Wed Oct 21',
              dark_note: 'dark from 8:00 PM to 8:40 PM, 40 min',
              observable: false,
              observable_note: 'Not requested, under the 1 hour of usable dark a request needs',
            }),
          ],
        }),
      )
    })
    const chips = [...el.querySelectorAll('.chip')].map((c) =>
      c.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(chips).toEqual(['Settles a flag 1', 'Period check 1', 'Dip windows 2', 'All 5'])
    expect(el.textContent).toContain('A window when a dipper can dim')
    button(el, 'Dip windows')!.click()
    await settle()
    expect([...el.querySelectorAll('.day h3')].map((h) => h.textContent)).toEqual([
      'Tue Oct 20',
      'Wed Oct 21',
    ])
    const [first, second] = [...el.querySelectorAll('.ecl.dip')]
    const text = (e: Element) => e.textContent!.replace(/\s+/g, ' ')
    expect(text(first!)).toContain('5:35 AM to 1:35 AM CDT')
    expect(text(first!)).toContain('middle 3:35 PM Oct 20')
    expect(text(first!)).toContain('15523 · Test Field D · G 16.90')
    expect(first!.querySelector('.pill.dip')!.textContent).toBe('Dip window')
    expect(text(first!)).toContain('dark from 7:05 PM to 1:35 AM, 6 h 30 min')
    expect(text(first!)).toContain('Made-up reason: a dip here would back the cycle.')
    expect(first!.querySelector('.badge.info')!.textContent).toBe('Every window')
    expect(text(second!)).toContain(
      'Not requested, under the 1 hour of usable dark a request needs',
    )
    expect(button(second!, 'Request imaging')).toBeUndefined()
    expect(second!.querySelector('.badge.info')).toBeNull()

    button(first!, 'Request imaging')!.click()
    await settle()
    const post = calls(fetch, '/api/v1/discoveries/dippers/15523/requests')[0]!
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      mid: '2026-10-20T20:35:00Z',
    })
    const row = el.querySelector('.ecl.dip')!
    expect(text(row)).toContain('Requested')
    button(row, 'Cancel request')!.click()
    await settle()
    const del = fetch.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
    )!
    expect(String(del[0])).toBe('/api/v1/discoveries/eclipses/requests/77')
    expect(button(el.querySelector('.ecl.dip')!, 'Request imaging')).toBeDefined()
    app.unmount()
  })

  it('mixes a dip window among eclipses by time and filters it by star', async () => {
    const { el, app } = await render(
      () =>
        json(
          plan(rows(), {
            dips: [dip({ request: { id: 5, state: 'sent', note: '', auto: true } })],
          }),
        ),
      '/discoveries/eclipses?star=15523',
    )
    const shown = [...el.querySelectorAll('.ecl')]
    expect(shown).toHaveLength(1)
    expect(shown[0]!.classList.contains('dip')).toBe(true)
    expect(shown[0]!.textContent).toContain('Sent to the scheduler')
    expect(shown[0]!.textContent).toContain('Asked by the app')
    expect(button(shown[0]!, 'Cancel request')).toBeDefined()
    expect(button(shown[0]!, 'Request imaging')).toBeUndefined()
    ;(el.querySelector('#ecl-star') as HTMLSelectElement).value = '0'
    el.querySelector('#ecl-star')!.dispatchEvent(new Event('change'))
    await settle()
    const order = [...el.querySelectorAll('.day')][0]!.querySelectorAll('.ecl')
    expect([...order].map((e) => e.className.split(' ')[1])).toEqual(['flag', 'period', 'dip'])
    app.unmount()
  })
})
