import { describe, expect, it } from 'vitest'
import { CalibrationQuality, CalibrationSource } from '@/graphql/graphql'
import { darkText, fmt, importedText, importedTitle } from '@/lib/calibration'

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
