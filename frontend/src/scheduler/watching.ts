import type { DiscoverySource, DiscoveryWatch, WatchNight } from './api/discoveries'
import { shortNight } from './discoveryInbox'

/** isWatched says the source is in Watching now, with a watch the panel can show. */
export function isWatched(
  s: Pick<DiscoverySource, 'watching' | 'watch'>,
): s is { watching?: boolean; watch: DiscoveryWatch } {
  return !!s.watch && s.watch.ended === ''
}

function dayOf(at: string): string {
  return at.slice(0, 10)
}

/** watchedSince is the row's line on when watching started: "watched since Oct 19". */
export function watchedSince(w: Pick<DiscoveryWatch, 'started_at'>): string {
  return `watched since ${shortNight(dayOf(w.started_at))}`
}

/** nextText is the row's "Next:" line: imaging so far and the next survey check. */
export function nextText(
  w: Pick<DiscoveryWatch, 'imaging' | 'nights_imaged' | 'nights_planned' | 'next_survey_check'>,
): string {
  const parts: string[] = []
  if (w.imaging === 'asking') {
    parts.push(`field imaged on ${w.nights_imaged} of ${w.nights_planned} nights`)
  } else {
    parts.push('imaging requests stopped')
  }
  if (w.next_survey_check) parts.push(`weekly survey check ${shortNight(w.next_survey_check)}`)
  return `Next: ${parts.join(' · ')}`
}

/** confidenceText is the panel's pill: "Real · low confidence". */
export function confidenceText(w: Pick<DiscoveryWatch, 'confidence'>): string {
  return w.confidence ? `Real · ${w.confidence} confidence` : 'Real'
}

/** fadeText says how many fade nights are in and how many the move back needs. */
export function fadeText(w: Pick<DiscoveryWatch, 'fade_nights' | 'fade_nights_needed'>): string {
  if (w.fade_nights === null || w.fade_nights_needed === null)
    return 'Fade nights so far: not measured yet'
  return `Fade nights so far: ${w.fade_nights} of the ${w.fade_nights_needed} needed`
}

/** fadeShare is the progress bar's filled share, 0 to 1, or null when nothing is measured. */
export function fadeShare(
  w: Pick<DiscoveryWatch, 'fade_nights' | 'fade_nights_needed'>,
): number | null {
  if (w.fade_nights === null || w.fade_nights_needed === null || w.fade_nights_needed <= 0)
    return null
  return Math.min(1, Math.max(0, w.fade_nights / w.fade_nights_needed))
}

const SHORT_FILTERS: Record<string, string> = {
  luminance: 'L',
  red: 'R',
  green: 'G',
  blue: 'B',
}

/** askedText is a night's ask: "60 min L". */
export function askedText(n: Pick<WatchNight, 'asked_minutes' | 'filter'>): string {
  const f = SHORT_FILTERS[n.filter.toLowerCase()] ?? n.filter
  return f ? `${n.asked_minutes} min ${f}` : `${n.asked_minutes} min`
}

/** gotText is the exposure the night got, or a dash when none is measured. */
export function gotText(n: Pick<WatchNight, 'got_minutes'>): string {
  if (n.got_minutes === null) return '–'
  return `${Math.round(n.got_minutes)} min`
}

/** resultText is a night's outcome: the measurement when there is one, else where the ask stands. */
export function resultText(n: Pick<WatchNight, 'result' | 'state' | 'note'>): string {
  if (n.result === 'steady') return 'Steady'
  if (n.result === 'faded') return 'Faded'
  switch (n.state) {
    case 'waiting':
      return 'Waiting to send'
    case 'sent':
      return 'Sent to the scheduler'
    case 'cancelled':
      return 'Cancelled'
    case 'failed':
      return n.note ? `Could not send: ${n.note}` : 'Could not send'
  }
  return 'Not measured yet'
}

/** imagingText says why imaging requests stopped, or nothing while they go on. */
export function imagingText(w: Pick<DiscoveryWatch, 'imaging' | 'imaging_stopped_at'>): string {
  const on = w.imaging_stopped_at ? ` on ${shortNight(dayOf(w.imaging_stopped_at))}` : ''
  switch (w.imaging) {
    case 'stopped_quiet':
      return `Imaging requests stopped${on}: 90 days passed with no new fade. It stays here until you mark it.`
    case 'stopped_user':
      return `You stopped the imaging requests${on}. It stays here until you mark it.`
  }
  return ''
}
