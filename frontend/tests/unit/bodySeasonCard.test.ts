import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import BodySeasonCard from '@/scheduler/components/BodySeasonCard.vue'

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

const bodyTarget = {
  target: {
    target_guid: 'g161',
    name: '161P/Hartley-IRAS',
    designation: '161P',
    kind: 'comet',
    active: true,
    rotation_deg: null,
    offset_frac: null,
  },
  framing_columns: true,
}

function nights(usableUntil: number, brightUntil: number, count = 366) {
  const out = []
  const start = Date.UTC(2026, 9, 12)
  for (let i = 0; i < count; i++) {
    const night = new Date(start + i * 86400000).toISOString().slice(0, 10)
    out.push({
      night,
      mag: 9.6 + i * 0.03,
      mag_limit: 15,
      bright: i < brightUntil,
      peak_altitude: i < 60 ? 64 - i * 0.5 : 20,
      dark_hours: i < usableUntil ? 3 : 0,
      usable: i < usableUntil,
    })
  }
  return out
}

function view(usableUntil: number, brightUntil: number) {
  const n = nights(usableUntil, brightUntil)
  const usable = n.filter((d) => d.usable)
  return {
    target_guid: 'g161',
    name: '161P/Hartley-IRAS',
    designation: '161P',
    kind: 'comet',
    computed_at: '2026-10-12T20:00:00Z',
    min_altitude: 30,
    minimum_minutes: 60,
    mag_limit: 15,
    bright_nights: n.filter((d) => d.bright).length,
    usable_nights: usable.length,
    first_usable: usable[0]?.night ?? null,
    last_usable: usable[usable.length - 1]?.night ?? null,
    typical_window_hours: 2.17 as number | null,
    season_nights_left: usable.length,
    season_end: usable[usable.length - 1]?.night ?? null,
    brightest_mag: 9.6,
    brightest_night: '2026-10-12',
    basis: '',
    nights: n,
  }
}

async function render(routes: Record<string, () => Response>) {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      const key = Object.keys(routes).find((k) => url.includes(k))
      return key ? routes[key]() : json({ error: 'not found' }, 404)
    }),
  )
  const el = document.createElement('div')
  const app = createApp({ render: () => h(BodySeasonCard, { targetGuid: 'g161' }) })
  app.mount(el)
  await settle()
  return { el, app, urls }
}

describe('BodySeasonCard', () => {
  it('shows nothing for a fixed target and asks for no nights', async () => {
    const { el, app, urls } = await render({
      '/bodies/target': () => json({ target: null, framing_columns: true }),
    })
    expect(el.querySelector('section')).toBeNull()
    expect(urls.some((u) => u.includes('/bodies/nights'))).toBe(false)
    app.unmount()
  })

  it('summarizes a closing comet season by month', async () => {
    const { el, app } = await render({
      '/bodies/target': () => json(bodyTarget),
      '/bodies/nights': () => json(view(42, 189)),
    })
    const text = el.textContent ?? ''
    expect(text).toContain('In season: 42 usable nights from tonight to Sun 22 Nov.')
    expect(text).not.toContain('more of the next')
    expect(text).toContain('until 14 nights in a row do not count')
    expect(text).toContain('Brightest V 9.6 on Mon 12 Oct (a model estimate, not a measurement)')
    expect(text).toContain('V 15 or brighter and stays above 30° for 60 min in full darkness')
    const rows = el.querySelectorAll('tbody tr')
    expect(rows.length).toBe(13)
    expect(rows[0]?.textContent).toContain('Oct 2026')
    expect(rows[0]?.textContent).toContain('20 of 20')
    expect(rows[1]?.textContent).toContain('22 of 30')
    expect(rows[12]?.textContent).toContain('Oct 2027')
    expect(rows[12]?.textContent).toContain('20°')
    expect(el.querySelector('[data-test="window-note"]')?.textContent?.trim()).toBe(
      'Typical window above 30° in full darkness over the next 90 nights: 2.2 h.',
    )
    app.unmount()
  })

  it('says when the minimum time is longer than the typical window, without changing it', async () => {
    const v = view(0, 189)
    v.minimum_minutes = 90
    v.typical_window_hours = 1.2
    const { el, app, urls } = await render({
      '/bodies/target': () => json(bodyTarget),
      '/bodies/nights': () => json(v),
    })
    expect(el.querySelector('[data-test="window-note"]')?.textContent).toContain(
      "Typical window above 30° in full darkness over the next 90 nights: 72 min. The project's minimum time of 90 min is longer, so most of those nights do not count.",
    )
    expect(el.textContent).toContain('never up long enough in full darkness on those nights')
    expect(urls.every((u) => !u.includes('/commands'))).toBe(true)
    app.unmount()
  })

  it('separates the season from usable nights after a break', async () => {
    const v = view(42, 189)
    v.usable_nights = 108
    v.last_usable = '2027-04-18'
    const { el, app } = await render({
      '/bodies/target': () => json(bodyTarget),
      '/bodies/nights': () => json(v),
    })
    expect(el.textContent).toContain(
      'In season: 42 usable nights from tonight to Sun 22 Nov. It is usable on 66 more of the next 366 nights after a break, up to Sun 18 Apr.',
    )
    app.unmount()
  })

  it('says when it is not usable tonight but later', async () => {
    const v = view(0, 189)
    v.usable_nights = 30
    v.first_usable = '2026-10-22'
    const { el, app } = await render({
      '/bodies/target': () => json(bodyTarget),
      '/bodies/nights': () => json(v),
    })
    expect(el.textContent).toContain(
      'Not usable tonight. Usable on 30 of the next 366 nights, the first on Thu 22 Oct.',
    )
    app.unmount()
  })

  it('says a comet that never gets bright enough has no season', async () => {
    const v = view(0, 0)
    v.brightest_mag = 17.7
    v.typical_window_hours = null
    const { el, app } = await render({
      '/bodies/target': () => json(bodyTarget),
      '/bodies/nights': () => json(v),
    })
    expect(el.textContent).toContain(
      'Fainter than V 15 on all of the next 366 nights, so it has no season.',
    )
    app.unmount()
  })

  it('gives the stacker reason when the nights are not built', async () => {
    const { el, app } = await render({
      '/bodies/target': () => json(bodyTarget),
      '/bodies/nights': () =>
        json({ error: 'the body season nights have not been built yet' }, 503),
    })
    expect(el.textContent).toContain(
      'The season nights are not worked out yet: the body season nights have not been built yet',
    )
    expect(el.querySelectorAll('tbody tr').length).toBe(0)
    app.unmount()
  })
})
