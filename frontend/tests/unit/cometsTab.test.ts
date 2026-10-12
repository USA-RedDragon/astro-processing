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

async function render(routes: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const key = Object.keys(routes).find((k) => url.includes(k))
      return key ? routes[key]() : json({ error: 'not found' }, 404)
    }),
  )
  const el = document.createElement('div')
  const app = createApp(CometsTab)
  app.mount(el)
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
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
})
