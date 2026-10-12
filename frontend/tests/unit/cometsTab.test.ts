import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

vi.mock('@/scheduler/api/events', () => ({ onEvent: () => () => {}, onReconnect: () => () => {} }))

import CometsTab from '@/scheduler/components/CometsTab.vue'

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

function comet(name: string, mpc: number | null, jpl: number | null, rate: number) {
  return {
    name,
    designation: name.split('/')[0],
    horizons_command: name,
    orbit_type: 'P',
    perihelion: '2026-10-01T00:00:00Z',
    q_au: 1,
    e: 0.5,
    magnitude_mpc: mpc,
    magnitude_jpl: jpl,
    r_au: 1.41,
    delta_au: 0.59,
    ra: 150,
    dec: 20,
    rate_arcsec_per_min: rate,
    window: win,
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
  const app = createApp(CometsTab)
  app.mount(el)
  await settle()
  return { el, app }
}

describe('CometsTab', () => {
  it('shows a designed empty state and no rows when the endpoint is missing', async () => {
    const { el, app } = await render({})
    expect(el.querySelector('.blank')?.textContent).toContain('No comet list on this stacker yet')
    expect(el.querySelectorAll('tbody tr').length).toBe(0)
    app.unmount()
  })

  it('shows the stacker reason on 503 and no rows', async () => {
    const { el, app } = await render({
      '/comets': () => json({ error: 'the comet list is off' }, 503),
    })
    expect(el.querySelector('.blank')?.textContent).toContain('the comet list is off')
    expect(el.querySelectorAll('tbody tr').length).toBe(0)
    app.unmount()
  })

  it('lists comets by the brighter estimate with both magnitudes and marks added ones', async () => {
    const view = {
      computed_at: '2026-10-12T20:00:00Z',
      night: { start: '2026-10-12T17:00:00Z' },
      min_altitude: 30,
      max_magnitude: 15,
      elements: { source: 'MPC', fetched_at: '2026-10-12T12:00:00Z', comets: 900 },
      jpl_magnitudes: { source: 'JPL', fetched_at: null, comets: 800 },
      basis: '',
      comets: [comet('78P/Gehrels', 13.9, 12.1, 0.82), comet('161P/Hartley-IRAS', 9.6, 11.2, 5.21)],
    }
    const created = {
      id: 'c1',
      kind: 'project.create',
      payload: { project: { guid: 'g' }, targets: [{ designation: '78P' }] },
      status: 'applied',
      created_at: '2026-10-12T01:00:00Z',
      updated_at: '2026-10-12T01:00:00Z',
    }
    const { el, app } = await render({
      '/comets': () => json(view),
      '/commands': () =>
        json([
          created,
          {
            ...created,
            id: 'c2',
            status: 'rejected',
            message: 'unknown field designation',
            payload: { project: { guid: 'h' }, targets: [{ designation: '161P' }] },
          },
        ]),
      '/bodies': () => json({ error: 'the body position tables have not been built yet' }, 503),
    })
    const rows = [...el.querySelectorAll('tbody tr')]
    expect(rows.map((r) => r.querySelector('td')?.textContent)).toEqual([
      expect.stringContaining('161P/Hartley-IRAS'),
      expect.stringContaining('78P/Gehrels'),
    ])
    expect(rows[0].textContent).toContain('9.6')
    expect(rows[0].textContent).toContain('11.2')
    expect(rows[0].textContent).toContain('21 s')
    expect(rows[0].textContent).toContain('short subs')
    expect(rows[0].textContent).toContain('01:00 to 06:30 CDT')
    expect(rows[0].textContent).toContain('Not added: unknown field designation')
    expect(rows[0].textContent).toContain('Try again')
    expect(rows[1].textContent).toContain('139 s')
    expect(rows[1].textContent).not.toContain('short subs')
    expect(rows[1].textContent).toContain('Added')
    expect(el.textContent).toContain('model predictions')
    expect(el.querySelector('.blank')).toBeNull()
    app.unmount()
  })

  const tonight = {
    computed_at: '2026-10-12T20:00:00Z',
    night: { start: '2026-10-12T17:00:00Z' },
    min_altitude: 30,
    max_magnitude: 15,
    elements: { source: 'MPC', fetched_at: '2026-10-12T12:00:00Z', comets: 900 },
    jpl_magnitudes: { source: 'JPL', fetched_at: null, comets: 800 },
    basis: '',
    comets: [comet('161P/Hartley-IRAS', 9.6, 11.2, 5.21)],
  }
  const tmpl = (id: number, name: string, filter: string) => ({ id, name, filter, usedByPlans: 2 })
  const planning = (templates: unknown[]) => ({
    projects: [{ priority: 'High', minimumTime: 45 }],
    templates,
    sets: [
      {
        id: 's1',
        name: 'R 600, G 600, B 600, H-a, O-III, Luminance',
        items: ['R 600', 'G 600', 'B 600', 'H-a', 'O-III', 'Luminance'].map((t) => ({
          template: t,
          exposure: -1,
          desired: 20,
        })),
        projects: 7,
      },
    ],
    defaults: {},
  })
  const all = [
    tmpl(1, 'Luminance', 'L'),
    tmpl(2, 'R 600', 'R'),
    tmpl(3, 'G 600', 'G'),
    tmpl(4, 'B 600', 'B'),
    tmpl(5, 'H-a', 'H-a'),
    tmpl(6, 'O-III', 'O-III'),
  ]
  const drafted = {
    project: { guid: 'p', name: '161P/Hartley-IRAS' },
    targets: [{ guid: 't', name: '161P/Hartley-IRAS', plans: [] }],
    goals: [],
  }

  it('adds LRGB at the system length with goal-driven counts and no choices to make', async () => {
    const { el, app } = await render({
      '/comets': () => json(tonight),
      '/commands': () => json([]),
      'POST /planning/projects/draft': () => json(drafted),
      '/planning': () => json(planning(all)),
      'POST /commands': () =>
        json({
          id: 'n',
          kind: 'project.create',
          status: 'queued',
          payload: {},
          created_at: '',
          updated_at: '',
        }),
    })
    ;(el.querySelector('tbody button') as HTMLButtonElement).click()
    await settle()
    const panel = el.querySelector('.addpanel')!
    expect(panel.querySelector('select')).toBeNull()
    expect(panel.textContent).toContain('Luminance, Red, Green, Blue')
    expect(panel.textContent).toContain('Subs: up to 21 s so the comet stays sharp')
    expect(panel.textContent).toContain('Priority High, minimum altitude 30°, minimum time 45 min.')
    expect(panel.textContent).not.toContain('capped')
    const draft = calls.find((c) => c.url.includes('/planning/projects/draft'))!
    expect(draft.body).toMatchObject({
      desired: 0,
      filters: ['L', 'R', 'G', 'B'],
      goal: { kind: 'snr', snr: 0, depth: 0 },
    })
    expect(draft.body).not.toHaveProperty('setId')
    expect(draft.body).not.toHaveProperty('plans')
    const add = [...panel.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add 161P'),
    )!
    expect(add.disabled).toBe(false)
    add.click()
    await settle()
    const sent = calls.find((c) => c.method === 'POST' && c.url.endsWith('/commands'))!
    expect(sent.body).toMatchObject({
      kind: 'project.create',
      payload: { targets: [{ designation: '161P' }] },
    })
    const target = (sent.body as { payload: { targets: object[] } }).payload.targets[0]
    expect(target).not.toHaveProperty('kind')
    app.unmount()
  })

  it('says it is working out the window and drafts nothing until it knows', async () => {
    const { el, app } = await render({
      '/comets': () => json(tonight),
      '/commands': () => json([]),
      'POST /planning/projects/draft': () => json(drafted),
      '/bodies/nights': () => new Promise<Response>(() => {}) as unknown as Response,
      '/planning': () => json(planning(all)),
    })
    ;(el.querySelector('tbody button') as HTMLButtonElement).click()
    await settle()
    const panel = el.querySelector('.addpanel')!
    expect(panel.textContent).toContain('Working out its window above 30° over the next 90 nights…')
    expect(calls.some((c) => c.url.includes('/planning/projects/draft'))).toBe(false)
    app.unmount()
  })

  it('shortens the minimum time to half of a short window and says why', async () => {
    const short = {
      ...comet('332P/Ikeya-Murakami', 12.4, 12.2, 0.4),
      window: { ...win, hours: 1.2 },
    }
    const { el, app } = await render({
      '/comets': () => json({ ...tonight, comets: [short] }),
      '/commands': () => json([]),
      'POST /planning/projects/draft': () => json(drafted),
      '/bodies/nights': () => json({ typical_window_hours: 3.1, nights: [] }),
      '/planning': () => json(planning(all)),
    })
    ;(el.querySelector('tbody button') as HTMLButtonElement).click()
    await settle()
    const panel = el.querySelector('.addpanel')!
    expect(panel.textContent).toContain('Priority High, minimum altitude 30°, minimum time 35 min.')
    expect(panel.querySelector('[data-test="min-time-basis"]')?.textContent).toContain(
      "half of tonight's 72 min window, above 30° in full darkness, at least 20 min, instead of your projects' usual 45 min",
    )
    const preview = calls.find((c) => c.url.includes('/bodies/nights'))!
    expect(preview.url).toContain('designation=332P')
    expect(preview.url).toContain('kind=comet')
    expect(preview.url).toContain('min_alt=30')
    const draft = calls.find((c) => c.url.includes('/planning/projects/draft'))!
    expect(draft.body).toMatchObject({ minimumTime: 35, minimumAltitude: 30 })
    app.unmount()
  })

  it("sends the tail framing from tonight's Horizons track with the new comet", async () => {
    const best = {
      at: '2026-10-13T03:00:00Z',
      ra: 321.33029,
      dec: 4.81158,
      alt: 62,
      dark: true,
      rate_arcsec_per_min: 5.23,
      motion_pa: 291.2,
      tail_pa: 84.063,
      velocity_pa: 141.662,
      mag: 14.7,
    }
    const { el, app } = await render({
      '/comets': () => json(tonight),
      '/commands': () => json([]),
      '/bodies/track': () =>
        json({
          track: {
            designation: '161P',
            kind: 'comet',
            angles: true,
            best,
            rows: [best],
            basis: '',
          },
          frame: { width_deg: 3.32, height_deg: 2.22, basis: 'Measured camera field.' },
          frame_reason: null,
        }),
      'POST /planning/projects/draft': () => json(drafted),
      '/planning': () => json(planning(all)),
      'POST /commands': () =>
        json({
          id: 'n',
          kind: 'project.create',
          status: 'queued',
          payload: {},
          created_at: '',
          updated_at: '',
        }),
    })
    ;(el.querySelector('tbody button') as HTMLButtonElement).click()
    await settle()
    const panel = el.querySelector('.addpanel')!
    expect(panel.textContent).toContain('Tail along the frame')
    const add = [...panel.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add 161P'),
    )!
    add.click()
    await settle()
    const sent = calls.find((c) => c.method === 'POST' && c.url.endsWith('/commands'))!
    expect(sent.body).toMatchObject({
      kind: 'project.create',
      payload: { targets: [{ designation: '161P', rotation_deg: 84.06, offset_frac: -0.25 }] },
    })
    app.unmount()
  })

  it('names a missing filter and does not draft', async () => {
    const { el, app } = await render({
      '/comets': () => json(tonight),
      '/commands': () => json([]),
      '/planning': () => json(planning(all.filter((t) => t.filter !== 'G'))),
    })
    ;(el.querySelector('tbody button') as HTMLButtonElement).click()
    await settle()
    const panel = el.querySelector('.addpanel')!
    expect(panel.textContent).toContain(
      "The observatory has no Green filter, so it can't image this in LRGB.",
    )
    expect(panel.textContent).not.toContain('Templates')
    expect(calls.some((c) => c.url.includes('/planning/projects/draft'))).toBe(false)
    const add = [...panel.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add 161P'),
    )!
    expect(add.disabled).toBe(true)
    app.unmount()
  })
})
