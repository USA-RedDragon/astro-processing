import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSourceChecks } from '@/scheduler/useSourceChecks'
import type { SourceChecks } from '@/scheduler/api/discoveries'
import andromedaJson from './fixtures/checksAndromeda.json'

const andromeda = andromedaJson as unknown as SourceChecks

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

const state = (id: number, s: SourceChecks['state']): SourceChecks => ({
  source_id: id,
  state: s,
  report: null,
  error: '',
  requested_at: null,
  finished_at: null,
})

async function flush() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r))
  await nextTick()
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  vi.stubGlobal('fetch', fetch)
  const id = ref<number | null>(2)
  const scope = effectScope()
  const c = scope.run(() => useSourceChecks(() => id.value, 15000))!
  return { fetch, id, c, scope }
}

const gets = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls.filter(
    (x) => !(x[1] as RequestInit | undefined)?.method || (x[1] as RequestInit).method === 'GET',
  )

describe('useSourceChecks', () => {
  it('loads once and does not poll a finished report', async () => {
    const { fetch, c, scope } = setup(() => json(andromeda))
    await flush()
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/v1/discoveries/sources/2/checks')
    expect(c.checks.value?.state).toBe('done')
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetch).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('polls every 15 s while running and stops when done', async () => {
    let n = 0
    const { fetch, c, scope } = setup(() =>
      json(++n < 3 ? state(2, n === 1 ? 'queued' : 'running') : andromeda),
    )
    await flush()
    expect(c.checks.value?.state).toBe('queued')
    await vi.advanceTimersByTimeAsync(14999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(c.checks.value?.state).toBe('running')
    await vi.advanceTimersByTimeAsync(15000)
    await flush()
    expect(c.checks.value?.state).toBe('done')
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetch).toHaveBeenCalledTimes(3)
    scope.stop()
  })

  it('stops polling the old source when another is picked, and drops its late answer', async () => {
    let release: (r: Response) => void = () => {}
    const { fetch, id, c, scope } = setup((url) => {
      if (url.includes('/sources/2/')) return json(state(2, 'running'))
      return new Promise<Response>((r) => (release = r))
    })
    await flush()
    expect(c.checks.value?.state).toBe('running')
    id.value = 3
    await flush()
    expect(c.checks.value).toBeNull()
    expect(c.loading.value).toBe(true)
    id.value = 2
    await flush()
    release(json(state(3, 'done')))
    await flush()
    expect(c.checks.value?.source_id).toBe(2)
    await vi.advanceTimersByTimeAsync(15000)
    await flush()
    const ids = gets(fetch).map((x) => String(x[0]))
    expect(ids).toEqual([
      '/api/v1/discoveries/sources/2/checks',
      '/api/v1/discoveries/sources/3/checks',
      '/api/v1/discoveries/sources/2/checks',
      '/api/v1/discoveries/sources/2/checks',
    ])
    id.value = null
    await flush()
    await vi.advanceTimersByTimeAsync(60000)
    expect(gets(fetch)).toHaveLength(4)
    scope.stop()
  })

  it('queues a fresh run and polls it', async () => {
    let posted = false
    const { fetch, c, scope } = setup((_url, init) => {
      if (init?.method === 'POST') {
        posted = true
        return json(state(2, 'queued'))
      }
      return json(posted ? andromeda : state(2, 'none'))
    })
    await flush()
    expect(c.checks.value?.state).toBe('none')
    await c.run()
    await flush()
    const post = fetch.mock.calls.find((x) => (x[1] as RequestInit | undefined)?.method === 'POST')!
    expect(String(post[0])).toBe('/api/v1/discoveries/sources/2/checks')
    expect(c.checks.value?.state).toBe('queued')
    await vi.advanceTimersByTimeAsync(15000)
    await flush()
    expect(c.checks.value?.state).toBe('done')
    scope.stop()
  })

  it('keeps the error of a failed load and of a run that did not start', async () => {
    const { c, scope } = setup((_url, init) =>
      init?.method === 'POST'
        ? json({ error: 'stacker busy' }, 503)
        : json({ error: 'stacker restarting' }, 502),
    )
    await flush()
    expect(c.error.value).toBe('stacker restarting')
    expect(c.loading.value).toBe(false)
    await c.run()
    expect(c.runError.value).toBe('stacker busy')
    expect(c.starting.value).toBe(false)
    scope.stop()
  })
})
