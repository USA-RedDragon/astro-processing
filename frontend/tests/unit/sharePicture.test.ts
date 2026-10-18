import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, h, nextTick, ref } from 'vue'
import SharePicture from '@/scheduler/components/SharePicture.vue'
import type { Share } from '@/scheduler/api/binaries'
import { closeToast, shell } from '@/scheduler/shell'
import { useShare } from '@/scheduler/useShare'

afterEach(() => {
  vi.unstubAllGlobals()
  closeToast()
})

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

const ready: Share = {
  state: 'ready',
  url: '/api/v1/discoveries/sources/9/share.jpg?v=4',
  version: 4,
  note: '',
}

function mount(props: Record<string, unknown>) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(SharePicture, { title: 'Made-up Star', ...props }) })
  app.mount(el)
  return {
    el,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
}

const button = (el: Element, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as
    HTMLButtonElement | undefined

describe('SharePicture', () => {
  it('shows the thumbnail with download and opens it full size until Escape', async () => {
    const { el, unmount } = mount({ share: ready })
    expect(el.querySelector('.thumb img')!.getAttribute('src')).toBe(ready.url)
    expect(el.querySelector('a[download]')!.getAttribute('href')).toBe(
      '/api/v1/discoveries/sources/9/share.jpg?v=4&download=1',
    )
    ;(el.querySelector('.thumb') as HTMLButtonElement).click()
    await nextTick()
    expect(el.querySelector('[role="dialog"] img')!.getAttribute('src')).toBe(ready.url)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(el.querySelector('[role="dialog"]')).toBeNull()
    ;(el.querySelector('.thumb') as HTMLButtonElement).click()
    await nextTick()
    button(el, 'Close')!.click()
    await nextTick()
    expect(el.querySelector('[role="dialog"]')).toBeNull()
    unmount()
  })

  it('shows the note in place of the picture when there is none', () => {
    const none = mount({ share: { state: 'none', url: '', version: 0, note: 'Made-up: no colour picture.' } })
    expect(none.el.textContent).toContain('Made-up: no colour picture.')
    expect(none.el.querySelector('.thumb')).toBeNull()
    expect(button(none.el, 'Share')).toBeUndefined()
    none.unmount()
    const failed = mount({ share: { state: 'failed', url: '', version: 0, note: 'Made-up failure.' } })
    expect(failed.el.querySelector('.note.bad')!.textContent).toContain('Made-up failure.')
    failed.unmount()
    const err = mount({ share: null, error: 'made-up outage' })
    expect(err.el.textContent).toContain('The picture is not available: made-up outage')
    err.unmount()
  })

  it('shares the absolute address with the system share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    const { el, unmount } = mount({ share: ready })
    button(el, 'Share')!.click()
    await settle()
    expect(share).toHaveBeenCalledWith({
      url: new URL(ready.url, window.location.origin).href,
      title: 'Made-up Star',
    })
    expect(writeText).not.toHaveBeenCalled()
    unmount()
  })

  it('copies the address without a share sheet, and says to select it when copy is blocked', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { el, unmount } = mount({ share: ready })
    const abs = new URL(ready.url, window.location.origin).href
    button(el, 'Share')!.click()
    await settle()
    expect(writeText).toHaveBeenCalledWith(abs)
    expect(shell.toast?.text).toBe('Picture link copied')
    button(el, 'Share')!.click()
    await settle()
    expect(shell.toast?.text).toBe('Copy is blocked here. Select the text instead.')
    expect(shell.toast?.sub).toBe(abs)
    unmount()
  })
})

describe('useShare', () => {
  it('asks again while the picture is pending and stops once it is ready', async () => {
    const answers = [
      { state: 'pending', url: '', version: 0, note: 'Made-up: being drawn.' },
      ready,
    ]
    const fetch = vi.fn(async () => json(answers.shift() ?? ready))
    vi.stubGlobal('fetch', fetch)
    const id = ref<number | null>(9)
    const scope = effectScope()
    const s = scope.run(() => useShare(() => id.value, 5))!
    await settle()
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/v1/discoveries/sources/9/share')
    expect(s.share.value?.state).toBe('pending')
    await new Promise((r) => setTimeout(r, 20))
    await settle()
    expect(s.share.value?.state).toBe('ready')
    const calls = fetch.mock.calls.length
    await new Promise((r) => setTimeout(r, 20))
    expect(fetch.mock.calls.length).toBe(calls)
    id.value = null
    await settle()
    expect(s.share.value).toBeNull()
    scope.stop()
  })
})
