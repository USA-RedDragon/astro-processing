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
    expect(skySource(null, null)).toBe('Sky brightness not measured yet.')
    expect(
      skySource(20.8, {
        source: 'measured',
        method: 'median background',
        filter: 'L',
        nights: 3,
        frames: 40,
        from: null,
        to: null,
        perNight: [],
        reason: null,
      }),
    ).toContain('20.80 mag/arcsec², measured from L masters (median background), 40 frames over 3 nights')
  })

  it('describes the H-alpha map state', () => {
    expect(halphaSource(null)).toContain('unknown')
    expect(
      halphaSource({ state: 'failed', source: null, fetchedAt: null, error: 'timeout' }),
    ).toContain('timeout')
  })
})
