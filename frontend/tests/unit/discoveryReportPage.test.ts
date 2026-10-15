import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import DiscoveryReportPage from '@/scheduler/pages/DiscoveryReportPage.vue'
import type { DiscoveryReport } from '@/scheduler/api/discoveries'
import { candidate, run } from './fixtures/discoveries'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

function report(over: Partial<DiscoveryReport> = {}): DiscoveryReport {
  return {
    candidate_id: 11,
    object: 'Andromeda',
    night: '2026-10-11',
    class: 'supernova_candidate',
    kind: 'change',
    ra: '00:42:13.912',
    dec: '+41:16:36.13',
    facts: [
      { key: 'mag', label: 'Brightness', value: 'L 18.64 ± 0.08', source: 'Gaia G zero point' },
      { key: 'host', label: 'Host', value: 'Not set', source: 'No galaxy catalog answer', missing: true },
    ],
    checks: [
      { key: 'mpc', state: 'ok', title: 'Not a known asteroid', detail: 'Nothing within 2′' },
      {
        key: 'tns',
        state: 'todo',
        title: 'Search TNS by position',
        detail: 'Needs your TNS key',
        link: 'https://www.wis-tns.org/search?ra=10.5',
      },
      { key: 'night2', state: 'wait', title: 'Second night', detail: 'Follow-up asked for' },
      { key: 'feed', state: 'bad', title: 'Alert feeds', detail: 'Could not reach ALeRCE' },
    ],
    tns: {
      applies: true,
      fields: [
        { key: 'ra', label: 'Right ascension', value: '00:42:13.912', source: 'Plate solution' },
        { key: 'reporter', label: 'Reporter and group', value: 'Not set', source: 'Set once in Settings', missing: true },
      ],
      earlier: [
        { night: '2026-10-11', filter: 'Luminance', subs: 28, result: '18.64 ± 0.08', hit: true },
        { night: '2026-07-20', filter: 'Green', subs: 6, result: 'fainter than 18.60' },
      ],
      earlier_note: '1 earlier night, no detection.',
      copy_text: 'RA 00:42:13.912',
      can_send: false,
      send_reason: 'Add your TNS key in Settings',
    },
    mpc: { applies: false, reason: 'The Minor Planet Center takes moving objects.', code: '' },
    vsx: {
      applies: false,
      position: '00:42:13.912 +41:16:36.13',
      type_guess: '',
      range: '',
      points: [],
    },
    spot: { state: 'done', measured_at: '2026-10-12T14:00:00Z' },
    ...over,
  }
}

interface Opts {
  rep?: DiscoveryReport
  measureState?: string
}

function stacker(o: Opts = {}): Handler {
  let current = o.rep ?? report()
  return (url, init) => {
    const u = new URL(url, 'http://x')
    const p = u.pathname
    const method = init?.method ?? 'GET'
    if (p === '/api/v1/discoveries/candidates/11/report' && method === 'GET') return json(current)
    if (p === '/api/v1/discoveries/candidates/11/report/measure' && method === 'POST')
      return json({ state: o.measureState ?? 'queued' }, 202)
    if (p === '/api/v1/discoveries/candidates/11/report/tns-name' && method === 'PUT') {
      const name = JSON.parse(String(init!.body)).name
      current = {
        ...current,
        tns: { ...current.tns, name, name_link: `https://www.wis-tns.org/object/${name.replace(/^AT ?/, '')}` },
      }
      return json(current)
    }
    if (p === '/api/v1/discoveries/candidates/11/report/tns-send' && method === 'POST')
      return json({ report_id: 98765, name: 'AT 2026abc' })
    if (p === '/api/v1/discoveries/candidates/11' && method === 'GET')
      return json({
        ...candidate({ id: 11, class: 'supernova_candidate', snr: 13.6, source_id: 5 }),
        cutouts: { night: '/c/n.png', ref: '/c/r.png', diff: '/c/d.png', fits: '/c/f.fits' },
        run: run(),
      })
    return json({ error: 'not found' }, 404)
  }
}

async function render(handler: Handler, path = '/discoveries/report/11') {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', fetch)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/discoveries', component: { render: () => null } },
      { path: '/discoveries/report/:id', component: DiscoveryReportPage },
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
  const done = () => {
    app.unmount()
    el.remove()
  }
  return { el, done, fetch }
}

const calls = (fetch: ReturnType<typeof vi.fn>, method: string, suffix: string) =>
  fetch.mock.calls.filter(
    (c) => ((c[1] as RequestInit | undefined)?.method ?? 'GET') === method && String(c[0]).includes(suffix),
  )

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as
    | HTMLButtonElement
    | undefined

describe('DiscoveryReportPage', () => {
  it('colors a possible nova pill as the Discoveries page does', async () => {
    const { el, done } = await render(stacker({ rep: report({ class: 'nova_candidate' }) }))
    const pill = el.querySelector('.pill')!
    expect(pill.textContent).toContain('Possible nova')
    expect([...pill.classList]).toEqual(['pill', 'new', 'nova'])
    done()
  })

  it('shows the header, cutouts, facts, checks and TNS fields from the report', async () => {
    const { el, done } = await render(stacker())
    expect(el.querySelector('h1')!.textContent).toContain('Report a discovery')
    expect(el.textContent).toContain('Andromeda · night of Oct 11 2026 · candidate at 00:42:13.912 +41:16:36.13')
    const back = el.querySelector('a[href^="/discoveries?"]') as HTMLAnchorElement
    expect(back.getAttribute('href')).toBe('/discoveries?source=5')
    expect(el.querySelector('.pill')!.textContent).toContain('Possible supernova')
    expect(el.querySelector('.snr')!.textContent).toBe('13.6σ')
    expect([...el.querySelectorAll('.big figcaption')].map((f) => f.textContent)).toEqual([
      'Night',
      'Reference',
      'Difference',
    ])
    expect(el.querySelector('.big img')!.getAttribute('src')).toBe('/c/n.png')
    expect(el.querySelector('.facts')!.textContent).toContain('L 18.64 ± 0.08')
    const checks = el.querySelectorAll('.checks li')
    expect(checks).toHaveLength(4)
    expect([...checks].map((c) => c.querySelector('.mark')!.textContent)).toEqual(['✓', '!', '…', '✕'])
    expect(checks[3]!.classList.contains('st-bad')).toBe(true)
    const link = checks[1]!.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://www.wis-tns.org/search?ra=10.5')
    expect(link.getAttribute('target')).toBe('_blank')
    const fields = el.querySelectorAll('#rep-panel-tns .f')
    expect(fields[0]!.textContent).toContain('00:42:13.912')
    expect(fields[0]!.textContent).toContain('Plate solution')
    const rows = el.querySelectorAll('#rep-panel-tns tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.classList.contains('hit')).toBe(true)
    expect(rows[1]!.textContent).toContain('Jul 20 2026')
    expect(el.textContent).toContain('1 earlier night, no detection.')
    const bundle = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('Save the cutouts'))!
    expect(bundle.getAttribute('href')).toBe('/api/v1/discoveries/candidates/11/report/bundle.zip')
    expect(bundle.hasAttribute('download')).toBe(true)
    done()
  })

  it('shows missing values in the warning style with the source as the reason', async () => {
    const { el, done } = await render(stacker())
    const fact = el.querySelector('.facts .missing')!
    expect(fact.textContent).toBe('Not set')
    expect(fact.parentElement!.textContent).toContain('No galaxy catalog answer')
    const field = [...el.querySelectorAll('#rep-panel-tns .f')].find((f) => f.textContent?.includes('Reporter'))!
    expect(field.querySelector('.v')!.classList.contains('missing')).toBe(true)
    expect(field.textContent).toContain('Set once in Settings')
    const ra = el.querySelector('#rep-panel-tns .f .v')!
    expect(ra.classList.contains('missing')).toBe(false)
    done()
  })

  it('keeps Send off with the reason when the stacker cannot send', async () => {
    const { el, done, fetch } = await render(stacker())
    const send = button(el, 'Send with my TNS key')!
    expect(send.disabled).toBe(true)
    expect(send.title).toBe('Add your TNS key in Settings')
    expect(el.textContent).toContain('Sending is off: Add your TNS key in Settings')
    send.click()
    await settle()
    expect(button(el, 'Send to TNS now')).toBeUndefined()
    expect(calls(fetch, 'POST', '/tns-send')).toHaveLength(0)
    done()
  })

  it('asks before sending and posts tns-send only on the second click, once', async () => {
    const rep = report()
    rep.tns = { ...rep.tns, can_send: true, send_reason: undefined }
    const { el, done, fetch } = await render(stacker({ rep }))
    const send = button(el, 'Send with my TNS key')!
    expect(send.disabled).toBe(false)
    send.click()
    await settle()
    expect(calls(fetch, 'POST', '/tns-send')).toHaveLength(0)
    const now = button(el, 'Send to TNS now')!
    expect(now).toBeDefined()
    now.click()
    now.click()
    await settle()
    expect(calls(fetch, 'POST', '/tns-send')).toHaveLength(1)
    expect(el.textContent).toContain('TNS took the report: report 98765, name AT 2026abc')
    expect(button(el, 'Send to TNS now')).toBeUndefined()
    done()
  })

  it('cancelling the confirm step sends nothing', async () => {
    const rep = report()
    rep.tns = { ...rep.tns, can_send: true }
    const { el, done, fetch } = await render(stacker({ rep }))
    button(el, 'Send with my TNS key')!.click()
    await settle()
    button(el, 'Cancel')!.click()
    await settle()
    expect(button(el, 'Send to TNS now')).toBeUndefined()
    expect(calls(fetch, 'POST', '/tns-send')).toHaveLength(0)
    done()
  })

  it('starts measuring earlier nights on load when the spot was never measured', async () => {
    const { el, done, fetch } = await render(stacker({ rep: report({ spot: { state: 'none' } }) }))
    const posts = calls(fetch, 'POST', '/report/measure')
    expect(posts).toHaveLength(1)
    expect(String(posts[0]![0])).toBe('/api/v1/discoveries/candidates/11/report/measure')
    expect(el.textContent).toContain('Measuring earlier nights at this spot…')
    expect(button(el, 'Measure again')).toBeUndefined()
    done()
  })

  it('does not measure on load when the spot is already measured, and can measure again', async () => {
    const { el, done, fetch } = await render(stacker())
    expect(calls(fetch, 'POST', '/report/measure')).toHaveLength(0)
    button(el, 'Measure again')!.click()
    await settle()
    const posts = calls(fetch, 'POST', '/report/measure')
    expect(posts).toHaveLength(1)
    expect(String(posts[0]![0])).toBe('/api/v1/discoveries/candidates/11/report/measure?again=1')
    done()
  })

  it('refreshes the report every 10 s while measuring and stops on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { done, fetch } = await render(stacker({ rep: report({ spot: { state: 'measuring' } }) }))
    const gets = () => calls(fetch, 'GET', '/candidates/11/report').length
    expect(gets()).toBe(1)
    vi.advanceTimersByTime(10000)
    await settle()
    expect(gets()).toBe(2)
    done()
    vi.advanceTimersByTime(30000)
    await settle()
    expect(gets()).toBe(2)
  })

  it('saves the TNS name on Enter and links it', async () => {
    const { el, done, fetch } = await render(stacker())
    const input = el.querySelector('#rep-tns-name') as HTMLInputElement
    input.value = 'AT 2026abc'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await settle()
    input.dispatchEvent(new Event('blur'))
    await settle()
    const puts = calls(fetch, 'PUT', '/report/tns-name')
    expect(puts).toHaveLength(1)
    expect(JSON.parse(String((puts[0]![1] as RequestInit).body))).toEqual({ name: 'AT 2026abc' })
    const a = [...el.querySelectorAll('a')].find((x) => x.textContent === 'AT 2026abc')!
    expect(a.getAttribute('href')).toBe('https://www.wis-tns.org/object/2026abc')
    done()
  })

  it('copies the TNS text and says Copied', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { el, done } = await render(stacker())
    button(el, 'Copy for the TNS form')!.click()
    await settle()
    expect(writeText).toHaveBeenCalledWith('RA 00:42:13.912')
    expect(button(el, 'Copied')).toBeDefined()
    done()
  })

  it('opens on the tab that applies and switches with the arrow keys', async () => {
    const { el, done } = await render(stacker())
    const tabs = [...el.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'TNS (supernova or nova)',
      'Minor Planet Center',
      'Variable star (VSX)',
    ])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.tabIndex).toBe(-1)
    const panel = (k: string) => el.querySelector(`#rep-panel-${k}`) as HTMLElement
    expect(panel('tns').hidden).toBe(false)
    expect(panel('mpc').hidden).toBe(true)
    tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await settle()
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    expect(panel('mpc').hidden).toBe(false)
    expect(panel('mpc').textContent).toContain('The Minor Planet Center takes moving objects.')
    expect(document.activeElement).toBe(tabs[1])
    tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await settle()
    expect(panel('vsx').hidden).toBe(false)
    expect(panel('vsx').textContent).toContain('VSX takes new variable stars')
    tabs[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await settle()
    expect(panel('tns').hidden).toBe(false)
    tabs[2]!.click()
    await settle()
    expect(panel('vsx').hidden).toBe(false)
    done()
  })

  it('opens a mover on the Minor Planet Center tab with the PSV and XML', async () => {
    const rep = report({
      kind: 'mover',
      class: 'unknown_mover',
      tns: { ...report().tns, applies: false },
      mpc: { applies: true, code: '', reason: 'Set your observatory code in Settings', psv: 'permID|mode', xml: '<ades/>' },
    })
    const { el, done } = await render(stacker({ rep }))
    const mpc = el.querySelector('#rep-panel-mpc') as HTMLElement
    expect(mpc.hidden).toBe(false)
    expect(mpc.querySelector('.missing')!.textContent).toBe('Not set')
    expect(mpc.textContent).toContain('Set your observatory code in Settings')
    expect([...mpc.querySelectorAll('pre')].map((p) => p.textContent)).toEqual(['permID|mode', '<ades/>'])
    expect(el.querySelector('#rep-panel-tns')!.textContent).toContain('TNS takes supernovae and novae')
    done()
  })

  it('opens a new variable on the VSX tab with its measured points only', async () => {
    const rep = report({
      class: 'new_variable_candidate',
      tns: { ...report().tns, applies: false },
      vsx: {
        applies: true,
        position: '00:42:13.912 +41:16:36.13',
        type_guess: 'EW',
        range: '15.1 to 15.6 (L)',
        points: [{ time: '2026-10-12T03:00:00Z', filter: 'L', mag: 15.12, mag_err: 0.03 }],
      },
    })
    const { el, done } = await render(stacker({ rep }))
    const vsx = el.querySelector('#rep-panel-vsx') as HTMLElement
    expect(vsx.hidden).toBe(false)
    expect(vsx.textContent).toContain('15.1 to 15.6 (L)')
    const rows = vsx.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.textContent).toContain('15.12')
    expect(rows[0]!.textContent).toContain('± 0.03')
    done()
  })

  it('says when there is no such candidate', async () => {
    const { el, done } = await render(stacker(), '/discoveries/report/999')
    expect(el.textContent).toContain('No such candidate')
    done()
  })

  it('shows the stacker error with a retry', async () => {
    const { el, done } = await render(() => json({ error: 'database is locked' }, 500))
    expect(el.textContent).toContain('The stacker did not answer: database is locked')
    expect(button(el, 'Try again')).toBeDefined()
    done()
  })
})
