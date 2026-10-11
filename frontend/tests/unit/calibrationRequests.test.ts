import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/scheduler/api/client'
import {
  cancelCalibration,
  getBiasBacklog,
  getCalibrationRequests,
  requestCalibration,
  type CalibrationRequest,
} from '@/scheduler/api/calibration'
import { describeOutcome } from '@/scheduler/shell'
import type { CommandRecord } from '@/scheduler/api/commands'
import { formatDate } from '@/lib/formatters'
import {
  askedText,
  commandErrorText,
  hasOpenRequest,
  itemText,
  nightsOf,
  openRequests,
  payloadOf,
  progressText,
  refsText,
  requestPayload,
  requestPublishState,
  requestTitle,
  requestsUnavailableText,
  sortRequests,
  statusText,
  typeLabel,
} from '@/lib/calibrationRequests'

afterEach(() => vi.unstubAllGlobals())

const req = (over: Partial<CalibrationRequest> = {}): CalibrationRequest => ({
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
  items: [{ key: 'Red', label: 'Red flats', frames_have: 0, frames_needed: 3, done: false }],
  publish: { table: 'ts_flat_request', mode: 'on', published_at: '2026-10-10T12:05:00Z', skipped: '' },
  basis: 'done when 3 flats per filter are indexed',
  ...over,
})

function stubFetch(body: unknown, status = 200) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', f)
  return f
}

describe('calibration API', () => {
  it('reads the bias backlog', async () => {
    const f = stubFetch({ combos: [] })
    await getBiasBacklog()
    expect(f.mock.calls[0][0]).toBe('/api/v1/coverage/bias-backlog')
  })

  it('filters requests by object and status', async () => {
    const f = stubFetch([])
    await getCalibrationRequests({ object: 'M 31', status: 'open' })
    expect(f.mock.calls[0][0]).toBe('/api/v1/calibration/requests?object=M+31&status=open')
    await getCalibrationRequests()
    expect(f.mock.calls[1][0]).toBe('/api/v1/calibration/requests')
  })

  it('submits request and cancel as commands with the spec payload', async () => {
    const f = stubFetch({ id: 'c1', status: 'saved' })
    const p = requestPayload('flats', 'M 31', '12', '2026-10-09')
    await requestCalibration(p)
    await cancelCalibration(p)
    const bodies = f.mock.calls.map((c) => {
      const init = (c as unknown as [string, RequestInit])[1]
      expect(init.method).toBe('POST')
      return JSON.parse(String(init.body))
    })
    expect(f.mock.calls[0][0]).toBe('/api/v1/commands')
    expect(bodies).toEqual([
      { kind: 'calibration.request', payload: { type: 'flats', object: 'M 31', target_id: 12, night: '2026-10-09' } },
      { kind: 'calibration.cancel', payload: { type: 'flats', object: 'M 31', target_id: 12, night: '2026-10-09' } },
    ])
  })

  it('gives the stacker refusal as plain text', async () => {
    stubFetch({ error: 'invalid command payload: no lights of M 31 on 2026-10-09' }, 400)
    const e = await requestCalibration(requestPayload('darks', 'M 31', null, '2026-10-09')).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(commandErrorText(e)).toBe('no lights of M 31 on 2026-10-09')
  })
})

describe('calibration request helpers', () => {
  it('leaves target_id out when it is not a whole number', () => {
    expect(requestPayload('bias', 'M 31', null, '2026-10-09')).toEqual({ type: 'bias', object: 'M 31', night: '2026-10-09' })
    expect(requestPayload('bias', 'M 31', 'x', '2026-10-09')).not.toHaveProperty('target_id')
    expect(payloadOf(req({ target_id: null, type: 'darks' }))).toEqual({ type: 'darks', object: 'M 31', night: '2026-10-09' })
  })

  it('lists nights once, newest first', () => {
    expect(nightsOf([{ night: '2026-10-01' }, { night: '2026-10-09' }, { night: '2026-10-01' }])).toEqual([
      '2026-10-09',
      '2026-10-01',
    ])
  })

  it('sorts open first, then done, then cancelled, newest first', () => {
    const list = [
      req({ id: 'c', status: 'cancelled' }),
      req({ id: 'd', status: 'done' }),
      req({ id: 'o1', created_at: '2026-10-09T00:00:00Z' }),
      req({ id: 'o2', created_at: '2026-10-11T00:00:00Z' }),
    ]
    expect(sortRequests(list).map((r) => r.id)).toEqual(['o2', 'o1', 'd', 'c'])
    expect(openRequests(list).map((r) => r.id)).toEqual(['o2', 'o1'])
  })

  it('finds an open request of a type for a night', () => {
    const list = [req(), req({ id: 'x', type: 'darks', status: 'cancelled' })]
    expect(hasOpenRequest(list, 'flats', '2026-10-09')).toBe(true)
    expect(hasOpenRequest(list, 'darks', '2026-10-09')).toBe(false)
    expect(hasOpenRequest(list, 'flats', '2026-10-08')).toBe(false)
    expect(hasOpenRequest(list, 'flats', '2026-10-09', 'M 33')).toBe(false)
  })

  it('shows progress and keeps unknowns honest', () => {
    expect(itemText({ key: 'R', label: 'Red flats', frames_have: 2, frames_needed: 3, done: false })).toBe('2 of 3')
    expect(itemText({ key: 'R', label: 'Red flats', frames_have: null, frames_needed: null, done: false })).toBe(
      'not measured yet of not recorded',
    )
    expect(progressText(req())).toBe('0 of 1 done')
    expect(progressText(req({ items: null }))).toBe('No items recorded.')
  })

  it('says who asked and what happened', () => {
    expect(askedText(req())).toBe(`Asked by jacob@mcswain.dev on ${formatDate(Date.parse('2026-10-10T12:00:00Z') / 1000)}`)
    expect(askedText(req({ created_by: '', created_at: null }))).toBe('Asked by someone not recorded on not recorded')
    expect(statusText(req())).toBe('Open')
    expect(statusText(req({ status: 'done', done_at: null }))).toBe('Done on not recorded')
    expect(statusText(req({ status: 'cancelled', cancelled_by: 'x' }))).toBe('Cancelled by x on not recorded')
    expect(typeLabel('bias')).toBe('Bias')
    expect(requestTitle(req())).toBe('Flats for M 31 · night of 2026-10-09')
    expect(refsText([{ id: '1', object: 'M 31', night: '2026-10-09' }])).toEqual(['M 31 · night of 2026-10-09'])
  })
})

describe('request publish state', () => {
  const created = '2026-10-10T12:00:00Z'
  it('is seen only when on, not skipped and published after the request', () => {
    const s = requestPublishState(req().publish, created)
    expect(s.seen).toBe(true)
    expect(s.text).toContain('Published to ts_flat_request')
  })

  it('says why the observatory does not see it', () => {
    expect(requestPublishState({ table: 'ts_flat_request', mode: 'off', published_at: null, skipped: 'off' }, created)).toEqual({
      seen: false,
      text: 'The observatory does not see this request yet: publishing to ts_flat_request is off (calibration.publish).',
    })
    expect(requestPublishState({ table: 'ts_dark_need', mode: 'dry-run', published_at: null, skipped: '' }, created).text).toContain(
      'dry-run mode (darks.publish)',
    )
    const skipped = requestPublishState({ table: 'ts_bias_need', mode: 'on', published_at: created, skipped: 'scheduler DB down' }, created)
    expect(skipped.seen).toBe(false)
    expect(skipped.text).toContain('was skipped: scheduler DB down')
    expect(requestPublishState({ table: 'ts_bias_need', mode: 'on', published_at: null, skipped: '' }, created).seen).toBe(false)
    const older = requestPublishState({ table: 'ts_bias_need', mode: 'on', published_at: '2026-10-10T11:00:00Z', skipped: '' }, created)
    expect(older.seen).toBe(false)
    expect(older.text).toContain('waits for the next publish')
    expect(requestPublishState(null).text).toContain('not recorded')
  })

  it('says when the stacker does not serve requests', () => {
    expect(requestsUnavailableText(new ApiError(404, 'Not Found', null))).toContain('HTTP 404')
    expect(requestsUnavailableText(new Error('boom'))).toBe('Not available: boom')
  })

  it('says a saved calibration command goes to the observatory only when publishing is on', () => {
    const r = { status: 'saved', category: 'calibration' } as CommandRecord
    expect(describeOutcome(r).sub).toContain('when publishing is on')
    expect(describeOutcome({ ...r, category: 'goals' }).sub).toContain('Nothing changes')
  })
})
