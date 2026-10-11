import { describe, expect, it } from 'vitest'
import { pickPlans, templateLength } from '@/scheduler/addTarget'

describe('pickPlans', () => {
  const templates = [
    { id: 1, defaultExposure: 600 },
    { id: 2, defaultExposure: 0 },
  ]

  it('sends no length so the plan uses the system or template length', () => {
    const plans = pickPlans([{ template: { id: 1 } }], templates)
    expect(plans).toEqual([{ templateId: 1 }])
    expect(plans?.[0]).not.toHaveProperty('exposure')
    expect(templateLength(templates, 1)).toBe(600)
  })

  it('refuses when a template or its length is missing', () => {
    expect(pickPlans([{ template: { id: 2 } }], templates)).toBeNull()
    expect(pickPlans([{ template: null }], templates)).toBeNull()
    expect(pickPlans([], templates)).toBeNull()
    expect(pickPlans([{ template: { id: 1 } }], null)).toBeNull()
  })
})
