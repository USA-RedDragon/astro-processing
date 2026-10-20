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
  daysText,
  inOtherView,
  otherHeadline,
  otherVetText,
} from '@/scheduler/binaries'
import {
  check,
  eclipse,
  field,
  flagged,
  kit,
  other,
  star,
  starTypes,
  submitted,
} from './fixtures/binaries'

describe('my discoveries helpers', () => {
  it('counts each group, a flagged star counts once however many flags it has', () => {
    const twice = flagged()
    twice.flags.push({ id: 'blend', label: 'Blended with a close star', why: 'x' })
    const timed = star({ timing: { count: 4, text: 'x', flags: ['Period changing'] } })
    expect(starViewCounts([submitted(), star(), twice, timed])).toEqual({
      '': 4,
      sub: 1,
      not: 3,
      flagged: 1,
      timed: 1,
      untimed: 3,
      trend: 1,
    })
    expect(starViewCounts([])).toEqual({
      '': 0,
      sub: 0,
      not: 0,
      flagged: 0,
      timed: 0,
      untimed: 0,
      trend: 0,
    })
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
    expect(requestView({ id: 1, state: 'waiting', note: '', auto: false })).toMatchObject({
      label: 'Requested',
      canRequest: false,
      canCancel: true,
    })
    expect(requestView({ id: 1, state: 'sent', note: 'n', auto: false })).toMatchObject({
      label: 'Sent to the scheduler',
      canCancel: true,
    })
    expect(requestView({ id: 1, state: 'done', note: '', auto: false })).toMatchObject({
      label: 'Window passed',
      canRequest: false,
      canCancel: false,
    })
    expect(
      requestView({ id: 1, state: 'failed', note: 'Made-up failure', auto: false }),
    ).toMatchObject({
      label: 'Request failed',
      tone: 'bad',
      note: 'Made-up failure',
      canRequest: true,
    })
    expect(requestView({ id: 1, state: 'cancelled', note: '', auto: true })).toMatchObject({
      label: 'Cancelled',
      by: 'Asked by the app',
      canRequest: true,
      canCancel: false,
    })
    expect(requestView({ id: 1, state: 'moved', note: '', auto: false })).toMatchObject({
      label: 'Moved to the new eclipse time',
      canRequest: true,
      canCancel: false,
    })
  })

  it('marks requests the app made so they can still be cancelled', () => {
    expect(requestView({ id: 2, state: 'waiting', note: '', auto: true })).toMatchObject({
      label: 'Requested',
      by: 'Asked by the app',
      canCancel: true,
    })
    expect(requestView({ id: 2, state: 'sent', note: '', auto: false }).by).toBe('')
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
    expect(
      absoluteUrl('/api/v1/discoveries/sources/5/share.jpg?v=3', 'https://astro.example'),
    ).toBe('https://astro.example/api/v1/discoveries/sources/5/share.jpg?v=3')
    expect(absoluteUrl('https://other.example/a.jpg', 'https://astro.example')).toBe(
      'https://other.example/a.jpg',
    )
  })
})

describe('other confirmed star helpers', () => {
  it('words the kind line from the star type and the vet', () => {
    expect(otherHeadline(other())).toBe('Spotted star: rotates every 4.32 days')
    expect(otherHeadline(other({ star_type: null }))).toBe('Repeats every 4.32 days')
    expect(
      otherHeadline(other({ star_type: starTypes[1]!, period: 9.3564, period_text: '9.3564' })),
    ).toBe('Dipper: dips recur every 9.36 days')
    expect(
      otherHeadline(
        other({ star_type: null, period: 0, vet_line: 'Fades now and then', vet_kind: 'fades' }),
      ),
    ).toBe('Fades now and then')
    expect(otherHeadline(other({ star_type: null, period: 0, vet_line: '' }))).toBe('Variable star')
    expect(daysText(0.4988)).toBe('0.499')
    expect(daysText(0)).toBe('')
  })

  it('says what the vet thinks and filters by VSX state only', () => {
    expect(otherVetText(other())).toBe('medium confidence')
    expect(
      otherVetText(other({ period: 0, vet_line: 'Fades now and then', confidence: 'low' })),
    ).toBe('Fades now and then, low confidence')
    expect(otherVetText(other({ waiting: 'Made-up wait.' }))).toBe('Made-up wait.')
    expect(inOtherView(other(), '')).toBe(true)
    expect(inOtherView(other(), 'not')).toBe(true)
    expect(inOtherView(other(), 'sub')).toBe(false)
    expect(inOtherView(other(), 'timed')).toBe(false)
  })
})
