import { describe, expect, it } from 'vitest'
import { decText, mosaicFlag, raText } from '@/scheduler/api/discover'

describe('sexagesimal coordinates', () => {
  it('carries rounded seconds and arcminutes into the next unit', () => {
    expect(raText(83.99999)).toBe('05h 36m 00s')
    expect(raText(359.99999)).toBe('00h 00m 00s')
    expect(decText(22.9999)).toBe('+23° 00′')
    expect(decText(-5.9999)).toBe('−06° 00′')
  })

  it('formats ordinary values', () => {
    expect(raText(83.82083)).toBe('05h 35m 17s')
    expect(decText(-5.39)).toBe('−05° 23′')
  })
})

describe('finder mosaic flag', () => {
  it('flags only mosaics that need more than one season', () => {
    expect(mosaicFlag({ hours: 400, nights: 200, seasons: 4, text: '' })).toBe(
      'more than one season: 4 seasons at your pace',
    )
    expect(mosaicFlag({ hours: 20, nights: 10, seasons: 1, text: '' })).toBe('')
    expect(mosaicFlag({ hours: 20, nights: null, seasons: null, text: '' })).toBe('')
    expect(mosaicFlag(null)).toBe('')
  })
})
