import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import MyDiscoveriesPage from '@/scheduler/pages/MyDiscoveriesPage.vue'
import type { Binary, BinaryList, DipperView, OtherStar } from '@/scheduler/api/binaries'
import { dip, dipper, flagged, list, other, star, starTypes, submitted } from './fixtures/binaries'

afterEach(() => vi.unstubAllGlobals())

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

async function render(handler: Handler, path = '/discoveries/mine') {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', fetch)
  const blank = { render: () => null }
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/discoveries/mine', name: 'discoveries-mine', component: MyDiscoveriesPage },
      { path: '/discoveries/mine/:id/vsx', name: 'discovery-vsx', component: blank },
      { path: '/discoveries/eclipses', name: 'discovery-eclipses', component: blank },
      { path: '/discoveries/mine/:id/timings', name: 'discovery-timings', component: blank },
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

function stacker(body: BinaryList = list()): Handler {
  const stars = new Map(body.stars.map((s) => [s.source_id, s]))
  const others = new Map((body.others ?? []).map((s) => [s.source_id, s]))
  return (url, init) => {
    const p = new URL(url, 'http://x').pathname
    const one = /^\/api\/v1\/discoveries\/binaries\/(\d+)$/.exec(p)
    if (one && init?.method === 'PUT') {
      const cur = stars.get(Number(one[1]))!
      const b = JSON.parse(String(init.body))
      const next: Binary = {
        ...cur,
        notes: b.notes ?? cur.notes,
        vsx: {
          submitted: b.vsx_submitted ?? cur.vsx.submitted,
          ref: b.vsx_ref ?? cur.vsx.ref,
          submitted_at: cur.vsx.submitted_at,
        },
      }
      stars.set(next.source_id, next)
      return json(next)
    }
    const oneOther = /^\/api\/v1\/discoveries\/others\/(\d+)$/.exec(p)
    if (oneOther && init?.method === 'PUT') {
      const cur = others.get(Number(oneOther[1]))!
      const b = JSON.parse(String(init.body))
      const next: OtherStar = {
        ...cur,
        notes: b.notes ?? cur.notes,
        star_type:
          b.star_type === undefined
            ? cur.star_type
            : (starTypes.find((t) => t.key === b.star_type) ?? null),
      }
      others.set(next.source_id, next)
      return json(next)
    }
    if (p === '/api/v1/discoveries/binaries')
      return json({ ...body, stars: [...stars.values()], others: [...others.values()] })
    return json({ error: 'not found' }, 404)
  }
}

const button = (el: Element, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as
    HTMLButtonElement | undefined

const chips = (el: Element) =>
  [...el.querySelectorAll('.chip')].map((c) => c.textContent?.replace(/\s+/g, ' ').trim())

const calls = (fetch: ReturnType<typeof vi.fn>, path: string) =>
  fetch.mock.calls.filter((c) => new URL(String(c[0]), 'http://x').pathname === path)

const puts = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')

describe('MyDiscoveriesPage', () => {
  it('shows every star with its VSX state, counts and card details', async () => {
    const { el, app } = await render(stacker())
    expect(chips(el)).toEqual([
      'All 3',
      'Submitted to VSX 1',
      'Not submitted yet 2',
      'Flagged by the checks 1',
      'Has timings 0',
      'No timings yet 3',
      'Flagged by a trend check 0',
    ])
    expect(el.querySelector('.sec')!.textContent).toBe(
      'All · 3 stars · submitted first, then the rest',
    )
    const cards = el.querySelectorAll('.find')
    expect(cards).toHaveLength(3)
    const sub = cards[0]!
    expect(sub.classList.contains('s-sub')).toBe(true)
    expect(sub.querySelector('.pill')!.textContent).toBe('Submitted to VSX')
    expect(sub.textContent).toContain('find #202')
    expect(sub.textContent).toContain('Gaia DR3 1000000000000000202')
    expect(sub.textContent).toContain('Test Field B · G 15.10')
    expect([...sub.querySelectorAll('.notes li')].map((l) => l.textContent)).toEqual([
      'First made-up note.',
      'Second made-up note.',
    ])
    expect(sub.querySelector('a[href="https://vsx.example/202"]')).not.toBeNull()
    const vsx = sub.querySelector('a[href="/discoveries/mine/202/vsx"]')!
    expect(vsx.textContent).toBe('Prepare VSX submission')
    expect(sub.querySelector('a[href="/discoveries/eclipses?star=202"]')!.textContent).toBe(
      'Eclipses',
    )
    expect([...sub.querySelectorAll('dt, dd')].map((d) => d.textContent?.trim())).toEqual([
      'Type',
      'EA, oval orbit, eclipsing binary',
      'Repeats',
      'every 7.25000 days',
      'Dips',
      '0.40 and 0.20 mag (r)',
    ])

    const plain = cards[1]!
    expect(plain.classList.contains('s-not')).toBe(true)
    expect(plain.querySelector('.pill')!.textContent).toBe('Not submitted yet')
    expect(plain.textContent).toContain('No notes.')
    expect(plain.querySelector('.ref')).toBeNull()
    expect(plain.querySelector('a[href="/discoveries/mine/101/vsx"]')).not.toBeNull()

    const flag = cards[2]!
    expect(flag.querySelector('.badge.violet')!.textContent).toBe('Period could be twice this')
    expect(flag.textContent).toContain('Why flagged: Made-up reason one.')
    expect(flag.textContent).toContain('or 6.20000 (twice that)')
    expect(flag.querySelector('dd')!.textContent).toBe('EA, eclipsing binary')
    expect([...flag.querySelectorAll('.notes .badge')].map((b) => b.textContent)).toEqual([
      'Eclipsing binary: medium confidence',
      'Period: not settled',
    ])
    expect(flag.textContent).toContain('Survey facts still being worked out.')
    expect(plain.textContent).not.toContain('Survey facts')
    app.unmount()
  })

  it('shows the eclipse timings line from the API with trend flags and a Timings link', async () => {
    const timed = star({
      source_id: 404,
      timing: {
        count: 7,
        text: 'Made-up: 7 good timings over 400 days.',
        flags: ['Predicted times need updating'],
      },
    })
    const { el, app } = await render(stacker(list([star(), timed])))
    const [plain, flagged] = [...el.querySelectorAll('.find .tline')]
    expect(plain!.textContent).toContain('Made-up: no timings yet.')
    expect(plain!.querySelector('.badge')).toBeNull()
    expect(flagged!.textContent).toContain('Made-up: 7 good timings over 400 days.')
    expect(flagged!.querySelector('.badge.warn')!.textContent).toBe('Predicted times need updating')
    expect(flagged!.querySelector('a[href="/discoveries/mine/404/timings"]')!.textContent).toBe(
      'Timings',
    )
    button(el, 'Flagged by a trend check')!.click()
    await settle()
    expect(el.querySelectorAll('.find')).toHaveLength(1)
    app.unmount()
  })

  it('filters by chip and keeps the choice in the link', async () => {
    const { el, app, router } = await render(stacker())
    button(el, 'Flagged by the checks')!.click()
    await settle()
    expect(router.currentRoute.value.query.show).toBe('flagged')
    expect(el.querySelectorAll('.find')).toHaveLength(1)
    expect(el.querySelector('.sec')!.textContent).toBe(
      'Flagged by the checks · 1 star · submitted first, then the rest',
    )
    app.unmount()
    const again = await render(stacker(), '/discoveries/mine?show=sub')
    expect(again.el.querySelectorAll('.find')).toHaveLength(1)
    expect(again.el.querySelector('.chip[aria-pressed="true"]')!.textContent).toContain(
      'Submitted to VSX',
    )
    again.app.unmount()
  })

  it('marks a star as submitted and saves its VSX link', async () => {
    const { el, app, fetch } = await render(stacker(list([star()])))
    const select = el.querySelector('#vsx-101') as HTMLSelectElement
    select.value = 'sub'
    select.dispatchEvent(new Event('change'))
    await settle()
    expect(JSON.parse(String((puts(fetch)[0]![1] as RequestInit).body))).toEqual({
      vsx_submitted: true,
    })
    const card = el.querySelector('.find')!
    expect(card.classList.contains('s-sub')).toBe(true)
    expect(card.querySelector('.pill')!.textContent).toBe('Submitted to VSX')
    const ref = card.querySelector('.ref') as HTMLInputElement
    ref.value = ' https://vsx.example/101 '
    ref.dispatchEvent(new Event('input'))
    ref.dispatchEvent(new Event('change'))
    await settle()
    expect(JSON.parse(String((puts(fetch)[1]![1] as RequestInit).body))).toEqual({
      vsx_ref: 'https://vsx.example/101',
    })
    expect(card.querySelector('a[href="https://vsx.example/101"]')).not.toBeNull()
    app.unmount()
  })

  it('edits the notes on the card', async () => {
    const { el, app, fetch } = await render(stacker(list([star()])))
    button(el, 'Edit notes')!.click()
    await settle()
    const box = el.querySelector('#notes-101') as HTMLTextAreaElement
    box.value = 'Made-up line one.\nMade-up line two.'
    box.dispatchEvent(new Event('input'))
    button(el, 'Save notes')!.click()
    await settle()
    expect(JSON.parse(String((puts(fetch)[0]![1] as RequestInit).body))).toEqual({
      notes: 'Made-up line one.\nMade-up line two.',
    })
    expect(el.querySelector('#notes-101')).toBeNull()
    expect([...el.querySelectorAll('.notes li')].map((l) => l.textContent)).toEqual([
      'Made-up line one.',
      'Made-up line two.',
    ])
    app.unmount()
  })

  it('keeps the notes open with the error when they do not save', async () => {
    const base = stacker(list([star()]))
    const { el, app } = await render((url, init) =>
      init?.method === 'PUT' ? json({ error: 'made-up failure' }, 500) : base(url, init),
    )
    button(el, 'Edit notes')!.click()
    await settle()
    button(el, 'Save notes')!.click()
    await settle()
    expect(el.querySelector('#notes-101')).not.toBeNull()
    expect(el.textContent).toContain('That did not save: made-up failure')
    app.unmount()
  })

  it('says when survey facts are being worked out and when the stacker is down', async () => {
    const body = {
      ...list([submitted(), flagged()]),
      facts: { state: 'running' as const, done: 1, total: 2 },
    }
    const { el, app } = await render(stacker(body))
    expect(el.textContent).toContain('Working out survey facts: 1 of 2 stars done.')
    app.unmount()
    const down = await render(() => json({ error: 'stacker restarting' }, 502))
    expect(down.el.textContent).toContain('The stacker did not answer: stacker restarting')
    down.app.unmount()
  })

  it('says when there are no confirmed stars yet', async () => {
    const { el, app } = await render(stacker(list([])))
    expect(el.textContent).toContain('No confirmed variable stars yet.')
    app.unmount()
  })

  it('shows the share picture of a star or its note in its place', async () => {
    const pic = star({
      share: {
        state: 'ready',
        url: '/api/v1/discoveries/sources/101/share.jpg?v=1',
        version: 1,
        note: '',
      },
    })
    const { el, app } = await render(stacker(list([pic, submitted()])))
    const cards = el.querySelectorAll('.find')
    expect(cards[0]!.querySelector('.thumb img')!.getAttribute('src')).toBe(
      '/api/v1/discoveries/sources/101/share.jpg?v=1',
    )
    expect(cards[0]!.querySelector('a[download]')!.getAttribute('href')).toBe(
      '/api/v1/discoveries/sources/101/share.jpg?v=1&download=1',
    )
    expect(button(cards[0]!, 'Share')).toBeDefined()
    expect(cards[1]!.querySelector('.thumb')).toBeNull()
    expect(cards[1]!.textContent).toContain('Made-up note: no colour picture yet.')
    app.unmount()
  })

  it('shows confirmed stars that are not eclipsing binaries as their own kind', async () => {
    const body: BinaryList = {
      ...list([star()]),
      star_types: starTypes,
      others: [
        other(),
        other({
          source_id: 202,
          vet_kind: 'fades',
          vet_line: 'Fades now and then',
          period: 0,
          period_text: '',
          confidence: 'low',
          star_type: starTypes[1]!,
          notes: 'Made-up note: dips recur every 9.36 days.',
        }),
        other({
          source_id: 203,
          vet_kind: '',
          vet_line: '',
          period: 0,
          period_text: '',
          confidence: '',
          star_type: null,
          waiting: 'Made-up: the vet looks again soon.',
        }),
      ],
    }
    const { el, app } = await render(stacker(body))
    const cards = [...el.querySelectorAll('article.other')]
    expect(cards.map((c) => c.querySelector('.kind')?.textContent?.trim())).toEqual([
      'Spotted star: rotates every 4.32 days',
      'Dipper: fades now and then',
      'Variable star',
    ])
    const text = (c: Element) => c.textContent?.replace(/\s+/g, ' ') ?? ''
    expect(text(cards[0]!)).toContain('ROT')
    expect(text(cards[0]!)).toContain('every 4.318 days')
    expect(text(cards[0]!)).toContain('medium confidence')
    expect(text(cards[0]!)).toContain('Test Field B · G 16.20')
    expect(text(cards[1]!)).toContain('Fades now and then, low confidence')
    expect(text(cards[1]!)).toContain('dips recur every 9.36 days')
    expect(text(cards[2]!)).toContain('Made-up: the vet looks again soon.')
    for (const c of cards) {
      expect(text(c)).not.toMatch(/Eclipses|Timings|Prepare VSX submission|eclips/i)
    }
    expect(el.querySelectorAll('article.find').length).toBe(4)
    app.unmount()
  })

  it('names the kind of a star that is not an eclipsing binary', async () => {
    const body: BinaryList = {
      ...list([star()]),
      star_types: starTypes,
      others: [other({ star_type: null })],
    }
    const { el, app, fetch } = await render(stacker(body))
    const sel = el.querySelector('#type-201') as HTMLSelectElement
    expect(el.querySelector('article.other .kind')?.textContent?.trim()).toBe(
      'Repeats every 4.32 days',
    )
    sel.value = 'rot'
    sel.dispatchEvent(new Event('change'))
    await settle()
    const put = puts(fetch).at(-1)!
    expect(String(put[0])).toContain('/api/v1/discoveries/others/201')
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ star_type: 'rot' })
    expect(el.querySelector('article.other .kind')?.textContent?.trim()).toBe(
      'Spotted star: rotates every 4.32 days',
    )
    app.unmount()
  })

  describe('dip windows', () => {
    const dipperStar = () =>
      other({
        source_id: 15523,
        vet_kind: 'fades',
        vet_line: 'Fades now and then',
        period: 0,
        period_text: '',
        star_type: starTypes[1]!,
        dipper: {
          windows_text: 'every 9.356 days, 20 hours wide (made-up)',
          dips_text: '0.15 to 0.6 mag, made-up',
          every_window: false,
        },
      })

    const windows = () => [
      dip({
        mid: '2026-10-11T12:00:00Z',
        mid_label: 'Oct 11, 7:00 AM',
        dark_text: '11:12 PM to 5:55 AM',
        over: true,
        request: { id: 31, state: 'done', note: '', auto: true },
        imaging: { subs: 42, seconds: 7560, text: '42 subs, 2 h 6 min' },
        result: { state: 'no-dip', label: 'No dip', note: 'steady to 0.05 mag (made-up)' },
      }),
      dip({
        mid: '2026-10-11T13:00:00Z',
        mid_label: 'Oct 11, 8:00 AM',
        over: true,
        imaging: { subs: 30, seconds: 3600, text: '30 subs, 1 h' },
        result: { state: 'dip', label: 'Dip seen', note: '0.3 mag deep (made-up)' },
      }),
      dip({
        mid_label: 'Oct 20, 3:35 PM',
        request: { id: 32, state: 'waiting', note: '', auto: true },
      }),
      dip({
        mid: '2026-10-29T23:00:00Z',
        mid_label: 'Oct 29, 6:00 PM',
        dark_text: '',
        observable: false,
        observable_note: 'Not requested, under the 1 hour of usable dark a request needs',
        result: { state: 'not-imaged', label: 'Not imaged', note: '' },
      }),
      dip({ mid: '2026-11-07T23:00:00Z', mid_label: 'Nov 7, 6:00 PM' }),
    ]

    function dippers(view: DipperView): Handler {
      const base = stacker({ ...list([star()]), star_types: starTypes, others: [dipperStar()] })
      let cur = view
      return (url, init) => {
        const p = new URL(url, 'http://x').pathname
        if (p === '/api/v1/discoveries/dippers/15523' && (init?.method ?? 'GET') === 'GET')
          return json(cur)
        if (p === '/api/v1/discoveries/dippers/15523/every-window' && init?.method === 'PUT') {
          cur = { ...cur, every_window: JSON.parse(String(init.body)).on }
          return json(cur)
        }
        if (p === '/api/v1/discoveries/dippers/15523/requests' && init?.method === 'POST')
          return json({ id: 90, state: 'waiting', note: '', auto: false })
        if (init?.method === 'DELETE') return new Response(null, { status: 204 })
        return base(url, init)
      }
    }

    const text = (e: Element) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''

    it('shows the windows and dips lines and opens the dip windows box', async () => {
      const { el, app, fetch } = await render(dippers(dipper({ windows: windows() })))
      const card = el.querySelector('article.other')!
      const dl = [...card.querySelectorAll('dt')].map((d) => [
        d.textContent,
        d.nextElementSibling?.textContent,
      ])
      expect(dl).toContainEqual(['Windows', 'every 9.356 days, 20 hours wide (made-up)'])
      expect(dl).toContainEqual(['Dips', '0.15 to 0.6 mag, made-up'])
      expect(card.querySelector('.dipbox')).toBeNull()
      button(card, 'Dip windows')!.click()
      await settle()
      expect(calls(fetch, '/api/v1/discoveries/dippers/15523')).toHaveLength(1)
      const box = card.querySelector('.dipbox')!
      expect(box.querySelector('h3')!.textContent).toBe('Dip windows')
      expect(text(box)).toContain(
        'Requests go in at high priority for the dark part of each window and follow the live curve on the Now page. Windows with less than 1 hour of usable dark are listed but not requested.',
      )
      expect([...box.querySelectorAll('th')].map((t) => t.textContent)).toEqual([
        'Window middle',
        'Dark time inside it',
        'Imaging',
        'Result',
      ])
      const rows = [...box.querySelectorAll('tbody tr')]
      expect(rows).toHaveLength(5)
      const cells = (r: Element) =>
        [...r.querySelectorAll('td')].map((td) =>
          [...td.querySelectorAll('.cell > *')].length
            ? [...td.querySelectorAll('.cell > *')].map((c) => c.textContent?.trim())
            : td.textContent?.trim(),
        )
      expect(cells(rows[0]!)).toEqual([
        'Oct 11, 7:00 AM',
        '11:12 PM to 5:55 AM',
        ['Window passed', '42 subs, 2 h 6 min'],
        ['No dip', 'steady to 0.05 mag (made-up)'],
      ])
      expect(rows[0]!.querySelector('td:last-child .badge')!.textContent).toBe('No dip')
      expect(rows[1]!.querySelector('td:last-child .badge.dip')!.textContent).toBe('Dip seen')
      expect(text(rows[1]!)).toContain('0.3 mag deep (made-up)')
      expect(button(rows[1]!, 'Request')).toBeUndefined()
      expect(text(rows[2]!)).toContain('Requested')
      expect(button(rows[2]!, 'Cancel request')).toBeDefined()
      expect(rows[2]!.querySelector('td:last-child')!.classList.contains('dim')).toBe(true)
      expect(rows[2]!.querySelector('td:last-child')!.textContent).toBe('Not imaged yet')
      expect(text(rows[3]!)).toContain('No dark time')
      expect(text(rows[3]!)).toContain(
        'Not requested, under the 1 hour of usable dark a request needs',
      )
      expect(button(rows[3]!, 'Request')).toBeUndefined()
      expect(text(box)).toContain('Past windows from made-up surveys: 3 dips over 2 years.')

      button(rows[4]!, 'Request')!.click()
      await settle()
      const post = calls(fetch, '/api/v1/discoveries/dippers/15523/requests')[0]!
      expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
        mid: '2026-11-07T23:00:00Z',
      })
      expect(text(rows[4]!)).toContain('Requested')
      button(rows[4]!, 'Cancel request')!.click()
      await settle()
      const del = fetch.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
      )!
      expect(String(del[0])).toBe('/api/v1/discoveries/eclipses/requests/90')
      app.unmount()
    })

    it('asks for every window with the toggle', async () => {
      const { el, app, fetch } = await render(dippers(dipper({ windows: windows() })))
      button(el, 'Dip windows')!.click()
      await settle()
      const box = el.querySelector('#every-15523') as HTMLInputElement
      expect(box.checked).toBe(false)
      expect(box.closest('label')!.textContent!.trim()).toBe(
        'Ask for imaging on every window the site can see',
      )
      box.checked = true
      box.dispatchEvent(new Event('change'))
      await settle()
      const put = puts(fetch).at(-1)!
      expect(String(put[0])).toBe('/api/v1/discoveries/dippers/15523/every-window')
      expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ on: true })
      expect((el.querySelector('#every-15523') as HTMLInputElement).checked).toBe(true)
      app.unmount()
    })

    it('says when the dip cycle is not stored', async () => {
      const { el, app } = await render(
        dippers(dipper({ ephemeris: null, past_text: 'Past windows: not measured yet.' })),
      )
      button(el, 'Dip windows')!.click()
      await settle()
      const box = el.querySelector('.dipbox')!
      expect(text(box)).toContain("Dip windows not set up yet: the star's dip cycle is not stored.")
      expect(box.querySelector('table')).toBeNull()
      expect(box.querySelector('input[type="checkbox"]')).toBeNull()
      expect(text(box)).toContain('Past windows: not measured yet.')
      app.unmount()
    })

    it('offers no dip windows on stars that are not dippers', async () => {
      const { el, app } = await render(
        stacker({ ...list([star()]), star_types: starTypes, others: [other()] }),
      )
      expect(button(el.querySelector('article.other')!, 'Dip windows')).toBeUndefined()
      const dts = [...el.querySelectorAll('article.other dt')].map((d) => d.textContent)
      expect(dts).not.toContain('Windows')
      app.unmount()
    })
  })
})
