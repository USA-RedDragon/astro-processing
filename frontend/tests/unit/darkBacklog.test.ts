import { describe, expect, it } from 'vitest'
import { ApiError } from '@/scheduler/api/client'
import type { DarkBacklogCombo } from '@/scheduler/api/darks'
import { formatDate } from '@/lib/formatters'
import {
  NOT_MEASURED,
  basisText,
  computedText,
  coveredText,
  framesNeededText,
  framesText,
  isDarkBacklog,
  num,
  publishText,
  readoutText,
  sessionGapText,
  sessionText,
  setTempMatchText,
  setpointText,
  setupText,
  sortCombos,
  text,
  unavailableText,
  uncheckedText,
  visibleCombos,
  when,
} from '@/lib/darkBacklog'

const combo = (priority: number, key = `k${priority}`): DarkBacklogCombo => ({
  combo_key: key,
  priority,
  exposure: 300,
  gain: 0,
  offset: 50,
  binning: 1,
  readout_mode: null,
  set_temp: -20,
  set_temps_covered: [-19, -21, -20],
  frames_needed: 3,
  frames_have: 0,
  frames_rejected: 0,
  lights_blocked: 1251,
  lights_scaled: 0,
  nights: 40,
  latest_night: '2026-03-01',
  newest_dark_at: null,
  basis: 'no dark within 1 °C',
})

describe('dark backlog null handling', () => {
  it('says not measured yet instead of a number', () => {
    expect(num(null)).toBe(NOT_MEASURED)
    expect(num(undefined)).toBe('not measured yet')
    expect(num(Number.NaN)).toBe('not measured yet')
    expect(num(0)).toBe('0')
    expect(num(-25, '°C')).toBe('−25 °C')
    expect(num(null, 's', 'not recorded')).toBe('not recorded')
    expect(text(null)).toBe('not measured yet')
    expect(text('')).toBe('not measured yet')
    expect(text('Default')).toBe('Default')
  })

  it('formats times like the other pages and never guesses one', () => {
    const ts = '2026-10-10T08:12:00Z'
    expect(when(ts)).toBe(formatDate(Date.parse(ts) / 1000))
    expect(when(null)).toBe('not measured yet')
    expect(when('not a time')).toBe('not measured yet')
    expect(when(null, 'not recorded')).toBe('not recorded')
  })

  it('says not recorded for header values the stacker did not write', () => {
    const empty = { frames_needed: null, set_temp_exact_c: null, session_gap_hours: null, computed_at: null }
    expect(framesNeededText(empty)).toBe('Darks needed per combo: not recorded.')
    expect(setTempMatchText(empty)).toBe('Set temperature match: not recorded.')
    expect(sessionGapText(empty)).toBe('Session gap: not recorded.')
    expect(computedText(empty)).toBe('Computed: not recorded.')
    expect(basisText(null)).toBe('Basis: not recorded')
  })

  it('shows null combo values as missing', () => {
    const c = { ...combo(1), frames_have: null, set_temp: null, set_temps_covered: null }
    expect(framesText(c)).toBe('not measured yet of 3')
    expect(setpointText(c)).toBe('not recorded')
    expect(coveredText(c)).toBe('')
    expect(readoutText(c)).toBe('not recorded')
    expect(readoutText({ readout_mode: 'Default' })).toBe('Default')
  })

  it('says when no darks session was seen and keeps null counts unmeasured', () => {
    expect(sessionText(null)).toBe('No darks session seen yet.')
    const s = { from: null, to: null, frames: 12, clean: 11, leak: 1, unchecked: null }
    expect(sessionText(s)).toBe(
      'not measured yet to not measured yet: 12 frames, 11 clean, 1 rejected, not measured yet not checked yet.',
    )
    expect(uncheckedText({ unchecked: null })).toBe('Darks not checked yet: not measured yet.')
    expect(uncheckedText({ unchecked: 0 })).toBe('Darks not checked yet: 0.')
  })

  it('names missing rejected setup values', () => {
    expect(setupText({ exposure: 300, gain: 0, offset: 50, set_temp: 5 })).toBe('300 s, gain 0, offset 50, 5 °C')
    expect(setupText({ exposure: null, gain: null, offset: 50, set_temp: null })).toBe(
      'exposure not recorded, gain not recorded, offset 50, set temperature not recorded',
    )
  })
})

describe('dark backlog text', () => {
  it('builds the header from the stacker values with its basis', () => {
    const b = {
      frames_needed: 3,
      frames_needed_basis: 'the median of the darks per set you took before',
      set_temp_exact_c: 1,
      session_gap_hours: 36,
    }
    expect(framesNeededText(b)).toBe('Darks needed per combo: 3.')
    expect(basisText(b.frames_needed_basis)).toBe('Basis: the median of the darks per set you took before')
    expect(setTempMatchText(b)).toBe('A dark matches a light when their set temperatures are within 1 °C.')
    expect(sessionGapText(b)).toBe(
      'Darks of one setup taken less than 36 h apart form one set; a longer pause starts a new set.',
    )
  })

  it('lists the covered set temperatures in order', () => {
    expect(coveredText(combo(1))).toBe('covers −21, −20, −19 °C')
    expect(setpointText(combo(1))).toBe('−20 °C')
    expect(framesText({ frames_have: 2, frames_needed: 3 })).toBe('2 of 3')
  })

  it('states the publish mode and the last publish', () => {
    expect(publishText(null)).toEqual(['Publishing: not recorded.'])
    expect(publishText({ mode: 'off', published_at: null, rows: 0, skipped: '' })).toEqual([
      'Publishing is off: the observatory is not receiving the backlog.',
      'Last published: not since the stacker started.',
    ])
    const ts = '2026-10-10T07:00:00Z'
    expect(publishText({ mode: 'on', published_at: ts, rows: 12, skipped: 'no plugin' })).toEqual([
      'Publishing is on: the observatory receives the backlog.',
      `Last published: ${formatDate(Date.parse(ts) / 1000)}, 12 rows.`,
      'Skipped: no plugin',
    ])
    expect(publishText({ mode: 'dry-run', published_at: null, rows: null, skipped: null })[0]).toBe(
      'Publishing is in dry-run mode: the stacker logs what it would write and the observatory receives nothing.',
    )
    expect(publishText({ mode: 'later', published_at: null, rows: null, skipped: null })[0]).toBe(
      'Publishing mode: later.',
    )
  })

  it('says why the backlog is not available', () => {
    expect(unavailableText(new ApiError(404, 'Not Found', undefined))).toBe(
      'Not available: the stacker does not serve the dark backlog (HTTP 404).',
    )
    expect(unavailableText(new ApiError(500, 'database down', undefined))).toBe('Not available: database down')
    expect(unavailableText(new ApiError(502, '', undefined))).toBe('Not available: HTTP 502')
    expect(unavailableText(new Error('Failed to fetch'))).toBe('Not available: Failed to fetch')
    expect(isDarkBacklog('<html>')).toBe(false)
    expect(isDarkBacklog(null)).toBe(false)
    expect(isDarkBacklog({ combos: [] })).toBe(true)
  })
})

describe('dark backlog ordering', () => {
  it('orders combos by priority without changing the input', () => {
    const input = [combo(3), combo(1), combo(2, 'b'), combo(2, 'a')]
    expect(sortCombos(input).map((c) => c.combo_key)).toEqual(['k1', 'a', 'b', 'k3'])
    expect(input.map((c) => c.combo_key)).toEqual(['k3', 'k1', 'b', 'a'])
    expect(sortCombos(null)).toEqual([])
  })

  it('shows the first 25 by priority until asked for all', () => {
    const input = Array.from({ length: 110 }, (_, i) => combo(110 - i))
    const first = visibleCombos(input, false)
    expect(first).toHaveLength(25)
    expect(first[0].priority).toBe(1)
    expect(first[24].priority).toBe(25)
    expect(visibleCombos(input, true)).toHaveLength(110)
    expect(visibleCombos(input.slice(0, 3), false)).toHaveLength(3)
  })
})
