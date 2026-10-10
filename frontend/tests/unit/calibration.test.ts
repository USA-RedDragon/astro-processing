import { describe, expect, it } from 'vitest'
import { CalibrationQuality, CalibrationSource } from '@/graphql/graphql'
import {
  captureText,
  darkText,
  importedText,
  importedTitle,
  ladderText,
  minFramesText,
  otherExposuresText,
} from '@/lib/calibration'

describe('dark library header', () => {
  it('builds the ladder text from the stacker values', () => {
    expect(ladderText({ ladder: [-25, -15, -5, 5], set_temp_exact_c: 1, set_temp_scale_max_c: 10 })).toBe(
      'Configured dark ladder: −25, −15, −5, 5 °C. A dark set counts at a setpoint when within 1 °C of it. ' +
        'Lights use the darks with the nearest setpoint up to 10 °C away, scaled.',
    )
    expect(ladderText({ ladder: [] })).toMatch(/^Not reported/)
  })

  it('states the real minimum and no invented count', () => {
    expect(minFramesText({ min_frames: 3 })).toBe(
      'The stacker builds a master from 3 or more frames and sets no recommended count.',
    )
    expect(minFramesText({ min_frames: null })).toMatch(/^Not reported/)
  })

  it('lists the exposures and setpoints the gaps need', () => {
    expect(
      captureText([
        { exposure: 600, set_temp: -15 },
        { exposure: 300, set_temp: -25 },
        { exposure: 600, set_temp: -25 },
      ]),
    ).toBe('The lights in the gaps need darks of 300 s and 600 s at −25 and −15 °C.')
    expect(captureText([{ exposure: null, set_temp: 5 }])).toBe(
      'The lights in the gaps need darks of lights with no recorded exposure at 5 °C.',
    )
    expect(captureText([])).toBe('')
  })

  it('says which darks stand in at the setpoint', () => {
    expect(otherExposuresText({ other_exposures: [] })).toBe('none')
    expect(otherExposuresText({ other_exposures: [120, 300] })).toBe('120 s and 300 s, scaled')
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
