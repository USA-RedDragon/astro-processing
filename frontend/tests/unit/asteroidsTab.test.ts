import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

vi.mock('@/scheduler/api/events', () => ({ onEvent: () => () => {}, onReconnect: () => () => {} }))

import AsteroidsTab from '@/scheduler/components/AsteroidsTab.vue'

afterEach(() => vi.unstubAllGlobals())

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const win = {
  hours: 5.5,
  start: '2026-10-13T06:00:00Z',
  end: '2026-10-13T11:30:00Z',
  peak_alt: 63,
  peak_at: '2026-10-13T08:10:00Z',
}

function asteroid(
  name: string,
  designation: string,
  magnitude: number,
  rate: number,
  extra: Record<string, unknown> = {},
) {
  return {
    name,
    designation,
    number: null,
    full_name: name,
    kind: 'asteroid',
    horizons_command: designation + ';',
    h: 5,
    g: 0.15,
    magnitude,
    magnitude_source: 'two-body',
    position_source: 'two-body',
    neo: false,
    r_au: 2.91,
    delta_au: 2.4,
    phase_angle: 18,
    ra: 110.4,
    dec: 23.4,
    rate_arcsec_per_min: rate,
    window: win,
    ...extra,
  }
}

function tonight(list: unknown[], extra: Record<string, unknown> = {}) {
  return {
    computed_at: '2026-10-12T20:00:00Z',
    night: { start: '2026-10-12T23:00:00Z' },
    min_altitude: 30,
    max_magnitude: 12,
    elements: {
      source: 'https://ssd-api.jpl.nasa.gov/sbdb_query.api',
      fetched_at: '2026-10-12T12:00:00Z',
      asteroids: 13737,
    },
    close_approaches: {
      source: 'https://ssd-api.jpl.nasa.gov/cad.api',
      fetched_at: '2026-10-12T12:00:00Z',
      asteroids: 18,
    },
    basis: '',
    asteroids: list,
    ...extra,
  }
}

const calls: { url: string; method: string; body: unknown }[] = []

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

async function render(routes: Record<string, () => Response>) {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const key = Object.keys(routes).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k]
        return m === method && url.includes(path)
      })
      return key ? routes[key]() : json({ error: 'not found' }, 404)
    }),
  )
  const el = document.createElement('div')
  const app = createApp(AsteroidsTab)
  app.mount(el)
  await settle()
  return { el, app }
}

describe('AsteroidsTab', () => {
  it('asks for V 12 and 30 degrees', async () => {
    const { app } = await render({})
    const get = calls.find((c) => c.url.includes('/asteroids'))!
    expect(get.url).toContain('/api/v1/asteroids?max_mag=12&min_alt=30')
    app.unmount()
  })

  it('shows a designed empty state and no rows when the endpoint is missing', async () => {
    const { el, app } = await render({})
    expect(el.querySelector('.blank')?.textContent).toContain(
      'No asteroid list on this stacker yet',
    )
    expect(el.querySelectorAll('tbody tr').length).toBe(0)
    app.unmount()
  })

  it('shows the stacker reason on 503 and no rows', async () => {
    const { el, app } = await render({
      '/asteroids': () => json({ error: 'no asteroid elements yet' }, 503),
    })
    const blank = el.querySelector('.blank')?.textContent
    expect(blank).toContain('The asteroid list is not available')
    expect(blank).toContain('no asteroid elements yet')
    expect(el.querySelectorAll('tbody tr').length).toBe(0)
    app.unmount()
  })

  it('says none are up when the list is empty, with the limits', async () => {
    const { el, app } = await render({ '/asteroids': () => json(tonight([])) })
    const blank = el.querySelector('.blank')?.textContent
    expect(blank).toContain('No asteroids tonight')
    expect(blank).toContain('No asteroid brighter than V 12 gets above 30° in darkness tonight.')
    expect(el.querySelectorAll('tbody tr').length).toBe(0)
    app.unmount()
  })

  it('lists asteroids brightest first, flags NEOs and marks added ones', async () => {
    const view = tonight(
      [
        asteroid('7 Iris', '7', 9.1, 0.9),
        asteroid('2026 TC6', '2026 TC6', 11.4, 5.21, {
          neo: true,
          position_source: 'horizons',
          magnitude_source: 'horizons',
          delta_au: 0.04,
          r_au: 1.02,
        }),
        asteroid('1 Ceres', '1', 8.5, 0.58),
      ],
      {
        elements: {
          source: 'https://ssd-api.jpl.nasa.gov/sbdb_query.api',
          fetched_at: '2026-10-12T12:00:00Z',
          asteroids: 13737,
          error: 'refresh failed, using yesterday',
        },
      },
    )
    const created = {
      id: 'c1',
      kind: 'project.create',
      payload: { project: { guid: 'g' }, targets: [{ designation: '1', kind: 'asteroid' }] },
      status: 'applied',
      created_at: '2026-10-12T01:00:00Z',
      updated_at: '2026-10-12T01:00:00Z',
    }
    const { el, app } = await render({
      '/asteroids': () => json(view),
      '/commands': () =>
        json([
          created,
          {
            ...created,
            id: 'c2',
            status: 'rejected',
            message: 'unknown target kind',
            payload: { project: { guid: 'h' }, targets: [{ designation: '2026 TC6' }] },
          },
        ]),
      '/bodies': () => json({ tables: [] }),
    })
    expect(el.querySelector('h2')?.textContent).toBe('3 asteroids up tonight')
    expect([...el.querySelectorAll('thead th')].map((t) => t.textContent)).toContain('V')
    const rows = [...el.querySelectorAll('tbody tr')]
    expect(rows.map((r) => r.querySelector('td div')?.textContent?.trim())).toEqual([
      '1 Ceres',
      '7 Iris',
      expect.stringContaining('2026 TC6'),
    ])
    expect(rows[0].textContent).toContain('8.5')
    expect(rows[0].textContent).toContain('1 · 2.40 au from Earth · 2.91 au from the Sun')
    expect(rows[0].textContent).toContain('two-body')
    expect(rows[0].textContent).toContain('Added')
    expect(rows[0].querySelector('.badge.warn')).toBeNull()
    expect(rows[0].textContent).not.toContain('short subs')
    expect(rows[2].querySelector('.badge.warn')?.textContent).toBe('NEO')
    expect(rows[2].textContent).toContain('0.04 au from Earth')
    expect(rows[2].textContent).not.toContain('2026 TC6 ·')
    expect(rows[2].textContent).toContain('Horizons')
    expect(rows[2].textContent).toContain('21 s')
    expect(rows[2].textContent).toContain('short subs')
    expect(rows[2].querySelector('.cap')).not.toBeNull()
    expect(rows[2].textContent).toContain('Not added: unknown target kind')
    expect(rows[2].textContent).toContain('Try again')
    expect(rows[2].textContent).toContain('01:00 to 06:30 CDT')
    expect(el.textContent).toContain('not measurements')
    expect(el.textContent).toContain('Elements from ssd-api.jpl.nasa.gov, 13,737 asteroids')
    expect(el.textContent).toContain('Close approaches from ssd-api.jpl.nasa.gov, 18 asteroids')
    expect(el.textContent).toContain('Asteroid elements: refresh failed, using yesterday')
    expect(el.querySelector('.blank')).toBeNull()
    app.unmount()
  })

  const tmpl = (id: number, name: string, filter: string) => ({ id, name, filter, usedByPlans: 2 })
  const planning = {
    projects: [{ priority: 'High', minimumTime: 45 }],
    templates: [
      tmpl(1, 'Luminance', 'L'),
      tmpl(2, 'R 600', 'R'),
      tmpl(3, 'G 600', 'G'),
      tmpl(4, 'B 600', 'B'),
    ],
    sets: [],
    defaults: {},
  }
  const drafted = {
    project: { guid: 'p', name: '1 Ceres' },
    targets: [{ guid: 't', name: '1 Ceres', plans: [] }],
    goals: [],
  }
  const queued = () =>
    json({
      id: 'n',
      kind: 'project.create',
      status: 'queued',
      payload: {},
      created_at: '',
      updated_at: '',
    })

  it('adds LRGB with the designation and kind asteroid on the target', async () => {
    const { el, app } = await render({
      '/asteroids': () => json(tonight([asteroid('1 Ceres', '1', 8.5, 0.58)])),
      '/commands': () => json([]),
      'POST /planning/projects/draft': () => json(drafted),
      '/planning': () => json(planning),
      'POST /commands': queued,
    })
    ;(el.querySelector('tbody button') as HTMLButtonElement).click()
    await settle()
    const panel = el.querySelector('.addpanel')!
    expect(panel.querySelector('select')).toBeNull()
    expect(panel.textContent).toContain('Add 1 Ceres to the scheduler')
    expect(panel.textContent).toContain('Luminance, Red, Green, Blue')
    expect(panel.textContent).toContain('Subs: up to 197 s so the asteroid stays sharp')
    expect(panel.textContent).toContain('Priority High, minimum altitude 30°, minimum time 45 min.')
    const draft = calls.find((c) => c.url.includes('/planning/projects/draft'))!
    expect(draft.body).toMatchObject({
      name: '1 Ceres',
      setId: '',
      desired: 0,
      minimumAltitude: 30,
      plans: [{ templateId: 1 }, { templateId: 2 }, { templateId: 3 }, { templateId: 4 }],
      goal: { kind: 'snr', snr: 0, depth: 0 },
      panels: [{ name: '1 Ceres', dec: 23.4 }],
    })
    const add = [...panel.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add 1 Ceres'),
    )!
    expect(add.disabled).toBe(false)
    add.click()
    await settle()
    const sent = calls.find((c) => c.method === 'POST' && c.url.endsWith('/commands'))!
    expect(sent.body).toMatchObject({
      kind: 'project.create',
      payload: { targets: [{ designation: '1', kind: 'asteroid' }] },
    })
    expect(el.querySelector('.addpanel')).toBeNull()
    app.unmount()
  })

  it('blocks Add when the asteroid moves more than a pixel per second', async () => {
    const { el, app } = await render({
      '/asteroids': () =>
        json(tonight([asteroid('2026 TC6', '2026 TC6', 11.4, 200, { neo: true })])),
      '/commands': () => json([]),
      'POST /planning/projects/draft': () => json(drafted),
      '/planning': () => json(planning),
    })
    const row = el.querySelector('tbody tr')!
    expect(row.textContent).toContain('under 1 s')
    ;(row.querySelector('button') as HTMLButtonElement).click()
    await settle()
    const panel = el.querySelector('.addpanel')!
    expect(panel.textContent).toContain('no sub length keeps it sharp')
    const add = [...panel.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add 2026 TC6'),
    )!
    expect(add.disabled).toBe(true)
    app.unmount()
  })
})
