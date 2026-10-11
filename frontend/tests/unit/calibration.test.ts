import { describe, expect, it } from 'vitest'
import { CalibrationQuality, CalibrationSource } from '@/graphql/graphql'
import { coverageSummary, darkText, fmt, importedText, importedTitle, rowKey } from '@/lib/calibration'

describe('fmt', () => {
  it('uses a true minus sign and two decimals at most', () => {
    expect(fmt(-20)).toBe('−20')
    expect(fmt(4.126)).toBe('4.13')
  })
})

describe('calibration card', () => {
  const dark = {
    quality: CalibrationQuality.Fallback,
    scaled: true,
    temp_off: 10,
    set_temp: -20,
    exposure: 300,
  }

  it('says why a dark is scaled', () => {
    expect(darkText({ exposure: 600, set_temp: -10 }, dark)).toBe('scaled, 10 °C off, from 300 s')
    expect(darkText({ exposure: 300, set_temp: null }, { ...dark, temp_off: null })).toBe('scaled, setpoint unknown')
    expect(darkText({ exposure: 300, set_temp: -20 }, { ...dark, scaled: false })).toBe('match')
    expect(darkText({ exposure: 300, set_temp: -20 }, { ...dark, quality: CalibrationQuality.Missing })).toBe('none')
  })

  it('marks imported masters and their hand-entered values', () => {
    const m = {
      source: CalibrationSource.Imported,
      master: 'offset240/masters/masterBias_BIN-1_6248x4176.xisf',
      header_error: 'master not indexed',
      basis: { night: 'hand-entered', exposure: 'hand-entered', gain: 'hand-entered', offset: 'folder name', bin_x: 'file name' },
    }
    expect(importedText(m)).toBe('imported master; hand-entered: date, exposure, gain')
    expect(importedTitle(m)).toBe(
      'offset240/masters/masterBias_BIN-1_6248x4176.xisf\ndate: hand-entered\nexposure: hand-entered\n' +
        'gain: hand-entered\noffset: folder name\nbinning: file name\nheader not read: master not indexed',
    )
    expect(importedText({ source: CalibrationSource.Frames })).toBe('')
    expect(importedText({ source: CalibrationSource.Imported, basis: { gain: 'header' } })).toBe('imported master')
  })
})

describe('calibration row key', () => {
  it('tells apart rows that differ only in offset', () => {
    const row = { night: '2024-12-21', filter: 'Blue', exposure: 300, gain: 0, set_temp: -20, rotator: 156 }
    expect(rowKey({ ...row, offset: 50 })).not.toBe(rowKey({ ...row, offset: 240 }))
    expect(rowKey({ ...row, offset: 50 })).toBe(rowKey({ ...row, offset: 50 }))
  })
})

describe('calibration summary', () => {
  it('counts only exact flats and says what exact means', () => {
    const q = CalibrationQuality
    const rows = [
      { lights: 19, flat: { quality: q.Fallback }, dark: { quality: q.Fallback }, bias: { quality: q.Exact } },
      { lights: 4, flat: { quality: q.Exact }, dark: { quality: q.Missing }, bias: { quality: q.Missing } },
    ]
    expect(coverageSummary(rows)).toBe(
      'Lights with a flat from the same night, angle and gain: 4 / 23 · with darks: 19 / 23 · with bias: 19 / 23',
    )
    expect(coverageSummary([])).toBe(
      'Lights with a flat from the same night, angle and gain: 0 / 0 · with darks: 0 / 0 · with bias: 0 / 0',
    )
  })
})
