import { ApiError } from './api/client'
import type { Asteroid, AsteroidSourceInfo, AsteroidView, HorizonsInfo } from './api/asteroids'
import type { EmptyState } from './comets'
import { clock, shortDate } from './format'

export function sortAsteroids<T extends Pick<Asteroid, 'name' | 'magnitude'>>(
  list: readonly T[],
): T[] {
  const mag = (a: T) =>
    typeof a.magnitude === 'number' && Number.isFinite(a.magnitude) ? a.magnitude : null
  return [...list].sort((a, b) => {
    const ma = mag(a)
    const mb = mag(b)
    if (ma === null && mb === null) return a.name.localeCompare(b.name)
    if (ma === null) return 1
    if (mb === null) return -1
    return ma - mb || a.name.localeCompare(b.name)
  })
}

export function asteroidEmptyState(err: unknown, view: AsteroidView | null): EmptyState | null {
  if (err) {
    if (err instanceof ApiError && err.status === 404)
      return {
        title: 'No asteroid list on this stacker yet',
        text: 'The stacker does not serve /api/v1/asteroids. It comes with a newer astro-stacker release.',
      }
    if (err instanceof ApiError && err.status === 503)
      return {
        title: 'The asteroid list is not available',
        text: `The stacker says: ${err.message}.`,
      }
    const msg = err instanceof Error ? err.message : String(err)
    return { title: 'Could not load the asteroid list', text: msg }
  }
  if (view && !(view.asteroids ?? []).length)
    return {
      title: 'No asteroids tonight',
      text: `No asteroid brighter than V ${view.max_magnitude} gets above ${view.min_altitude}° in darkness tonight.`,
    }
  return null
}

export function asteroidSubTitle(
  a: Pick<Asteroid, 'name' | 'designation' | 'delta_au' | 'r_au'>,
): string {
  const parts = [`${a.delta_au.toFixed(2)} au from Earth`, `${a.r_au.toFixed(2)} au from the Sun`]
  if (a.designation && a.designation !== a.name && !a.name.startsWith(`${a.designation} `))
    parts.unshift(a.designation)
  return parts.join(' · ')
}

export function positionSource(a: Pick<Asteroid, 'position_source'>): {
  label: string
  title: string
} {
  return a.position_source === 'horizons'
    ? { label: 'Horizons', title: 'Position and motion from JPL Horizons' }
    : { label: 'two-body', title: 'Position and motion from a two-body orbit on JPL SBDB elements' }
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

export function fetchedText(label: string, info: AsteroidSourceInfo): string {
  const from = info.source ? ` from ${sourceHost(info.source)}` : ''
  const when = info.fetched_at
    ? `fetched ${shortDate(info.fetched_at)} ${clock(info.fetched_at)}`
    : 'not fetched yet'
  return `${label}${from}, ${info.asteroids.toLocaleString('en-US')} asteroids, ${when}`
}

export function horizonsText(h: HorizonsInfo | null | undefined): string {
  if (!h) return ''
  const parts = [
    `JPL Horizons: ${h.checked} ${h.checked === 1 ? 'asteroid' : 'asteroids'} checked for tonight`,
  ]
  if (h.failed) parts.push(`${h.failed} failed`)
  if (h.pending) parts.push(`${h.pending} still pending`)
  return parts.join(', ')
}
