import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import MoonKeepCard from '@/scheduler/components/MoonKeepCard.vue'

afterEach(() => vi.unstubAllGlobals())

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function mount(res: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => res),
  )
  const el = document.createElement('div')
  const app = createApp({ render: () => h(MoonKeepCard) })
  app.mount(el)
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  return { el, app }
}

describe('MoonKeepCard', () => {
  it('says not measured yet when the stacker has no route', async () => {
    const { el, app } = await mount(json({ error: 'not found' }, 404))
    expect(el.textContent).toContain('Not measured yet')
    expect(el.querySelector('table')).toBeNull()
    app.unmount()
  })

  it('shows the table and the replay', async () => {
    const { el, app } = await mount(
      json({
        computed_at: '2026-10-12T19:30:00Z',
        mode: 'on',
        rules: {
          skip_below: 0.05,
          confidence: 0.95,
          min_subs: 30,
          min_nights: 3,
          good_night_quality: 0.3,
          floor_degrees: 20,
          prior_strength: 40,
          illum_edges: [0, 0.25, 0.5, 0.75, 0.9, 1],
          alt_edges: [0, 15, 35, 90],
          sep_edges: [20, 45, 75, 110, 180],
        },
        subs: 100,
        kept: 50,
        nights: 10,
        from: null,
        to: null,
        rows: [
          {
            filter: '',
            narrowband: false,
            moon_down: false,
            illum_bin: 4,
            alt_bin: 2,
            sep_bin: 1,
            illum_from: 0.9,
            illum_to: 1,
            alt_from: 35,
            alt_to: 90,
            sep_from: 45,
            sep_to: 75,
            subs: 60,
            kept: 0,
            nights: 6,
            rate: 0.01,
            low: 0,
            high: 0.04,
            worth: 0.01,
            usable: true,
            skip: true,
          },
        ],
        replay: {
          nights: 10,
          moon_up_nights: 6,
          subs: 100,
          kept: 50,
          moon_up_subs: 60,
          moon_up_hours: 5,
          moon_up_kept: 0,
          skipped_subs: 60,
          skipped_hours: 5,
          skipped_nights: 6,
          kept_lost: 0,
          idle_subs: 0,
          idle_hours: 0,
          idle_kept_lost: 0,
          worst: null,
          by_night: null,
        },
        publish: {
          mode: 'on',
          published_at: null,
          rows: 0,
          changed: 0,
          deleted: 0,
          skipped: 'no ts_moon_keep table',
        },
      }),
    )
    expect(el.querySelectorAll('tbody tr')).toHaveLength(16)
    expect(el.querySelector('td.mk-skip')?.textContent).toContain('1%')
    expect(el.textContent).toContain('No kept sub would have been lost')
    expect(el.textContent).toContain('the table that carries them to it is not set up')
    app.unmount()
  })
})
