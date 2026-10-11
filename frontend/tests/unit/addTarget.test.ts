import { describe, expect, it } from 'vitest'
import {
  chooseLayout,
  framingOverride,
  landingStep,
  layoutFromId,
  matchSummary,
} from '@/scheduler/addTarget'

describe('add target landing step', () => {
  it('opens the requested step when nothing needs deciding', () => {
    expect(landingStep('frame', false)).toBe(2)
    expect(landingStep('mosaic', false)).toBe(3)
    expect(landingStep(undefined, false)).toBe(1)
  })

  it('stays on Find while a name match waits for a decision', () => {
    expect(landingStep('frame', true)).toBe(1)
    expect(landingStep('mosaic', true)).toBe(1)
  })
})

describe('add target name match summary', () => {
  const m = { subjectName: 'Andromeda', status: 'imaged' }
  it('says what the person chose', () => {
    expect(matchSummary(m, 'separate')).toBe('Same object as Andromeda, kept separate')
    expect(matchSummary(m, 'link')).toBe(
      'Same object as Andromeda, its stacker data linked to the new project',
    )
    expect(matchSummary(m, 'different')).toBe('Not the same as Andromeda')
  })

  it('does not claim a choice nobody made', () => {
    expect(matchSummary({ ...m, status: 'confirmed' }, '')).toBe(
      'Same object as Andromeda, confirmed before',
    )
    expect(matchSummary(m, '')).toBe('Not decided for Andromeda')
    expect(matchSummary(null, '')).toBe('No project, target or stacker object of yours matches.')
  })
})

describe('mosaic layout choice', () => {
  const options = [
    { id: 'grid-6x6', recommended: true },
    { id: 'grid-4x5', recommended: false },
  ]
  it('keeps an asked-for grid while it is still wanted', () => {
    expect(chooseLayout({ options, chosen: { id: 'grid-11x7' } }, true, 'grid-11x7')).toBe(
      'grid-11x7',
    )
  })

  it('keeps a listed choice and falls back to the recommended layout', () => {
    expect(chooseLayout({ options }, false, 'grid-4x5')).toBe('grid-4x5')
    expect(chooseLayout({ options }, false, 'grid-11x7')).toBe('grid-6x6')
    expect(chooseLayout({ options: [] }, false, '')).toBe('')
  })
})

describe('add target framing link', () => {
  it('reads a layout id into its kind and grid', () => {
    expect(layoutFromId('brick-2x4')).toEqual({ brick: true, rows: 2, cols: 4 })
    expect(layoutFromId('grid-3x2')).toEqual({ brick: false, rows: 3, cols: 2 })
    expect(layoutFromId('strip-1x4')).toEqual({ brick: false, rows: 1, cols: 4 })
    expect(layoutFromId('single')).toBeNull()
    expect(layoutFromId('brick-0x4')).toBeNull()
    expect(layoutFromId(undefined)).toBeNull()
  })

  it('takes a centre only when both coordinates are valid', () => {
    expect(framingOverride({ ra: '272.7', dec: '-19.3' })).toEqual({ ra: 272.7, dec: -19.3 })
    expect(framingOverride({ ra: '-10', dec: '5' })).toEqual({ ra: 350, dec: 5 })
    expect(framingOverride({ ra: '272.7' })).toEqual({})
    expect(framingOverride({ ra: 'x', dec: '1' })).toEqual({})
    expect(framingOverride({ ra: '1', dec: '95' })).toEqual({})
  })

  it('takes an outline size with optional minor axis and angle', () => {
    expect(framingOverride({ major: '700', minor: '250', pa: '19.5' })).toEqual({
      majorArcmin: 700,
      minorArcmin: 250,
      pa: 19.5,
    })
    expect(framingOverride({ major: '120' })).toEqual({ majorArcmin: 120 })
    expect(framingOverride({ minor: '250', pa: '10' })).toEqual({})
    expect(framingOverride({ major: '0', minor: '5' })).toEqual({})
  })
})
