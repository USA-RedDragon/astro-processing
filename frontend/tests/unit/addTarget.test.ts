import { describe, expect, it } from 'vitest'
import { landingStep, matchSummary } from '@/scheduler/addTarget'

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
