import { describe, expect, it } from 'vitest'
import { halphaSource, rigFrame, rigSource, skySource, type Rig } from '@/scheduler/api/discover'

const rig: Rig = {
  focalLength: 540,
  pixelSize: 3.76,
  widthPx: 6248,
  heightPx: 4176,
  scale: 1.436,
  widthDeg: 2.49,
  heightDeg: 1.67,
  colour: false,
  filters: ['L', 'H'],
  typicalHfr: 2.1,
  typicalGuideRms: 0.6,
  exposures: {},
  basis: {
    source: 'fits-headers',
    frames: 120,
    from: '2026-08-01T00:00:00Z',
    to: '2026-10-01T00:00:00Z',
    camera: 'ZWO ASI2600MM Pro',
    telescope: null,
    guideFrames: 100,
    hfrFrames: 110,
  },
}

describe('discover sources', () => {
  it('reads the frame only when the rig knows it', () => {
    expect(rigFrame(rig)).toEqual({ w: 2.49, h: 1.67 })
    expect(rigFrame({ ...rig, widthDeg: null })).toBeNull()
    expect(rigFrame(null)).toBeNull()
  })

  it('says where the rig comes from', () => {
    expect(rigSource(rig)).toContain('120 light frames')
    expect(rigSource(rig)).toContain('ZWO ASI2600MM Pro')
    expect(rigSource(null)).toContain('Rig unknown')
  })

  it('never guesses the sky', () => {
    const measured = {
      source: 'measured' as const,
      method: 'median background',
      filter: 'L, R',
      band: 'Gaia G',
      nights: 2,
      frames: 19,
      from: '2026-01-10',
      to: '2026-09-02',
      perNight: [
        { night: '2026-09-02', mag: 20.81, frames: 6, filter: 'R' },
        { night: '2026-01-10', mag: 20.69, frames: 13, filter: 'L' },
      ],
      reason: null,
    }
    expect(skySource(null, null)).toContain('not measured yet')
    expect(
      skySource(null, {
        ...measured,
        source: 'none',
        method: null,
        perNight: [],
        reason: 'no masters',
      }),
    ).toBe('Sky brightness not measured yet: no masters.')
    const m = skySource(20.8, measured)
    expect(m).toContain(
      '20.80 Gaia G mag/arcsec², measured from L, R subs: 19 frames over 2 nights',
    )
    expect(m).toContain('2026-09-02 20.81 (6 R), 2026-01-10 20.69 (13 L)')
    expect(m).toContain('Method: median background.')
    expect(m).not.toContain('Stale')
    expect(skySource(20.8, { ...measured, stale: true, error: 'db down' })).toContain(
      'Stale: db down.',
    )
    const set = skySource(21.2, {
      ...measured,
      source: 'config',
      method: 'set in discover.sky-brightness',
      perNight: [],
    })
    expect(set).toContain('set in discover.sky-brightness, not measured')
    expect(set).not.toContain('measured from')
  })

  it('describes the H-alpha map state', () => {
    expect(halphaSource(null)).toContain('unknown')
    expect(
      halphaSource({ state: 'failed', source: null, fetchedAt: null, error: 'timeout' }),
    ).toContain('timeout')
  })
})
