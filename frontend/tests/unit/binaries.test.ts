import { describe, expect, it } from 'vitest'
import {
  absoluteUrl,
  bytesText,
  canCopy,
  checklistText,
  confidenceBadges,
  downloadUrl,
  durationText,
  eclipseKey,
  fieldWords,
  groupByDay,
  inEclipseView,
  manualChecklist,
  noteLines,
  rangeText,
  requestView,
  starViewCounts,
  starsLine,
  typeText,
  uncertaintyText,
  vsxClass,
  vsxHref,
  vsxLabel,
} from '@/scheduler/binaries'
import { check, eclipse, field, flagged, kit, star, submitted } from './fixtures/binaries'

describe('my discoveries helpers', () => {
  it('counts each group, a flagged star counts once however many flags it has', () => {
    const twice = flagged()
    twice.flags.push({ id: 'blend', label: 'Blended with a close star', why: 'x' })
    expect(starViewCounts([submitted(), star(), twice])).toEqual({
      '': 3,
      sub: 1,
      not: 2,
      flagged: 1,
    })
    expect(starViewCounts([])).toEqual({ '': 0, sub: 0, not: 0, flagged: 0 })
  })

  it('writes the section line with one or many stars', () => {
    expect(starsLine('All', 1)).toBe('All · 1 star · submitted first, then the rest')
    expect(starsLine('Submitted to VSX', 4)).toBe(
      'Submitted to VSX · 4 stars · submitted first, then the rest',
    )
  })

  it('has exactly two VSX states with their border class', () => {
    expect(vsxLabel(submitted())).toBe('Submitted to VSX')
    expect(vsxClass(submitted())).toBe('s-sub')
    expect(vsxLabel(star())).toBe('Not submitted yet')
    expect(vsxClass(star())).toBe('s-not')
  })

  it('links a VSX reference only when it is a web address', () => {
    expect(vsxHref(' https://vsx.example/1 ')).toBe('https://vsx.example/1')
    expect(vsxHref('12345')).toBe('')
    expect(vsxHref('javascript:alert(1)')).toBe('')
  })

  it('appends eclipsing binary to the type words, or to the bare type', () => {
    expect(typeText(star())).toBe('EA, oval orbit, eclipsing binary')
    expect(typeText(flagged())).toBe('EA, eclipsing binary')
  })

  it('turns notes into bullet lines without the typed bullet marks', () => {
    expect(noteLines('One.\n\n- Two.\r\n* Three.\n  • Four.  ')).toEqual([
      'One.',
      'Two.',
      'Three.',
      'Four.',
    ])
    expect(noteLines('')).toEqual([])
  })

  it('shows the confidence and a period badge only when the period is not settled', () => {
    expect(confidenceBadges(star())).toEqual([
      { text: 'Eclipsing binary: high confidence', tone: 'ok' },
    ])
    expect(confidenceBadges(flagged())).toEqual([
      { text: 'Eclipsing binary: medium confidence', tone: 'warn' },
      { text: 'Period: not settled', tone: 'warn' },
    ])
    expect(confidenceBadges(star({ confidence: '' }))).toEqual([])
  })
})

describe('eclipse planner helpers', () => {
  it('gives the timing uncertainty in minutes, and in hours from 90 minutes', () => {
    expect(uncertaintyText(0.2)).toBe('give or take 1 min')
    expect(uncertaintyText(8.4)).toBe('give or take 8 min')
    expect(uncertaintyText(89)).toBe('give or take 89 min')
    expect(uncertaintyText(90)).toBe('give or take 1.5 h')
    expect(uncertaintyText(120)).toBe('give or take 2 h')
  })

  it('says how long an eclipse lasts, or nothing when not measured', () => {
    expect(durationText(null)).toBe('')
    expect(durationText(0)).toBe('')
    expect(durationText(4.94)).toBe('lasts about 4.9 h')
    expect(durationText(12.4)).toBe('lasts about 12 h')
    expect(durationText(132)).toBe('lasts about 5.5 days')
  })

  it('groups eclipses by their day label in the order given', () => {
    const days = groupByDay([
      eclipse({ day_label: 'Sat Oct 17', mid: '1' }),
      eclipse({ day_label: 'Sat Oct 17', mid: '2' }),
      eclipse({ day_label: 'Sun Oct 18', mid: '3' }),
    ])
    expect(days.map((d) => [d.label, d.eclipses.map((e) => e.mid)])).toEqual([
      ['Sat Oct 17', ['1', '2']],
      ['Sun Oct 18', ['3']],
    ])
    expect(groupByDay([])).toEqual([])
  })

  it('maps each purpose to its chip, All keeps the ones for your own eclipse', () => {
    const own = eclipse({ purpose: 'own' })
    expect(inEclipseView(eclipse({ purpose: 'flag' }), 'flag')).toBe(true)
    expect(inEclipseView(eclipse({ purpose: 'period' }), 'flag')).toBe(false)
    expect(inEclipseView(own, 'flag')).toBe(false)
    expect(inEclipseView(own, 'period')).toBe(false)
    expect(inEclipseView(own, 'all')).toBe(true)
    expect(eclipseKey(own)).toBe('101|primary|2026-10-20T08:00:00Z')
  })

  it('describes each request state and what can be done next', () => {
    expect(requestView(null)).toMatchObject({ label: '', canRequest: true, canCancel: false })
    expect(requestView({ id: 1, state: 'waiting', note: '' })).toMatchObject({
      label: 'Requested',
      canRequest: false,
      canCancel: true,
    })
    expect(requestView({ id: 1, state: 'sent', note: 'n' })).toMatchObject({
      label: 'Sent to the scheduler',
      canCancel: true,
    })
    expect(requestView({ id: 1, state: 'done', note: '' })).toMatchObject({
      label: 'Window passed',
      canRequest: false,
      canCancel: false,
    })
    expect(requestView({ id: 1, state: 'failed', note: 'Made-up failure' })).toMatchObject({
      label: 'Request failed',
      tone: 'bad',
      note: 'Made-up failure',
      canRequest: true,
    })
  })

  it('writes the planner range in one year or across two', () => {
    expect(rangeText('2026-10-17T05:00:00Z', '2026-11-16T06:00:00Z')).toBe(
      'Sat Oct 17 to Mon Nov 16, 2026',
    )
    expect(rangeText('2026-12-20T12:00:00Z', '2027-01-19T12:00:00Z')).toBe(
      'Sun Dec 20, 2026 to Tue Jan 19, 2027',
    )
    expect(rangeText('', 'x')).toBe('')
  })
})

describe('VSX kit helpers', () => {
  it('counts the checklist items done, the app ones included', () => {
    expect(checklistText(kit().checklist)).toBe('2 of 3 done')
    expect(checklistText([])).toBe('0 of 0 done')
  })

  it('sends only the items you tick yourself', () => {
    expect(manualChecklist(kit().checklist)).toEqual({ name: false, upload: true })
    expect(manualChecklist([check({ auto: true })])).toEqual({})
  })

  it('names each missing value and copies only real ones', () => {
    expect(fieldWords(field())).toBe('')
    expect(fieldWords(field({ state: 'not_measured', value: '' }))).toBe('not measured yet')
    expect(fieldWords(field({ state: 'not_looked_up', value: '' }))).toBe('not looked up yet')
    expect(fieldWords(field({ state: 'empty', value: '' }))).toBe('leave empty')
    expect(fieldWords(field({ state: 'not_set', value: '' }))).toBe('not set yet')
    expect(canCopy(field())).toBe(true)
    expect(canCopy(field({ value: '' }))).toBe(false)
    expect(canCopy(field({ state: 'not_measured' }))).toBe(false)
  })

  it('gives file sizes in plain units', () => {
    expect(bytesText(0)).toBe('')
    expect(bytesText(512)).toBe('512 bytes')
    expect(bytesText(52000)).toBe('51 KB')
    expect(bytesText(3 * 1024 * 1024)).toBe('3 MB')
  })
})

describe('share picture helpers', () => {
  it('adds the download flag to the picture address', () => {
    expect(downloadUrl('/api/v1/discoveries/sources/5/share.jpg?v=3')).toBe(
      '/api/v1/discoveries/sources/5/share.jpg?v=3&download=1',
    )
    expect(downloadUrl('/x/share.jpg')).toBe('/x/share.jpg?download=1')
  })

  it('makes the picture address absolute for sharing', () => {
    expect(absoluteUrl('/api/v1/discoveries/sources/5/share.jpg?v=3', 'https://astro.example')).toBe(
      'https://astro.example/api/v1/discoveries/sources/5/share.jpg?v=3',
    )
    expect(absoluteUrl('https://other.example/a.jpg', 'https://astro.example')).toBe(
      'https://other.example/a.jpg',
    )
  })
})
