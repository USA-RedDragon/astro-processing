import { describe, expect, it } from 'vitest'
import {
  againstRecord,
  checkResult,
  chipText,
  dateTime,
  dayTime,
  daysBetween,
  lastCheckedText,
  mentionHead,
  mentionPill,
  nextCheckText,
  recordText,
  sortedMentions,
} from '@/scheduler/claims'
import { claims, mention, record, starClaims } from './fixtures/claims'

describe('claims words', () => {
  it('writes times in US Central with the zone', () => {
    expect(dayTime('2026-10-25T08:10:00Z')).toBe('Sun, Oct 25, 3:10 AM CDT')
    expect(dateTime('2026-10-21T00:12:24Z')).toBe('Oct 20, 7:12 PM CDT')
    expect(dateTime('2026-12-01T18:00:00Z')).toBe('Dec 1, 12:00 PM CST')
  })

  it('counts Central calendar days, not 24 hour spans', () => {
    expect(daysBetween('2026-10-21T00:12:24Z', '2026-10-23T15:00:00Z')).toBe(3)
    expect(daysBetween('2026-10-21T04:00:00Z', '2026-10-21T05:30:00Z')).toBe(1)
    expect(daysBetween(null, '2026-10-21T05:30:00Z')).toBeNull()
  })

  it('picks the pill from status and mark', () => {
    expect(mentionPill(mention())).toEqual({ text: 'New since your record', tone: 'bad' })
    expect(mentionPill(mention({ mark: 'seen' })).tone).toBe('warn')
    expect(mentionPill(mention({ mark: 'citing' })).text).toBe('Cites your work')
    expect(mentionPill(mention({ mark: 'own' })).text).toBe('Your own entry')
    expect(mentionPill(mention({ status: 'known' }))).toEqual({
      text: 'Known before your record',
      tone: 'info',
    })
    expect(mentionPill(mention({ status: 'first_check_after_record' })).text).toBe(
      'Already listed at the first check, dated after your record',
    )
  })

  it('puts the mention date next to the record date', () => {
    expect(mentionHead(mention())).toBe('made-up entry, dated Oct 23, 2026')
    expect(againstRecord(mention(), record)).toBe(
      'Your Zenodo record is dated Oct 20, 2026, 3 days before this.',
    )
    expect(againstRecord(mention({ dated: null }), record)).toBe(
      'Your Zenodo record is dated Oct 20, 2026, 5 days before the app first saw this.',
    )
    expect(againstRecord(mention({ status: 'known' }), record)).toBe('')
    expect(againstRecord(mention({ mark: 'own' }), record)).toBe('')
    expect(againstRecord(mention(), null)).toBe('')
  })

  it('writes the result cell of each source', () => {
    expect(checkResult(undefined).text).toBe('not checked yet')
    const c = { where: 'vsx', state: 'checked' as const, note: '', new: 0, known: 0 }
    expect(checkResult(c)).toEqual({ text: 'none', tone: '' })
    expect(checkResult({ ...c, new: 1, known: 2 })).toEqual({ text: '1 new, 2 known', tone: 'bad' })
    expect(checkResult({ ...c, known: 1 })).toEqual({ text: '1 known', tone: 'info' })
    expect(checkResult({ ...c, state: 'failed', note: 'timed out' }).text).toBe('could not check')
    expect(checkResult({ ...c, state: 'not_checked', note: 'needs an ADS key' }).text).toBe(
      'needs an ADS key',
    )
  })

  it('writes the strip and chip words without guessing', () => {
    const none = claims({ last_checked: null, next_check: null })
    expect(lastCheckedText(none)).toBe('not checked yet')
    expect(nextCheckText(none)).toBe('')
    expect(chipText(none)).toBe('none new')
    expect(lastCheckedText(claims({ running: true }))).toBe('checking now')
    expect(nextCheckText(claims())).toBe('next check Sun, Nov 1')
    expect(recordText(record)).toBe('Zenodo, published Oct 20, 7:12 PM CDT')
    expect(recordText(null)).toBe('no dated record yet')
    const some = claims({
      per_star: [
        starClaims({ mentions: [mention(), mention({ id: 2, mark: 'seen' })] }),
        starClaims({ source_id: 202, mentions: [mention({ id: 3, status: 'known' })] }),
      ],
    })
    expect(chipText(some)).toBe('1 new')
  })

  it('lists open new mentions first, then newest', () => {
    const ms = [
      mention({ id: 1, status: 'known', dated: '2024-01-01T00:00:00Z' }),
      mention({ id: 2, mark: 'seen' }),
      mention({ id: 3 }),
      mention({ id: 4, status: 'known', dated: '2025-01-01T00:00:00Z' }),
    ]
    expect(sortedMentions(ms).map((m) => m.id)).toEqual([3, 2, 4, 1])
  })
})
