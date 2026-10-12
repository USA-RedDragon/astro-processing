import { describe, expect, it } from 'vitest'
import { ApiError } from '@/scheduler/api/client'
import type { Asteroid, AsteroidView } from '@/scheduler/api/asteroids'
import {
  asteroidEmptyState,
  asteroidSubTitle,
  fetchedText,
  horizonsText,
  positionSource,
  sortAsteroids,
  sourceHost,
} from '@/scheduler/asteroids'

function asteroid(name: string, designation: string, magnitude: number | null): Asteroid {
  return {
    name,
    designation,
    number: null,
    full_name: name,
    kind: 'asteroid',
    horizons_command: designation + ';',
    h: 5,
    g: 0.15,
    magnitude,
    magnitude_source: 'two-body',
    position_source: 'two-body',
    neo: false,
    r_au: 2.91,
    delta_au: 2.4,
    phase_angle: 18,
    ra: 110,
    dec: 23,
    rate_arcsec_per_min: 0.58,
    window: { hours: 0, start: null, end: null, peak_alt: 0, peak_at: null },
  }
}

function view(list: Asteroid[]): AsteroidView {
  return {
    computed_at: '2026-10-12T20:00:00Z',
    night: { start: '2026-10-12T23:00:00Z' },
    min_altitude: 30,
    max_magnitude: 12,
    elements: {
      source: 'https://ssd-api.jpl.nasa.gov/sbdb_query.api',
      fetched_at: null,
      asteroids: 13737,
    },
    close_approaches: {
      source: 'https://ssd-api.jpl.nasa.gov/cad.api',
      fetched_at: null,
      asteroids: 18,
    },
    basis: '',
    asteroids: list,
  }
}

describe('sortAsteroids', () => {
  it('puts the brightest first and unknown magnitudes last', () => {
    const out = sortAsteroids([
      asteroid('7 Iris', '7', 9.1),
      asteroid('2026 TC6', '2026 TC6', null),
      asteroid('1 Ceres', '1', 8.5),
    ])
    expect(out.map((a) => a.name)).toEqual(['1 Ceres', '7 Iris', '2026 TC6'])
  })
})

describe('asteroidEmptyState', () => {
  it('says the stacker is too old on 404', () => {
    expect(asteroidEmptyState(new ApiError(404, 'not found', null), null)?.title).toBe(
      'No asteroid list on this stacker yet',
    )
  })

  it('passes the stacker reason on 503', () => {
    const s = asteroidEmptyState(new ApiError(503, 'no site configured', null), null)
    expect(s?.title).toBe('The asteroid list is not available')
    expect(s?.text).toContain('no site configured')
  })

  it('shows other errors as they are', () => {
    expect(asteroidEmptyState(new Error('boom'), null)).toEqual({
      title: 'Could not load the asteroid list',
      text: 'boom',
    })
  })

  it('names the limits when nothing is up', () => {
    expect(asteroidEmptyState(null, view([]))).toEqual({
      title: 'No asteroids tonight',
      text: 'No asteroid brighter than V 12 gets above 30° in darkness tonight.',
    })
    expect(asteroidEmptyState(null, { ...view([]), asteroids: null })?.title).toBe(
      'No asteroids tonight',
    )
    expect(asteroidEmptyState(null, view([asteroid('1 Ceres', '1', 8.5)]))).toBeNull()
  })
})

describe('asteroidSubTitle', () => {
  it('shows the designation only when the name does not already hold it', () => {
    expect(asteroidSubTitle(asteroid('1 Ceres', '1', 8.5))).toBe(
      '2.40 au from Earth · 2.91 au from the Sun',
    )
    expect(asteroidSubTitle(asteroid('Ceres', '1', 8.5))).toBe(
      '1 · 2.40 au from Earth · 2.91 au from the Sun',
    )
    expect(asteroidSubTitle(asteroid('2026 TC6', '2026 TC6', 11))).toBe(
      '2.40 au from Earth · 2.91 au from the Sun',
    )
  })
})

describe('positionSource', () => {
  it('names Horizons or the two-body orbit', () => {
    expect(positionSource({ position_source: 'horizons' }).label).toBe('Horizons')
    expect(positionSource({ position_source: 'two-body' }).label).toBe('two-body')
  })
})

describe('fetchedText', () => {
  it('names the host, count and fetch time', () => {
    expect(sourceHost('https://ssd-api.jpl.nasa.gov/sbdb_query.api')).toBe('ssd-api.jpl.nasa.gov')
    expect(sourceHost('JPL')).toBe('JPL')
    const v = view([])
    expect(fetchedText('Elements', v.elements)).toBe(
      'Elements from ssd-api.jpl.nasa.gov, 13,737 asteroids, not fetched yet',
    )
    expect(
      fetchedText('Close approaches', {
        ...v.close_approaches,
        fetched_at: '2026-10-12T15:00:00Z',
      }),
    ).toMatch(/^Close approaches from ssd-api\.jpl\.nasa\.gov, 18 asteroids, fetched .+ 10:00 CDT$/)
  })
})

describe('horizonsText', () => {
  it('counts the checks and names failures and pending ones', () => {
    expect(horizonsText(undefined)).toBe('')
    expect(horizonsText({ checked: 6, failed: 0, pending: 0, errors: [] })).toBe(
      'JPL Horizons: 6 asteroids checked for tonight',
    )
    expect(horizonsText({ checked: 1, failed: 1, pending: 2, errors: ['timeout'] })).toBe(
      'JPL Horizons: 1 asteroid checked for tonight, 1 failed, 2 still pending',
    )
  })
})
