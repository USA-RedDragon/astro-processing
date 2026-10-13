import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { CutoutLimited, cutoutUrl, fetchCutout, snapFov, useCutout } from '@/scheduler/cutout'

describe('cutoutUrl', () => {
  it('wraps RA, rounds coordinates and clamps the field of view', () => {
    const u = new URL(
      cutoutUrl({ ra: -10, dec: 41.266666666, fov: 245, width: 160.4, height: 100 }),
      'http://x',
    )
    expect(u.pathname).toBe('/api/v1/sky/cutout')
    expect(u.searchParams.get('ra')).toBe('350.000')
    expect(u.searchParams.get('dec')).toBe('41.267')
    expect(u.searchParams.get('fov')).toBe('120.000')
    expect(u.searchParams.get('width')).toBe('160')
    expect(u.searchParams.get('rotation')).toBe('0.0')
  })
})

describe('snapFov', () => {
  it('rounds up to a shared ladder so nearby fields reuse one image', () => {
    expect(snapFov(1)).toBe(1)
    expect(snapFov(1.01)).toBe(snapFov(1.09))
    expect(snapFov(1.01)).toBeGreaterThanOrEqual(1.01)
    expect(snapFov(73.8)).toBeGreaterThanOrEqual(73.8)
    expect(snapFov(73.8) / 73.8).toBeLessThan(1.1)
    expect(snapFov(500)).toBe(120)
  })
})

const reply = (status: number, headers: Record<string, string> = {}) =>
  ({
    status,
    ok: status === 200,
    headers: new Headers(headers),
    blob: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])]),
  }) as unknown as Response
const jpeg = () => reply(200)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchCutout', () => {
  it('shares one request per image and runs at most four at once', async () => {
    let live = 0
    let peak = 0
    const calls: string[] = []
    const release: (() => void)[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((src: string) => {
        calls.push(src)
        live++
        peak = Math.max(peak, live)
        return new Promise<Response>((resolve) =>
          release.push(() => {
            live--
            resolve(jpeg())
          }),
        )
      }),
    )
    let n = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${n++}`)
    const srcs = Array.from({ length: 8 }, (_, i) => `/api/v1/sky/cutout?ra=${i}`)
    const all = Promise.all([...srcs, srcs[0]!].map((s) => fetchCutout(s)))
    for (let i = 0; i < 20 && calls.length < 8; i++) {
      await new Promise((r) => setTimeout(r, 0))
      release.splice(0).forEach((r) => r())
    }
    await new Promise((r) => setTimeout(r, 0))
    release.splice(0).forEach((r) => r())
    const got = await all
    expect(calls.length).toBe(8)
    expect(peak).toBeLessThanOrEqual(4)
    expect(got[8]).toBe(got[0])
    expect(await fetchCutout(srcs[3]!)).toBe(got[3])
    expect(calls.length).toBe(8)
  })

  it('drops a queued image when nobody is waiting for it any more', async () => {
    const calls: string[] = []
    const release: (() => void)[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (src: string) =>
          new Promise<Response>((resolve) => {
            calls.push(src)
            release.push(() => resolve(jpeg()))
          }),
      ),
    )
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x')
    const busy = Array.from({ length: 4 }, (_, i) => fetchCutout(`/api/v1/sky/cutout?ra=q${i}`))
    const gone = new AbortController()
    const left = fetchCutout('/api/v1/sky/cutout?ra=left', gone.signal).catch((e: unknown) => e)
    const kept = fetchCutout('/api/v1/sky/cutout?ra=kept', new AbortController().signal)
    await new Promise((r) => setTimeout(r, 0))
    gone.abort()
    expect(((await left) as Error).name).toBe('AbortError')
    for (let i = 0; i < 5; i++) {
      release.splice(0).forEach((r) => r())
      await new Promise((r) => setTimeout(r, 0))
    }
    await Promise.all([...busy, kept])
    expect(calls.some((c) => c.endsWith('ra=left'))).toBe(false)
    expect(calls.some((c) => c.endsWith('ra=kept'))).toBe(true)
  })

  it('reports a busy survey with its wait', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(429, { 'Retry-After': '12' })),
    )
    const err = await fetchCutout('/api/v1/sky/cutout?ra=busy').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CutoutLimited)
    expect((err as CutoutLimited).wait).toBe(12)
  })
})

describe('useCutout', () => {
  it('waits out a busy survey and fills in instead of failing', async () => {
    vi.useFakeTimers()
    let busy = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (busy ? reply(429, { 'Retry-After': '3' }) : jpeg())),
    )
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:queued')
    let got: ReturnType<typeof useCutout> | undefined
    const app = createApp(
      defineComponent({
        setup() {
          got = useCutout(() => ({ ra: 77.7, dec: 7, fov: 1, width: 100, height: 80 }))
          return () => h('div')
        },
      }),
    )
    app.mount(document.createElement('div'))
    await vi.advanceTimersByTimeAsync(0)
    expect(got!.state.value).toBe('limited')
    expect(got!.retryIn.value).toBe(3)
    busy = false
    await vi.advanceTimersByTimeAsync(3000)
    await nextTick()
    expect(got!.state.value).toBe('ready')
    expect(got!.url.value).toBe('blob:queued')
    app.unmount()
  })
})
