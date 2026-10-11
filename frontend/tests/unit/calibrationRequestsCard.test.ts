import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import CalibrationRequestsCard from '@/components/CalibrationRequestsCard.vue'
import type { CalibrationRequest } from '@/scheduler/api/calibration'
import { shell } from '@/scheduler/shell'

afterEach(() => {
  vi.unstubAllGlobals()
  shell.toast = null
})

const flats: CalibrationRequest = {
  id: 'r1',
  type: 'flats',
  object: 'M 31',
  target_id: 12,
  night: '2026-10-09',
  status: 'open',
  created_at: '2026-10-10T12:00:00Z',
  created_by: 'jacob@mcswain.dev',
  done_at: null,
  cancelled_at: null,
  cancelled_by: null,
  items: [{ key: 'Red', label: 'Red flats', frames_have: 1, frames_needed: 3, done: false }],
  publish: { table: 'ts_flat_request', mode: 'off', published_at: null, skipped: 'off' },
  basis: 'done when 3 flats per filter are indexed',
}

const done: CalibrationRequest = {
  ...flats,
  id: 'r0',
  type: 'bias',
  status: 'done',
  night: '2026-10-01',
  created_at: '2026-10-02T12:00:00Z',
  done_at: '2026-10-03T12:00:00Z',
  items: [{ key: 'bias|100|50|1', label: 'gain 100, offset 50, bin 1', frames_have: 30, frames_needed: 30, done: true }],
}

type Call = { url: string; method: string; body: unknown }

function stub(post: (body: { kind: string; payload: unknown }) => Response) {
  const calls: Call[] = []
  let list: CalibrationRequest[] = [done, flats]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })
      if (method === 'POST') {
        const res = post(body)
        if (res.ok && body.kind === 'calibration.request') {
          list = [{ ...flats, id: 'r2', type: body.payload.type, created_at: new Date().toISOString() }, ...list]
        }
        if (res.ok && body.kind === 'calibration.cancel') list = list.map((r) => (r.id === 'r1' ? { ...r, status: 'cancelled' } : r))
        return res
      }
      return new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } })
    }),
  )
  return calls
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}

async function render() {
  const el = document.createElement('div')
  const app = createApp({
    render: () => h(CalibrationRequestsCard, { object: 'M 31', targetId: '12', nights: ['2026-10-09', '2026-10-01'] }),
  })
  app.mount(el)
  await flush()
  return { el, app }
}

const button = (el: HTMLElement, type: string) => el.querySelector<HTMLButtonElement>(`button[data-type="${type}"]`)!

describe('CalibrationRequestsCard', () => {
  it('loads this target’s requests, open first, and says why the observatory does not see them', async () => {
    const calls = stub(() => json({}))
    const { el, app } = await render()
    expect(calls[0].url).toBe('/api/v1/calibration/requests?object=M+31&status=all')
    const items = [...el.querySelectorAll('li[data-request]')].map((li) => li.getAttribute('data-request'))
    expect(items).toEqual(['r1', 'r0'])
    expect(el.textContent).toContain('Red flats 1 of 3')
    expect(el.textContent).toContain('gain 100, offset 50, bin 1 30 of 30 · done')
    expect(el.querySelector('[data-publish]')?.textContent).toContain(
      'The observatory does not see this request yet: publishing to ts_flat_request is off (calibration.publish).',
    )
    expect(button(el, 'flats').disabled).toBe(true)
    expect(button(el, 'flats').textContent).toContain('Flats requested')
    expect(button(el, 'darks').disabled).toBe(false)
    app.unmount()
  })

  it('submits a request for the chosen night and shows the result', async () => {
    const calls = stub(() =>
      json({ id: 'c1', kind: 'calibration.request', status: 'saved', title: 'Request darks for M 31 · night of 2026-10-09' }),
    )
    const { el, app } = await render()
    button(el, 'darks').click()
    await flush()
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.url).toBe('/api/v1/commands')
    expect(post?.body).toEqual({
      kind: 'calibration.request',
      payload: { type: 'darks', object: 'M 31', target_id: 12, night: '2026-10-09' },
    })
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2)
    expect(el.querySelector('[data-result]')?.textContent).toContain('Saved · Request darks for M 31 · night of 2026-10-09')
    expect(button(el, 'darks').disabled).toBe(true)
    expect(shell.toast?.undoId).toBe('c1')
    app.unmount()
  })

  it('shows the stacker’s refusal as written', async () => {
    stub(() => json({ error: 'invalid command payload: the lights of M 31 on 2026-10-01 have no gain or offset' }, 400))
    const { el, app } = await render()
    const select = el.querySelector('select')!
    select.value = '2026-10-01'
    select.dispatchEvent(new Event('change'))
    await flush()
    button(el, 'bias').click()
    await flush()
    const result = el.querySelector('[data-result]')?.textContent ?? ''
    expect(result).toContain('Not saved · Request bias for M 31 · night of 2026-10-01')
    expect(result).toContain('the lights of M 31 on 2026-10-01 have no gain or offset')
    expect(result).not.toContain('invalid command payload')
    expect(shell.toast?.tone).toBe('bad')
    app.unmount()
  })

  it('cancels an open request with the request’s payload', async () => {
    const calls = stub(() =>
      json({ id: 'c2', kind: 'calibration.cancel', status: 'saved', title: 'Cancel the flats request for M 31 · night of 2026-10-09' }),
    )
    const { el, app } = await render()
    const cancel = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel')!
    cancel.click()
    await flush()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      kind: 'calibration.cancel',
      payload: { type: 'flats', object: 'M 31', target_id: 12, night: '2026-10-09' },
    })
    expect(button(el, 'flats').disabled).toBe(false)
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Cancel')).toBe(false)
    app.unmount()
  })
})
