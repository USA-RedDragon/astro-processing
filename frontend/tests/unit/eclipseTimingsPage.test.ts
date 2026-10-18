import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import EclipseTimingsPage from '@/scheduler/pages/EclipseTimingsPage.vue'
import LatePlot from '@/scheduler/components/LatePlot.vue'
import type { TimingRecord } from '@/scheduler/api/binaries'
import { emptyRecord, list, record, star, submitted, timing } from './fixtures/binaries'

afterEach(() => vi.unstubAllGlobals())

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

function stacker(recs: Record<number, TimingRecord>) {
  return (url: string) => {
    const p = new URL(url, 'http://x').pathname
    if (p === '/api/v1/discoveries/binaries') return json(list([submitted(), star()]))
    const m = /^\/api\/v1\/discoveries\/binaries\/(\d+)\/timings$/.exec(p)
    if (m && recs[Number(m[1])]) return json(recs[Number(m[1])])
    if (m) return json({ error: 'stacker restarting' }, 502)
    return json({ error: 'not found' }, 404)
  }
}

async function render(handler: (url: string) => Response, path = '/discoveries/mine/101/timings') {
  const fetch = vi.fn(async (url: string) => handler(url))
  vi.stubGlobal('fetch', fetch)
  const blank = { render: () => null }
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/discoveries/mine', name: 'discoveries-mine', component: blank },
      { path: '/discoveries/eclipses', name: 'discovery-eclipses', component: blank },
      {
        path: '/discoveries/mine/:id/timings',
        name: 'discovery-timings',
        component: EclipseTimingsPage,
      },
    ],
  })
  router.push(path)
  await router.isReady()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(RouterView) })
  app.use(router)
  app.mount(el)
  await settle()
  await settle()
  return { el, app, fetch, router }
}

const button = (el: Element, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as
    HTMLButtonElement | undefined

describe('EclipseTimingsPage', () => {
  it('shows the record from the API: summary, plot, timings, covered nights and trends', async () => {
    const { el, app } = await render(stacker({ 101: record() }))
    const text = el.textContent!
    expect(el.querySelector('h1')!.textContent).toBe('Gaia DR3 1000000000000000101')
    expect(text).toContain('Made-up summary: 1 good timing so far.')
    expect(text).toContain('1 more eclipse night covered but not timed.')
    expect(text).toContain('covered but not timed. Times are US Central (CDT or CST).')
    expect(el.querySelectorAll('svg .pt')).toHaveLength(1)
    expect(el.querySelector('svg .pt path.mk')).not.toBeNull()
    expect(text).toContain('Second eclipse, the only kind timed so far')
    const row = el.querySelector('.timings tbody tr')!
    expect(row.textContent).toContain('Mon Oct 12, 2026, 4:33 AM CDT')
    expect(row.textContent).toContain('0.6 late')
    expect(el.querySelector('.timings .rep')!.textContent).toContain('2461325.90389')
    expect(text).toContain('Not timed: made-up reason.')
    const trends = [...el.querySelectorAll('.trend')]
    expect(trends.map((t) => t.querySelector('.nm')!.textContent)).toEqual([
      'Predicted times need updating',
      'Period changing',
      'Orbit turning',
      'Possible third star',
    ])
    expect(trends[0]!.querySelector('.badge')!.textContent).toBe('Not enough timings yet')
    expect(trends[0]!.textContent).toContain('Made-up need one.')
    expect(trends[0]!.textContent).not.toContain('Not enough timings yet. Made-up')
    expect(trends[2]!.querySelector('.badge')!.textContent).toBe('Flag')
    expect(trends[2]!.textContent).toContain('Made-up flag basis.')
    expect(text).toContain('The app has not planned this season yet.')
    expect(text).toContain('How a timing is made')
    expect((el.querySelector('#tm-star') as HTMLSelectElement).value).toBe('101')
    app.unmount()
  })

  it('shows empty states instead of an empty plot or table', async () => {
    const { el, app } = await render(stacker({ 101: emptyRecord() }))
    expect(el.querySelector('svg')).toBeNull()
    expect(el.textContent).toContain('The plot appears once one eclipse of this star is timed.')
    expect(el.querySelector('.timings')!.textContent).toContain('No timings yet.')
    expect(el.textContent).toContain('None so far.')
    expect(button(el, 'Table')).toBeUndefined()
    app.unmount()
  })

  it('shows the season with kinds, the stop reason and the app requests', async () => {
    const r = record({
      updated: {
        period_text: '7.25012',
        period: 7.25012,
        period_err: 0.00002,
        epoch_bjd_tdb: 2461000.12345,
      },
      season: {
        start: '2026-04-01T00:00:00Z',
        end: '2027-04-01T00:00:00Z',
        opposition: '2026-10-01T00:00:00Z',
        label: 'This season, best in October 2026',
        kinds: [
          { kind: 'primary', label: 'Deeper eclipse', want: 2, timed: 0, asked: 1, needed: 1 },
          { kind: 'secondary', label: 'Second eclipse', want: 1, timed: 1, asked: 0, needed: 0 },
        ],
        stopped: 'Made-up: stopped after 2 failed requests.',
        requests: [{ id: 7, state: 'waiting', note: 'Made-up request note', auto: true }],
      },
    })
    const { el, app } = await render(stacker({ 101: r }))
    const season = el.querySelector('.season')!
    expect(season.querySelector('h2')!.textContent).toBe('This season, best in October 2026')
    expect(season.textContent).toContain('0 of 2 timed, 1 asked for, 1 still needed')
    expect(season.textContent).toContain('1 of 1 timed')
    expect(season.textContent).toContain('Made-up: stopped after 2 failed requests.')
    expect(season.textContent).toContain('Requested')
    expect(season.textContent).toContain('Asked by the app')
    expect(season.textContent).toContain('Made-up request note')
    expect(el.querySelector('.updated')!.textContent).toContain('7.25012 days')
    app.unmount()
  })

  it('moves to another star from the picker and says when the stacker is down', async () => {
    const { el, app, router } = await render(stacker({ 101: record() }))
    const sel = el.querySelector('#tm-star') as HTMLSelectElement
    sel.value = '202'
    sel.dispatchEvent(new Event('change'))
    await settle()
    await settle()
    expect(router.currentRoute.value.params.id).toBe('202')
    expect(el.textContent).toContain('The stacker did not answer: stacker restarting')
    app.unmount()
  })
})

describe('LatePlot', () => {
  function mount(r: TimingRecord) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
      render: () => h('main', { class: 'bin' }, [h(LatePlot, { record: r })]),
    })
    app.mount(el)
    return { el, app }
  }

  const both = () =>
    record({
      timings: [
        timing({ id: 1, kind: 'primary', kind_label: 'Deeper eclipse', night: '2025-09-01' }),
        timing({ id: 2, night: '2026-10-11', late_minutes: -2, used: false, state: 'doubtful' }),
      ],
      points: [
        { year: 2025.67, kind: 'primary', minutes: 0.6, err_minutes: 5.5, used: true },
        { year: 2026.78, kind: 'secondary', minutes: -2, err_minutes: 3, used: false },
      ],
      lines: [
        {
          kind: 'primary',
          points: [
            [2025.6, 0],
            [2026.8, 1],
          ],
        },
      ],
    })

  it('marks the two kinds by colour and shape, with a legend only for both', async () => {
    const { el, app } = mount(both())
    await nextTick()
    const pts = el.querySelectorAll('svg .pt')
    expect(pts[0]!.querySelector('circle.mk')).not.toBeNull()
    expect(pts[1]!.querySelector('path.mk')).not.toBeNull()
    expect(pts[1]!.classList.contains('out')).toBe(true)
    expect([...el.querySelectorAll('.keyline .key')].map((k) => k.textContent!.trim())).toEqual([
      'Deeper eclipse',
      'Second eclipse',
      'The fit to your timings',
    ])
    expect(el.querySelectorAll('svg path.fit')).toHaveLength(1)
    expect(el.querySelector('svg line.zero')).not.toBeNull()
    expect(el.textContent).toContain('Faint points are left out of the trend checks.')
    app.unmount()
  })

  it('shows a tooltip on focus and hides it on blur', async () => {
    const { el, app } = mount(both())
    await nextTick()
    const pt = el.querySelectorAll('svg .pt')[1] as SVGGElement
    pt.dispatchEvent(new FocusEvent('focus'))
    await nextTick()
    const tip = el.querySelector('.tip') as HTMLElement
    expect(tip.style.display).not.toBe('none')
    expect(tip.textContent).toContain('Second eclipse')
    expect(tip.textContent).toContain('2.0 minutes early, give or take 3.0')
    expect(tip.textContent).toContain('Left out of the trend checks')
    expect(pt.getAttribute('aria-label')).toContain('Night of 2026-10-11')
    pt.dispatchEvent(new FocusEvent('blur'))
    await nextTick()
    expect(tip.style.display).toBe('none')
    app.unmount()
  })

  it('switches to the table of the same points', async () => {
    const { el, app } = mount(both())
    await nextTick()
    ;[...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Table')!.click()
    await nextTick()
    const rows = [...el.querySelectorAll('tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((c) => c.textContent!.trim()),
    )
    expect(rows).toEqual([
      ['2025-09-01', 'Deeper eclipse', '0.6 late', '5.5'],
      ['2026-10-11', 'Second eclipse', '2.0 early', '3.0'],
    ])
    expect((el.querySelector('.plot-view') as HTMLElement).style.display).toBe('none')
    app.unmount()
  })
})
