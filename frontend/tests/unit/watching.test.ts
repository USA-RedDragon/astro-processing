import { describe, expect, it } from 'vitest'
import type { DiscoveryWatch, WatchNight } from '@/scheduler/api/discoveries'
import { countText, VIEWS } from '@/scheduler/discoveryInbox'
import {
  askedText,
  confidenceText,
  fadeShare,
  fadeText,
  gotText,
  imagingText,
  isWatched,
  nextText,
  resultText,
  watchedSince,
} from '@/scheduler/watching'

function watch(over: Partial<DiscoveryWatch> = {}): DiscoveryWatch {
  return {
    started_at: '2026-10-19T22:10:00Z',
    confidence: 'low',
    fade_nights: 4,
    fade_nights_needed: 6,
    imaging: 'asking',
    imaging_stopped_at: null,
    nights_planned: 5,
    nights_imaged: 2,
    next_survey_check: '2026-10-26',
    ended: '',
    nights: [],
    ...over,
  }
}

function night(over: Partial<WatchNight> = {}): WatchNight {
  return {
    night: '2026-10-27',
    asked_minutes: 60,
    filter: 'Luminance',
    got_minutes: null,
    result: '',
    state: 'sent',
    note: '',
    ...over,
  }
}

const counts = { look: 1, known: 1315, movers: 878, new_movers: 0, low: 0, vetted: 23, all: 2000 }

describe('Watching chip', () => {
  it('sits right after Needs a look', () => {
    expect(VIEWS.map((v) => v.key).slice(0, 2)).toEqual(['look', 'watching'])
    expect(VIEWS[1]!.label).toBe('Watching')
  })

  it('counts the watched finds, zero when the stacker sends no count', () => {
    expect(countText('watching', { ...counts, watching: 1 })).toBe('1')
    expect(countText('watching', { ...counts, watching: 1234 })).toBe('1,234')
    expect(countText('watching', counts)).toBe('0')
  })
})

describe('watched row', () => {
  it('shows only a live watch', () => {
    expect(isWatched({ watching: true, watch: watch() })).toBe(true)
    expect(isWatched({ watching: false, watch: watch({ ended: 'look' }) })).toBe(false)
    expect(isWatched({ watching: false, watch: null })).toBe(false)
    expect(isWatched({ watching: false, watch: watch() })).toBe(false)
    expect(isWatched({ watch: watch() })).toBe(true)
    expect(isWatched({})).toBe(false)
  })

  it('says when watching started and what comes next, as in 3635', () => {
    expect(watchedSince(watch())).toBe('watched since Oct 19')
    expect(nextText(watch())).toBe(
      'Next: field imaged on 2 of 5 nights · weekly survey check Oct 26',
    )
  })

  it('leaves out a survey check it does not know', () => {
    expect(nextText(watch({ next_survey_check: null }))).toBe('Next: field imaged on 2 of 5 nights')
  })

  it('says imaging requests stopped', () => {
    expect(nextText(watch({ imaging: 'stopped_user' }))).toBe(
      'Next: imaging requests stopped · weekly survey check Oct 26',
    )
  })
})

describe('watch panel', () => {
  it('names the vet confidence', () => {
    expect(confidenceText(watch())).toBe('Real · low confidence')
  })

  it('counts fade nights against those needed', () => {
    expect(fadeText(watch())).toBe('Fade nights so far: 4 of the 6 needed')
    expect(fadeShare(watch())).toBeCloseTo(4 / 6)
    expect(fadeShare(watch({ fade_nights: 9 }))).toBe(1)
  })

  it('does not make up a fade count it has not measured', () => {
    const w = watch({ fade_nights: null, fade_nights_needed: null })
    expect(fadeText(w)).toBe('Fade nights so far: not measured yet')
    expect(fadeShare(w)).toBeNull()
  })

  it('writes the asked and got columns', () => {
    expect(askedText(night())).toBe('60 min L')
    expect(askedText(night({ filter: 'Ha' }))).toBe('60 min Ha')
    expect(gotText(night())).toBe('–')
    expect(gotText(night({ got_minutes: 40 }))).toBe('40 min')
    expect(gotText(night({ got_minutes: 0 }))).toBe('0 min')
  })

  it('gives the measured result before where the ask stands', () => {
    expect(resultText(night({ result: 'steady', state: 'done' }))).toBe('Steady')
    expect(resultText(night({ result: 'faded', state: 'done' }))).toBe('Faded')
    expect(resultText(night())).toBe('Sent to the scheduler')
    expect(resultText(night({ state: 'waiting' }))).toBe('Waiting to send')
    expect(resultText(night({ state: 'cancelled' }))).toBe('Cancelled')
    expect(resultText(night({ state: 'failed', note: 'no plan in the filter' }))).toBe(
      'Could not send: no plan in the filter',
    )
    expect(resultText(night({ state: 'done' }))).toBe('Not measured yet')
  })

  it('says why imaging requests stopped', () => {
    expect(imagingText(watch())).toBe('')
    expect(
      imagingText(watch({ imaging: 'stopped_quiet', imaging_stopped_at: '2027-01-17T03:00:00Z' })),
    ).toBe(
      'Imaging requests stopped on Jan 17: 90 days passed with no new fade. It stays here until you mark it.',
    )
    expect(imagingText(watch({ imaging: 'stopped_user', imaging_stopped_at: null }))).toBe(
      'You stopped the imaging requests. It stays here until you mark it.',
    )
  })
})
