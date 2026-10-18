import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import VsxKitPage from '@/scheduler/pages/VsxKitPage.vue'
import { closeToast, shell } from '@/scheduler/shell'
import { kit, star } from './fixtures/binaries'

afterEach(() => {
  vi.unstubAllGlobals()
  closeToast()
})

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

async function render(handler: Handler, path = '/discoveries/mine/101/vsx') {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', fetch)
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/discoveries/mine', name: 'discoveries-mine', component: { render: () => null } },
      { path: '/discoveries/mine/:id/vsx', name: 'discovery-vsx', component: VsxKitPage },
      {
        path: '/discoveries/eclipses',
        name: 'discovery-eclipses',
        component: { render: () => null },
      },
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

function stacker(): Handler {
  return (url, init) => {
    const p = new URL(url, 'http://x').pathname
    if (p === '/api/v1/discoveries/binaries/settings' && init?.method === 'PUT')
      return json({ discoverer: JSON.parse(String(init.body)).discoverer })
    if (p === '/api/v1/discoveries/binaries/101' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      return json(star(body.primary_name ? { name: body.primary_name } : {}))
    }
    if (p === '/api/v1/discoveries/binaries/101/kit') return json(kit())
    return json({ error: 'not found' }, 404)
  }
}

const button = (el: Element, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as
    HTMLButtonElement | undefined

const row = (el: Element, label: string) =>
  [...el.querySelectorAll('.fld')].find((r) => r.querySelector('.k')?.textContent === label)!

const puts = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')

describe('VsxKitPage', () => {
  it('lays out the fields in form order with their missing states and copy buttons', async () => {
    const { el, app } = await render(stacker())
    expect(el.querySelector('h1')!.textContent).toBe('Gaia DR3 1000000000000000101')
    expect(el.textContent).toContain('My discoveries')
    expect(el.textContent).toContain('A made-up star in Test Field A.')
    expect(el.textContent).toContain('You submit this on VSX. The app never submits.')
    const labels = [...el.querySelectorAll('.fld .k')].map((k) => k.textContent)
    expect(labels).toEqual([
      'Position (J2000)',
      'Primary name',
      'Other names',
      'Spectral type',
      'Period (days)',
      'Eclipse duration (%)',
      'Discoverer',
    ])
    expect(row(el, 'Position (J2000)').querySelector('.val.mono')!.textContent).toBe(
      '01 02 03.4 +05 06 07.8',
    )
    expect(row(el, 'Position (J2000)').textContent).toContain('Made-up hint.')
    expect(row(el, 'Other names').querySelector('.nm')!.textContent).toBe('not looked up yet')
    expect(row(el, 'Spectral type').querySelector('.nm')!.textContent).toBe('leave empty')
    expect(row(el, 'Eclipse duration (%)').querySelector('.nm')!.textContent).toBe(
      'not measured yet',
    )
    expect(row(el, 'Discoverer').querySelector('.nm')!.textContent).toBe('not set yet')
    expect(row(el, 'Other names').querySelector('.copy')).toBeNull()
    expect(el.querySelectorAll('.copy')).toHaveLength(3)
    app.unmount()
  })

  it('shows the files, the slots with their notes and the planner link', async () => {
    const { el, app } = await render(stacker())
    const phased = el.querySelector('.file-phased')!
    expect(phased.querySelector('img')!.getAttribute('src')).toBe(
      '/api/v1/discoveries/binaries/101/files/phased.png',
    )
    expect(phased.textContent).toContain('Made-up caption for the folded curve.')
    const dl = phased.querySelector('a[download]')!
    expect(dl.getAttribute('href')).toBe('/api/v1/discoveries/binaries/101/files/phased.png')
    expect(dl.textContent).toContain('Download (51 KB)')
    const own = el.querySelector('.file-own')!
    expect(own.textContent).toContain('Made-up note: no eclipse caught yet.')
    expect(own.querySelector('a')!.getAttribute('href')).toBe('/discoveries/eclipses?star=101')
    expect(el.querySelector('.file-chart')!.textContent).toContain('Made-up note: being made.')
    app.unmount()
  })

  it('copies a value, and says to select the text when copy is blocked', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { el, app } = await render(stacker())
    const copy = () => row(el, 'Period (days)').querySelector('.copy') as HTMLButtonElement
    copy().click()
    await settle()
    expect(writeText).toHaveBeenCalledWith('7.25000')
    expect(copy().textContent?.trim()).toBe('Copied')
    expect(shell.toast).toBeNull()
    copy().click()
    await settle()
    expect(shell.toast?.text).toBe('Copy is blocked here. Select the text instead.')
    app.unmount()
  })

  it('saves the discoverer as a setting and the primary name on the star', async () => {
    const { el, app, fetch } = await render(stacker())
    button(row(el, 'Discoverer'), 'Change')!.click()
    await settle()
    const input = row(el, 'Discoverer').querySelector('input') as HTMLInputElement
    input.value = 'Made-up Observer'
    input.dispatchEvent(new Event('input'))
    button(row(el, 'Discoverer'), 'Save')!.click()
    await settle()
    const set = puts(fetch)[0]!
    expect(String(set[0])).toBe('/api/v1/discoveries/binaries/settings')
    expect(JSON.parse(String((set[1] as RequestInit).body))).toEqual({
      discoverer: 'Made-up Observer',
    })
    expect(row(el, 'Discoverer').querySelector('.val')!.textContent).toBe('Made-up Observer')

    button(row(el, 'Primary name'), 'Change')!.click()
    await settle()
    const name = row(el, 'Primary name').querySelector('input') as HTMLInputElement
    name.value = 'MUP V1'
    name.dispatchEvent(new Event('input'))
    button(row(el, 'Primary name'), 'Save')!.click()
    await settle()
    const put = puts(fetch)[1]!
    expect(String(put[0])).toBe('/api/v1/discoveries/binaries/101')
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ primary_name: 'MUP V1' })
    expect(row(el, 'Primary name').querySelector('.val')!.textContent).toBe('MUP V1')
    expect(el.querySelector('h1')!.textContent).toBe('MUP V1')
    app.unmount()
  })

  it('keeps the checklist count and saves only the items you tick', async () => {
    const { el, app, fetch } = await render(stacker())
    const boxes = () => [...el.querySelectorAll('.checks input')] as HTMLInputElement[]
    expect(el.textContent).toContain('2 of 3 done')
    expect(boxes()[0]!.checked).toBe(true)
    expect(boxes()[0]!.disabled).toBe(true)
    expect(el.querySelector('.checks')!.textContent).toContain('Checked by the app')
    boxes()[1]!.checked = true
    boxes()[1]!.dispatchEvent(new Event('change'))
    await settle()
    const put = puts(fetch)[0]!
    expect(String(put[0])).toBe('/api/v1/discoveries/binaries/101')
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({
      checklist: { name: true, upload: true },
    })
    expect(el.textContent).toContain('3 of 3 done')
    app.unmount()
  })

  it('puts a tick back when it does not save', async () => {
    const base = stacker()
    const { el, app } = await render((url, init) =>
      init?.method === 'PUT' ? json({ error: 'made-up failure' }, 500) : base(url, init),
    )
    const box = el.querySelectorAll('.checks input')[1] as HTMLInputElement
    box.checked = true
    box.dispatchEvent(new Event('change'))
    await settle()
    expect(el.textContent).toContain('That did not save: made-up failure')
    expect(el.textContent).toContain('2 of 3 done')
    app.unmount()
  })

  it('says when the stacker is down', async () => {
    const { el, app } = await render(() => json({ error: 'stacker restarting' }, 502))
    expect(el.textContent).toContain('The stacker did not answer: stacker restarting')
    app.unmount()
  })
})
