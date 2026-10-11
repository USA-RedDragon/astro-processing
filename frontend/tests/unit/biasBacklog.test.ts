import { describe, expect, it } from 'vitest'
import { ApiError } from '@/scheduler/api/client'
import type { BiasBacklogCombo } from '@/scheduler/api/calibration'
import {
  biasFramesNeededText,
  biasNeedRuleText,
  biasOpenSetTitle,
  biasPublishText,
  biasSessionGapText,
  biasUnavailableText,
  currentBiasText,
  isBiasBacklog,
  newestBiasText,
  sortBiasCombos,
} from '@/lib/biasBacklog'

const combo = (priority: number, key: string): BiasBacklogCombo => ({
  combo_key: key,
  priority,
  gain: 100,
  offset: 50,
  binning: 1,
  readout_mode: null,
  frames_needed: 30,
  frames_have: 0,
  lights_missing: 0,
  lights_thin: 1200,
  nights: 12,
  latest_night: '2026-10-10',
  newest_bias_at: null,
  current_bias_night: '2025-02-05',
  current_bias_age_days: 612,
  requests: [],
  basis: 'thin',
})

describe('bias backlog', () => {
  it('orders combos by priority then key', () => {
    const out = sortBiasCombos([combo(2, 'bias|0|50|1'), combo(1, 'bias|100|50|1'), combo(0, 'bias|200|50|1')])
    expect(out.map((c) => c.priority)).toEqual([0, 1, 2])
    expect(sortBiasCombos(null)).toEqual([])
  })

  it('states the thresholds and their gaps', () => {
    expect(biasFramesNeededText({ frames_needed: 30 })).toBe('Bias frames needed per set: 30.')
    expect(biasFramesNeededText({ frames_needed: null })).toBe('Bias frames needed per set: not recorded.')
    expect(biasNeedRuleText({ frames_needed: 30 })).toContain('does not go stale by age')
    expect(biasNeedRuleText({ frames_needed: 30 })).toContain('fewer than 30 frames')
    expect(biasNeedRuleText({ frames_needed: null })).toContain('the frame target (not recorded)')
    expect(biasSessionGapText({ session_gap_hours: 36 })).toContain('less than 36 h apart')
    expect(biasOpenSetTitle({ session_gap_hours: null })).toContain('not recorded')
  })

  it('shows the current set and the newest frame honestly', () => {
    expect(currentBiasText(combo(1, 'k'))).toBe('2025-02-05, 612 d old')
    expect(currentBiasText({ current_bias_night: null, current_bias_age_days: null })).toBe('none on record')
    expect(currentBiasText({ current_bias_night: '2025-02-05', current_bias_age_days: null })).toBe('2025-02-05, age not recorded')
    expect(newestBiasText({ newest_bias_at: null })).toBe('none taken')
  })

  it('reports publish counts only after a publish', () => {
    expect(biasPublishText({ mode: 'off', published_at: null, rows: 0, changed: 0, deleted: 0, skipped: 'off' })).toEqual([
      'Publishing is off: the observatory is not receiving the backlog.',
      'Last published: not since the stacker started.',
      'Skipped: off',
    ])
    const on = biasPublishText({ mode: 'on', published_at: '2026-10-10T00:00:00Z', rows: 2, changed: 1, deleted: null, skipped: '' })
    expect(on.at(-1)).toBe('Last publish changed 1 rows and deleted not measured yet.')
    expect(biasPublishText(null)).toEqual(['Publishing: not recorded.'])
  })

  it('names a missing endpoint', () => {
    expect(isBiasBacklog({})).toBe(true)
    expect(isBiasBacklog([])).toBe(false)
    expect(biasUnavailableText(new ApiError(404, 'Not Found', null))).toContain('bias backlog (HTTP 404)')
  })
})
