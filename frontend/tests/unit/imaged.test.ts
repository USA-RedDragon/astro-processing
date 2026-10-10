import { describe, expect, it } from 'vitest'
import { imagedRoute, subjectRoute } from '@/scheduler/imaged'

describe('subjectRoute', () => {
  it('prefers the project', () => {
    expect(subjectRoute({ key: 'project:7', name: 'M 31', projectId: 7 })).toBe('/project/7')
  })
  it('links stacker-only objects to the object page', () => {
    expect(subjectRoute({ subject: 'object:NGC 7000', name: 'NGC 7000' })).toBe(
      '/object/NGC%207000',
    )
  })
  it('has nothing for other subjects', () => {
    expect(subjectRoute({ key: 'query', name: 'x' })).toBeNull()
  })
})

describe('imagedRoute', () => {
  it('skips suggested and rejected links', () => {
    expect(
      imagedRoute([
        { key: 'project:1', name: 'A', projectId: 1, status: 'suggested' },
        { key: 'object:B', name: 'B', status: 'rejected' },
      ]),
    ).toBeNull()
  })
  it('picks a project over an object', () => {
    expect(
      imagedRoute([
        { key: 'object:B', name: 'B', status: 'auto' },
        { key: 'project:2', name: 'A', projectId: 2, status: 'confirmed' },
      ]),
    ).toEqual({ to: '/project/2', project: true })
  })
  it('falls back to the object page', () => {
    expect(imagedRoute([{ key: 'object:B', name: 'B', status: 'in-frame' }])).toEqual({
      to: '/object/B',
      project: false,
    })
  })
})
