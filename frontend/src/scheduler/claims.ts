import type {
  ClaimCheck,
  ClaimRecord,
  ClaimSource,
  Claims,
  Mention,
  StarClaims,
} from './api/claims'
import { SITE_TZ, toDate } from './format'

type When = string | number | Date | null | undefined

const dayTimeFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SITE_TZ,
  timeZoneName: 'short',
})
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SITE_TZ,
  timeZoneName: 'short',
})
const dayFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: SITE_TZ,
})
const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: SITE_TZ,
})
const ymdFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: SITE_TZ,
})

/** Weekday, date and time in US Central, "Sun, Oct 25, 3:10 AM CDT". */
export function dayTime(v: When): string {
  const d = toDate(v)
  return d ? dayTimeFmt.format(d) : ''
}

/** Date and time in US Central, "Oct 20, 7:12 PM CDT". */
export function dateTime(v: When): string {
  const d = toDate(v)
  return d ? dateTimeFmt.format(d) : ''
}

/** Weekday and date in US Central, "Sun, Nov 1". */
export function day(v: When): string {
  const d = toDate(v)
  return d ? dayFmt.format(d) : ''
}

/** Date in US Central, "Oct 23, 2026". */
export function date(v: When): string {
  const d = toDate(v)
  return d ? dateFmt.format(d) : ''
}

function centralDay(d: Date): number {
  const [y, m, dd] = ymdFmt.format(d).split('-').map(Number)
  return Date.UTC(y!, m! - 1, dd!) / 86400000
}

/** Whole US Central calendar days from a to b. */
export function daysBetween(a: When, b: When): number | null {
  const x = toDate(a)
  const y = toDate(b)
  if (!x || !y) return null
  return centralDay(y) - centralDay(x)
}

/** Whether the mention still asks for the user's attention. */
export function isOpenNew(m: Mention): boolean {
  return m.status === 'new' && m.mark === ''
}

export interface Tone {
  text: string
  tone: 'bad' | 'info' | 'warn' | 'ok'
}

/** The pill for a mention. */
export function mentionPill(m: Mention): Tone {
  if (m.mark === 'own') return { text: 'Your own entry', tone: 'ok' }
  if (m.mark === 'citing') return { text: 'Cites your work', tone: 'ok' }
  switch (m.status) {
    case 'new':
      return { text: 'New since your record', tone: m.mark === 'seen' ? 'warn' : 'bad' }
    case 'first_check_after_record':
      return { text: 'Already listed at the first check, dated after your record', tone: 'warn' }
    default:
      return { text: 'Known before your record', tone: 'info' }
  }
}

/** The mark the user set, in words, or "". */
export function markText(m: Mention): string {
  if (m.mark === 'seen') return 'You marked this as seen.'
  if (m.mark === 'citing') return 'You marked this as citing your work.'
  return ''
}

/** The headline after the pill: "VSX, entry dated Oct 23, 2026" or "VizieR, title". */
export function mentionHead(m: Mention): string {
  const parts = [m.title]
  if (m.dated) parts.push(`dated ${date(m.dated)}`)
  return parts.filter(Boolean).join(', ')
}

/** How the mention's date sits next to the user's record, or "". */
export function againstRecord(m: Mention, record: ClaimRecord | null): string {
  if (!record || m.mark === 'own') return ''
  if (m.status !== 'new' && m.status !== 'first_check_after_record') return ''
  const when = m.dated ?? m.first_seen
  const n = daysBetween(record.published, when)
  const rec = `Your ${record.name} record is dated ${date(record.published)}`
  if (n === null) return rec + '.'
  const what = m.dated ? 'this' : 'the app first saw this'
  if (n > 0) return `${rec}, ${n} ${n === 1 ? 'day' : 'days'} before ${what}.`
  if (n === 0) return `${rec}, the same day as ${what}.`
  return `${rec}, ${-n} ${n === -1 ? 'day' : 'days'} after ${what}.`
}

/** The Result cell of the per-source table. */
export function checkResult(c: ClaimCheck | undefined): Tone | { text: string; tone: '' } {
  if (!c) return { text: 'not checked yet', tone: '' }
  if (c.state === 'failed') return { text: 'could not check', tone: 'warn' }
  if (c.state === 'not_checked') return { text: c.note || 'not checked', tone: '' }
  const bits: string[] = []
  if (c.new) bits.push(`${c.new} new`)
  if (c.known) bits.push(`${c.known} known`)
  if (!bits.length) return { text: 'none', tone: '' }
  return { text: bits.join(', '), tone: c.new ? 'bad' : 'info' }
}

export interface CheckRow {
  source: ClaimSource
  check: ClaimCheck | undefined
}

/** The per-source rows of a star, in the order the API lists the sources. */
export function checkRows(sources: ClaimSource[], star: StarClaims): CheckRow[] {
  return sources.map((source) => ({
    source,
    check: star.checks.find((c) => c.where === source.where),
  }))
}

/** New mentions on a star the user has not marked. */
export function openNew(star: StarClaims | undefined): number {
  return star ? star.mentions.filter(isOpenNew).length : 0
}

/** The chip count, "2 new" or "none new". */
export function chipText(c: Claims): string {
  const n = totalOpenNew(c)
  return n ? `${n} new` : 'none new'
}

/** Open new mentions across all stars. */
export function totalOpenNew(c: Claims): number {
  return c.per_star.reduce((a, s) => a + openNew(s), 0)
}

/** The last-checked words for the strip. */
export function lastCheckedText(c: Claims): string {
  if (c.running) return 'checking now'
  return c.last_checked ? `last checked ${dayTime(c.last_checked)}` : 'not checked yet'
}

/** The next-check words for the strip, or "". */
export function nextCheckText(c: Claims): string {
  return c.next_check ? `next check ${day(c.next_check)}` : ''
}

/** The record words for the strip. */
export function recordText(r: ClaimRecord | null): string {
  return r ? `${r.name}, published ${dateTime(r.published)}` : 'no dated record yet'
}

/** Mentions sorted for the box: open new first, then by date, newest first. */
export function sortedMentions(ms: Mention[]): Mention[] {
  const rank = (m: Mention) =>
    isOpenNew(m) ? 0 : m.status === 'new' ? 1 : m.status === 'first_check_after_record' ? 2 : 3
  const t = (m: Mention) => toDate(m.dated ?? m.first_seen)?.getTime() ?? 0
  return [...ms].sort((a, b) => rank(a) - rank(b) || t(b) - t(a) || a.id - b.id)
}
