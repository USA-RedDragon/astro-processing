import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import SkyEventsPage from '@/scheduler/pages/SkyEventsPage.vue'
import type { SkyEvent, SkyEvents } from '@/scheduler/api/skyEvents'
import real from './fixtures/skyEventsReal.json'
import mosaicEvent from './fixtures/skyEventMosaic.json'

afterEach(() => vi.unstubAllGlobals())

function event(over: Partial<SkyEvent> = {}): SkyEvent {
  return {
    id: 'mars-m-44-2026-10-12',
    kind: 'body-dso',
    title: 'Mars with M 44 Beehive',
    members: [
      { name: 'Mars', kind: 'planet', designation: null, type: null, diameter_deg: 0.003, magnitude: 0.9 },
      { name: 'M 44 Beehive', kind: 'dso', designation: 'M 44', type: 'open-cluster', diameter_deg: 1.81, magnitude: null },
    ],
    first_night: '2026-10-12',
    last_night: '2026-10-13',
    nights: 2,
    start: '2026-10-13T06:45:00Z',
    end: '2026-10-14T10:15:00Z',
    best: { at: '2026-10-13T08:30:00Z', separation_deg: 1.01, altitude_deg: 17 },
    hours_in_frame: 7,
    frame: {
      center_ra: 130.6,
      center_dec: 19.5,
      rotation_deg: 17.6,
      width_deg: 3.32,
      height_deg: 2.22,
      objects: [
        { name: 'Mars', kind: 'planet', type: null, east_deg: 0.481, north_deg: -0.153, x_deg: -0.5, y_deg: 0, diameter_deg: 0.003 },
        { name: 'M 44 Beehive', kind: 'dso', type: 'open-cluster', east_deg: -0.481, north_deg: 0.153, x_deg: 0.5, y_deg: 0, diameter_deg: 1.81 },
      ],
    },
    moving_center: false,
    night_windows: [],
    exposure: { short_seconds: null, normal_seconds: null, basis: 'No sub of this pairing yet.' },
    priority: 'normal',
    plan: null,
    ...over,
  }
}

function body(over: Partial<SkyEvents> = {}): SkyEvents {
  return {
    status: 'ready',
    reason: null,
    computed_at: '2026-10-12T05:10:00Z',
    from: '2026-10-12T05:00:00Z',
    to: '2028-10-12T05:00:00Z',
    months: 24,
    criteria: {
      sun_below_deg: -12,
      min_altitude_deg: 15,
      step_minutes: 30,
      usable_width_deg: 3,
      usable_height_deg: 1.9,
      basis: 'Usable area is the frame less a margin.',
    },
    frame: { width_deg: 3.32, height_deg: 2.22, basis: 'From the NINA profile.' },
    bodies: [{ name: 'Mars', kind: 'planet', source: 'DE440' }],
    body_errors: [],
    planning: { available: true, reason: null },
    events: [event()],
    ...over,
  }
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

async function render(handler: Handler) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', fetch)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/sky-events', component: SkyEventsPage }],
  })
  router.push('/sky-events')
  await router.isReady()
  const el = document.createElement('div')
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(el)
  await settle()
  return { el, app, fetch }
}

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

describe('SkyEventsPage', () => {
  it('shows a 2-panel mosaic with two frames', async () => {
    const { el, app } = await render(() => json(body({ events: [mosaicEvent as SkyEvent] })))
    const card = el.querySelector('article.ev')!
    expect(card.textContent).toContain('Moon with Mars, Jupiter')
    expect(card.textContent).toContain('2-panel mosaic')
    expect(card.textContent).toContain('panels follow the bodies')
    expect(card.textContent).toContain('widest separation')
    expect(card.querySelectorAll('svg.sky rect')).toHaveLength(2)
    expect(card.querySelector('svg.sky')!.getAttribute('aria-label')).toContain('2-panel mosaic')
    app.unmount()
  })

  it('renders a stacker response', async () => {
    const { el, app } = await render(() => json(real))
    const cards = el.querySelectorAll('article.ev')
    expect(cards).toHaveLength(2)
    const mars = cards[0]!.textContent ?? ''
    expect(mars).toContain('Mars with M 44 Beehive')
    expect(mars).toContain('nights of 7 Oct to 13 Oct 2026')
    expect(mars).toContain('Sun 11 Oct, 06:30 CDT')
    expect(mars).toContain('0.09°')
    expect(mars).toContain('Exposures: short 0.0041 s, normal not measured yet.')
    expect(mars).toContain('Normal set not measured yet: no L exposure length is known.')
    expect(cards[1]!.textContent).toContain('two bodies')
    expect(el.querySelectorAll('.lane')).toHaveLength(2)
    expect(button(el, 'Plan it')!.disabled).toBe(false)
    app.unmount()
  })

  it('asks for 24 months and draws one card and lane per event', async () => {
    const { el, app, fetch } = await render(() => json(body()))
    expect(fetch.mock.calls[0]![0]).toBe('/api/v1/sky-events?months=24')
    expect(el.textContent).toContain('1 event in the next 24 months')
    expect(el.querySelector<HTMLElement>('.strip')!.style.width).toBe('max(100%, 66rem)')
    expect(el.textContent).toContain('Events fill gaps. Mark one high priority')
    expect(el.querySelectorAll('article.ev')).toHaveLength(1)
    expect(el.querySelectorAll('.lane')).toHaveLength(1)
    expect(el.querySelector('.lane em')?.textContent).toContain('Mars + M 44')
    expect(el.querySelector('svg.sky rect')?.getAttribute('stroke-dasharray')).toBe('4 3')
    expect(el.textContent).toContain('near a deep-sky object')
    expect(el.textContent).toContain('2 nights')
    expect(el.textContent).toContain('Tue 13 Oct, 03:30 CDT')
    expect(el.textContent).toContain('1.01°')
    expect(el.textContent).toContain('Exposure not measured yet. No sub of this pairing yet.')
    app.unmount()
  })

  it('shows the reason while the search is pending', async () => {
    const { el, app } = await render(() =>
      json(body({ status: 'pending', reason: 'Computing the next six months, about two minutes.', events: [] })),
    )
    expect(el.textContent).toContain('Searching the next 24 months')
    expect(el.textContent).toContain('Computing the next six months, about two minutes.')
    expect(el.querySelector('article.ev')).toBeNull()
    app.unmount()
  })

  it('shows the reason when unavailable', async () => {
    const { el, app } = await render(() =>
      json(body({ status: 'unavailable', reason: 'No site coordinates in the NINA profile.', events: null })),
    )
    expect(el.textContent).toContain('Sky events are not available')
    expect(el.textContent).toContain('No site coordinates in the NINA profile.')
    app.unmount()
  })

  it('says no events with the criteria', async () => {
    const { el, app } = await render(() => json(body({ events: [] })))
    expect(el.textContent).toContain('No events in the next 24 months')
    expect(el.textContent).toContain('Sun below -12°')
    expect(el.textContent).toContain('Usable area is the frame less a margin.')
    expect(el.querySelector('.strip')).toBeNull()
    app.unmount()
  })

  it('shows a fetch error and retries', async () => {
    let n = 0
    const { el, app } = await render(() => (n++ ? json(body()) : json({ error: 'stacker down' }, 502)))
    expect(el.textContent).toContain('The stacker did not answer: stacker down')
    button(el, 'Try again')!.click()
    await settle()
    expect(el.querySelectorAll('article.ev')).toHaveLength(1)
    app.unmount()
  })

  it('disables Plan it with the reason when planning is off and lists body errors', async () => {
    const { el, app } = await render(() =>
      json(
        body({
          planning: { available: false, reason: 'Install the plugin with event windows first.' },
          body_errors: [{ name: '12P/Pons-Brooks', error: 'JPL Horizons timed out' }],
        }),
      ),
    )
    expect(button(el, 'Plan it')!.disabled).toBe(true)
    expect(el.textContent).toContain('Install the plugin with event windows first.')
    expect(el.textContent).toContain('12P/Pons-Brooks')
    expect(el.textContent).toContain('JPL Horizons timed out')
    app.unmount()
  })

  it('plans with the current priority, shows the plan state and unplans', async () => {
    const sent: { url: string; body: unknown }[] = []
    const command = { id: 'c1', kind: 'project.create', status: 'queued', title: 'Add Mars with M 44', category: 'created' }
    const { el, app } = await render((url, init) => {
      if (init?.method === 'POST') {
        sent.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined })
        if (url.endsWith('/priority')) return json({ event: event({ priority: 'high' }), command: null })
        if (url.endsWith('/plan'))
          return json({
            event: event({
              priority: 'high',
              plan: {
                state: 'queued',
                priority: 'high',
                project_guid: 'p',
                target_guid: 't',
                command_id: 'c1',
                planned_at: '2026-10-12T06:40:00Z',
                message: null,
              },
            }),
            command,
          })
        if (url.endsWith('/unplan'))
          return json({
            event: event({
              priority: 'high',
              plan: {
                state: 'undone',
                priority: 'high',
                project_guid: 'p',
                target_guid: 't',
                command_id: 'c1',
                planned_at: '2026-10-12T06:40:00Z',
                message: null,
              },
            }),
            command: { ...command, id: 'c2', status: 'queued' },
          })
      }
      return json(body())
    })
    const box = el.querySelector<HTMLInputElement>('input[type=checkbox]')!
    box.checked = true
    box.dispatchEvent(new Event('change'))
    await settle()
    expect(sent[0]).toEqual({ url: '/api/v1/sky-events/mars-m-44-2026-10-12/priority', body: { priority: 'high' } })
    expect(el.querySelector('.lane .bar')?.classList.contains('hi')).toBe(true)

    button(el, 'Plan it')!.click()
    await settle()
    expect(sent[1]).toEqual({ url: '/api/v1/sky-events/mars-m-44-2026-10-12/plan', body: { priority: 'high' } })
    expect(el.querySelector('.actions .badge')?.textContent).toBe('Queued')
    expect(button(el, 'Plan it')).toBeUndefined()

    button(el, 'Unplan')!.click()
    await settle()
    expect(sent[2]!.url).toBe('/api/v1/sky-events/mars-m-44-2026-10-12/unplan')
    expect(button(el, 'Plan it')).toBeDefined()
    expect(el.querySelector('.actions .badge')?.textContent).toBe('Unplanned')
    app.unmount()
  })

  it('shows a failed plan with its message and an error from the stacker', async () => {
    const failed = event({
      plan: {
        state: 'failed',
        priority: 'normal',
        project_guid: 'p',
        target_guid: 't',
        command_id: 'c',
        planned_at: '2026-10-12T06:40:00Z',
        message: 'No exposure template for this pairing.',
      },
    })
    const { el, app } = await render((_url, init) =>
      init?.method === 'POST' ? json({ error: 'already planned' }, 409) : json(body({ events: [failed] })),
    )
    expect(el.querySelector('.actions .badge')?.textContent).toBe('Failed')
    expect(el.textContent).toContain('No exposure template for this pairing.')
    button(el, 'Plan it')!.click()
    await settle()
    expect(el.querySelector('.plan-err')?.textContent).toBe('already planned')
    app.unmount()
  })

  it('fetches the months picked', async () => {
    const { el, app, fetch } = await render((url) => json(body({ months: url.endsWith('=6') ? 6 : 24 })))
    const pick = el.querySelector<HTMLSelectElement>('#ev-months')!
    expect([...pick.options].map((o) => o.value)).toEqual(['3', '6', '12', '24'])
    expect(pick.value).toBe('24')
    pick.value = '6'
    pick.dispatchEvent(new Event('change'))
    await settle()
    expect(fetch.mock.calls.at(-1)![0]).toBe('/api/v1/sky-events?months=6')
    expect(el.textContent).toContain('1 event in the next six months')
    app.unmount()
  })

  it('puts rare events first in their own group with a badge, a colour and the auto plan', async () => {
    const common = event({
      rarity: {
        status: 'ready',
        reason: null,
        searched_from: '1976-10-13T00:00:00Z',
        searched_to: '2076-10-13T00:00:00Z',
        previous: { start: '', end: '', first_night: '2025-05-01', last_night: '2025-05-09', best: '2025-05-05T06:00:00Z', separation_deg: 0.64 },
        next: { start: '', end: '', first_night: '2028-09-13', last_night: '2028-09-20', best: '2028-09-17T10:00:00Z', separation_deg: 0.35 },
        previous_years: 1.44,
        next_years: 1.94,
        interval_years: 1.44,
        rare: false,
        basis: 'The same members checked every 30 minutes.',
      },
    })
    const rare = event({
      id: 'jupiter-saturn-2027-01-01',
      kind: 'body-body',
      title: 'Jupiter with Saturn',
      start: '2027-01-01T01:00:00Z',
      end: '2027-01-20T03:00:00Z',
      priority: 'high',
      rarity: {
        status: 'ready',
        reason: null,
        searched_from: '1977-01-01T00:00:00Z',
        searched_to: '2077-01-01T00:00:00Z',
        previous: { start: '', end: '', first_night: '1981-08-07', last_night: '1981-08-08', best: '1981-08-08T02:30:00Z', separation_deg: 1.55 },
        next: { start: '', end: '', first_night: '2040-11-11', last_night: '2040-11-14', best: '2040-11-12T12:00:00Z', separation_deg: 1.58 },
        previous_years: 39.34,
        next_years: 19.92,
        interval_years: 19.92,
        rare: true,
        basis: 'The same members checked every 30 minutes.',
      },
      plan: {
        state: 'queued',
        priority: 'high',
        project_guid: 'p',
        target_guid: 't',
        command_id: 'c1',
        planned_at: '2026-10-12T06:40:00Z',
        message: null,
        automatic: true,
      },
      auto_plan: { state: 'planned', reason: null, at: '2026-10-12T06:40:00Z' },
    })
    const { el, app } = await render(() => json(body({ events: [common, rare] })))
    const groups = el.querySelectorAll('section.events')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.querySelector('h3')?.textContent).toBe('Rare')
    expect(groups[0]!.textContent).toContain('Jupiter with Saturn')
    expect(groups[0]!.querySelector('.badge.rare')?.textContent).toBe('Rare: once in 20 years')
    expect(groups[0]!.textContent).toContain('Planned automatically')
    expect(groups[0]!.textContent).toContain('Previous 7 Aug 1981, 39 years before. Next 11 Nov 2040, 20 years after.')
    expect(groups[1]!.querySelector('h3')?.textContent).toBe('Other events')
    expect(groups[1]!.textContent).toContain('once in 1.4 years')
    expect(groups[1]!.querySelector('.badge.rare')).toBeNull()
    const bars = el.querySelectorAll('.lane .bar')
    expect(bars[0]!.classList.contains('rare')).toBe(true)
    expect(bars[1]!.classList.contains('rare')).toBe(false)
    expect(el.textContent).toContain('Rarity. The same members checked every 30 minutes.')
    app.unmount()
  })

  it('says when a rare event plans itself and when the search found no recurrence', async () => {
    const lone = event({
      rarity: {
        status: 'ready',
        reason: null,
        searched_from: '1976-10-13T00:00:00Z',
        searched_to: '2076-10-13T00:00:00Z',
        previous: null,
        next: null,
        previous_years: null,
        next_years: null,
        interval_years: null,
        rare: true,
        basis: '',
      },
      auto_plan: { state: 'waiting', reason: 'Planned at high priority once the scheduler takes event windows.', at: null },
    })
    const { el, app } = await render(() => json(body({ events: [lone] })))
    expect(el.querySelector('.badge.rare')?.textContent).toBe('Rare: no recurrence before 2076')
    expect(el.textContent).toContain('None earlier back to 1976. None later up to 2076.')
    expect(el.textContent).toContain('Plans itself')
    expect(el.textContent).toContain('Planned at high priority once the scheduler takes event windows.')
    app.unmount()
  })
})
