import { describe, expect, it } from 'vitest'
import { chooseLayout, landingStep, matchSummary } from '@/scheduler/addTarget'

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
