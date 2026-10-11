import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import CalibrationPage from '@/views/CalibrationPage.vue'

afterEach(() => vi.unstubAllGlobals())

const ref = { id: 'r1', object: 'M 31', night: '2026-10-09' }

const darkBacklog = {
  computed_at: '2026-10-11T00:00:00Z',
  frames_needed: 25,
  frames_needed_basis: 'matches the sets taken',
  set_temp_exact_c: 1,
  session_gap_hours: 36,
  combos: [
    {
      combo_key: 'dark|300|100|50|1|-10', priority: 0, exposure: 300, gain: 100, offset: 50, binning: 1,
      readout_mode: null, set_temp: -10, set_temps_covered: null, frames_needed: 25, frames_have: 3,
      frames_rejected: 0, lights_blocked: 0, lights_scaled: 0, nights: 1, latest_night: '2026-10-09',
      newest_dark_at: null, requests: [ref], basis: 'requested',
    },
    {
      combo_key: 'dark|60|0|50|1|-10', priority: 1, exposure: 60, gain: 0, offset: 50, binning: 1,
      readout_mode: null, set_temp: -10, set_temps_covered: null, frames_needed: 25, frames_have: 0,
      frames_rejected: 0, lights_blocked: 40, lights_scaled: 0, nights: 2, latest_night: '2026-10-01',
      newest_dark_at: null, requests: [], basis: 'no dark',
    },
  ],
  unschedulable: [],
  last_session: null,
  rejected: [],
  rejected_total: 0,
  unchecked: 0,
  publish: { mode: 'on', published_at: '2026-10-11T00:00:00Z', rows: 2, skipped: '' },
}

const biasBacklog = {
  computed_at: '2026-10-11T00:00:00Z',
  frames_needed: 30,
  frames_needed_basis: 'The target of 30 bias frames per set matches the only bias set on record.',
  session_gap_hours: 36,
  combos: [
    {
      combo_key: 'bias|100|50|1', priority: 1, gain: 100, offset: 50, binning: 1, readout_mode: null,
      frames_needed: 30, frames_have: 0, lights_missing: 0, lights_thin: 1200, nights: 12,
      latest_night: '2026-10-10', newest_bias_at: null, current_bias_night: '2025-02-05',
      current_bias_age_days: 612, requests: [ref], basis: 'short bias set',
    },
  ],
  unschedulable: [{ lights: 562, reason: 'the lights have no GAIN or OFFSET in their header' }],
  publish: { mode: 'off', published_at: null, rows: 0, changed: 0, deleted: 0, skipped: 'off' },
}

const open = [
  {
    id: 'r1', type: 'bias', object: 'M 31', target_id: 12, night: '2026-10-09', status: 'open',
    created_at: '2026-10-10T12:00:00Z', created_by: 'jacob@mcswain.dev', done_at: null, cancelled_at: null,
    cancelled_by: null, items: [{ key: 'bias|100|50|1', label: 'gain 100, offset 50, bin 1', frames_have: 0, frames_needed: 30, done: false }],
    publish: { table: 'ts_bias_need', mode: 'off', published_at: null, skipped: 'off' }, basis: 'done at 30',
  },
]

async function render() {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      const body = url.includes('bias-backlog') ? biasBacklog : url.includes('dark-backlog') ? darkBacklog : open
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    }),
  )
  const el = document.createElement('div')
  const app = createApp({ render: () => h(CalibrationPage) })
  app.mount(el)
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
  return { el, app, urls }
}

describe('CalibrationPage', () => {
  it('marks requested dark combos', async () => {
    const { el, app } = await render()
    const requested = el.querySelector('[data-combo="dark|300|100|50|1|-10"]')?.textContent ?? ''
    expect(requested).toContain('requested')
    expect(requested).toContain('M 31 · night of 2026-10-09')
    const plain = el.querySelector('[data-combo="dark|60|0|50|1|-10"]')?.textContent ?? ''
    expect(plain).not.toContain('requested')
    app.unmount()
  })

  it('shows the bias backlog with its bases and publish state', async () => {
    const { el, app, urls } = await render()
    expect(urls).toContain('/api/v1/coverage/bias-backlog')
    const text = el.textContent ?? ''
    expect(text).toContain('Bias backlog')
    expect(text).toContain('Bias frames needed per set: 30.')
    expect(text).toContain('Bias does not go stale by age.')
    expect(text).toContain('fewer than 30 frames')
    expect(text).not.toContain('Lights stale')
    const row = el.querySelector('[data-combo="bias|100|50|1"]')?.textContent ?? ''
    expect(row).toContain('1200')
    expect(row).toContain('2025-02-05, 612 d old')
    expect(row).toContain('none taken')
    expect(row).toContain('requested')
    expect(text).toContain('the lights have no GAIN or OFFSET in their header')
    expect(el.querySelector('[data-bias-publish]')?.textContent).toContain('Publishing is off')
    app.unmount()
  })

  it('lists open requests across targets', async () => {
    const { el, app, urls } = await render()
    expect(urls).toContain('/api/v1/calibration/requests?status=open')
    const item = el.querySelector('li[data-request="r1"]')?.textContent ?? ''
    expect(item).toContain('M 31 · Bias · night of 2026-10-09')
    expect(item).toContain('0 of 30')
    expect(item).toContain('publishing to ts_bias_need is off (calibration.publish)')
    app.unmount()
  })
})
