import { describe, expect, it } from 'vitest'
import type { CommandRecord } from '@/scheduler/api/commands'
import {
  HISTORY_PAGE,
  appendOlder,
  historyMatches,
  historyQuery,
  historySince,
  type HistoryFilters,
} from '@/scheduler/history'

const now = Date.parse('2026-10-11T12:00:00Z')
const rec = (p: Partial<CommandRecord>): CommandRecord => ({
  id: 'a',
  kind: 'project.edit',
  payload: {},
  author: 'jacob@mcswain.dev',
  title: 'Priority of Cygnis Loop',
  category: 'priority',
  destination: 'observatory',
  diffs: [],
  objects: [{ entity: 'project', name: 'Cygnis Loop' }],
  status: 'applied',
  attempts: 1,
  created_at: '2026-10-11T11:00:00.123456Z',
  updated_at: '2026-10-11T11:00:00.123456Z',
  ...p,
})
const all: HistoryFilters = { who: 'all', when: 'all', category: '', q: '' }

describe('history', () => {
  it('turns the When filter into a since time', () => {
    expect(historySince('24h', now)).toBe('2026-10-10T12:00:00.000Z')
    expect(historySince('14d', now)).toBe('2026-09-27T12:00:00.000Z')
    expect(historySince('all', now)).toBeUndefined()
  })

  it('asks the server for one page, filtered, and pages from the oldest shown entry', () => {
    expect(historyQuery({ who: 'app', when: '24h', category: 'goals', q: '  M31 ' }, now)).toEqual({
      category: 'goals',
      q: 'M31',
      destination: 'app',
      since: '2026-10-10T12:00:00.000Z',
      before: undefined,
      before_id: undefined,
      limit: HISTORY_PAGE,
    })
    const q = historyQuery({ ...all, who: 'web' }, now, rec({ id: 'z' }))
    expect(q.destination).toBe('observatory')
    expect(q.since).toBeUndefined()
    expect(q.before).toBe('2026-10-11T11:00:00.123456Z')
    expect(q.before_id).toBe('z')
  })

  it('applies every filter to live entries', () => {
    expect(historyMatches(rec({}), all, now)).toBe(true)
    expect(historyMatches(rec({}), { ...all, who: 'app' }, now)).toBe(false)
    expect(historyMatches(rec({ destination: 'app' }), { ...all, who: 'app' }, now)).toBe(true)
    expect(historyMatches(rec({ created_at: '2026-10-09T11:00:00Z' }), { ...all, when: '24h' }, now)).toBe(
      false,
    )
    expect(historyMatches(rec({}), { ...all, q: 'cygnis' }, now)).toBe(true)
    expect(historyMatches(rec({}), { ...all, category: 'goals' }, now)).toBe(false)
  })

  it('appends an older page without repeating entries', () => {
    const got = appendOlder([rec({ id: 'c' }), rec({ id: 'b' })], [rec({ id: 'b' }), rec({ id: 'a' })])
    expect(got.map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })
})
