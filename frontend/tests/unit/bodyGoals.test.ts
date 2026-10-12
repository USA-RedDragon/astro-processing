import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import {
  bodyFill,
  bodyNightsSummary,
  bodyTonightText,
  bodyValue,
  bodyValueTitle,
  nightCellText,
  nightCellTitle,
  nightRows,
  nightsImaged,
} from '@/scheduler/bodyGoals'
import { filterHeadline, type BodyNightView, type BodyStatus, type FilterGoal } from '@/scheduler/api/planning'
import BodyNightsCard from '@/scheduler/components/BodyNightsCard.vue'

function night(n: string, extra: Partial<BodyNightView> = {}): BodyNightView {
  return {
    night: n,
    subs: 30,
    effectiveHours: 0.4,
    snr: 6,
    progress: 0.36,
    done: false,
    plateau: false,
    saturated: false,
    trailShort: false,
    ...extra,
  }
}

function body(extra: Partial<BodyStatus>): BodyStatus {
  return {
    kind: 'comet',
    measure: '',
    goal: 10,
    tonight: '2026-10-12',
    tonightSubs: 0,
    nights: [],
    done: false,
    minTrailPx: 12,
    ...extra,
  }
}

function fg(filter: string, b: BodyStatus, extra: Partial<FilterGoal> = {}): FilterGoal {
  return {
    filter,
    stackFilter: filter,
    goal: null,
    goalSet: true,
    defaultGoal: { kind: 'snr', snr: 10, depth: 25.8, plateauStop: true } as FilterGoal['defaultGoal'],
    measured: false,
    status: 'no-master',
    percentComplete: 0,
    completionBasis: '',
    accepted: 0,
    desired: 0,
    acceptedHours: 0,
    enough: false,
    goalProgress: null,
    body: b,
    ...extra,
  }
}

describe('comet goal text', () => {
  it('says when tonight has no subs or no stack yet', () => {
    expect(bodyTonightText(fg('Luminance', body({})))).toBe('Tonight: no subs yet')
    expect(bodyTonightText(fg('Luminance', body({ tonightSubs: 1 })))).toBe(
      "Tonight: 1 sub, measured once tonight's comet-aligned stack is built",
    )
    expect(
      bodyTonightText(
        fg('Luminance', body({ tonightSubs: 6, current: night('2026-10-12', { snr: null, note: '6 subs that night; 8 are needed to measure' }) })),
      ),
    ).toBe('Tonight: 6 subs that night; 8 are needed to measure')
  })

  it("shows tonight's coma SNR against the goal", () => {
    const tonight = night('2026-10-12', { snr: 7.26, headSnr: 12.1, tailSnr: 2.4 })
    const g = fg('Luminance', body({ current: tonight, nights: [tonight] }), { progress: { progress: 0.53 } as FilterGoal['progress'] })
    expect(bodyTonightText(g)).toBe('Tonight: coma SNR 7.3 of 10')
    expect(filterHeadline(g)).toBe('Tonight: coma SNR 7.3 of 10')
    expect(bodyValue(g)).toBe('SNR 7.3')
    expect(bodyValueTitle(g)).toBe('Head 12.1, inner tail 2.4; the SNR is their mean')
    expect(bodyFill(g)).toBe('53%')
    const met = night('2026-10-12', { snr: 11, done: true })
    expect(bodyTonightText(fg('Luminance', body({ current: met })))).toBe('Tonight: coma SNR 11.0 of 10 · goal met for tonight')
    expect(bodyFill(fg('Luminance', body({ current: met }), { enough: true }))).toBe('100%')
    const flat = night('2026-10-12', { snr: 4, plateau: true, done: true, progress: 0.16 })
    expect(bodyTonightText(fg('Luminance', body({ current: flat })))).toBe(
      'Tonight: coma SNR 4.0 of 10 · no longer improving tonight',
    )
  })
})

describe('asteroid goal text', () => {
  it('is done for good after one good night', () => {
    const good = night('2026-10-11', { snr: 63.2, done: true, trailPx: 30 })
    const b = body({ kind: 'asteroid', goal: 50, done: true, doneNight: '2026-10-11', nights: [good] })
    expect(bodyTonightText(fg('Red', b))).toBe('SNR 63.2 of 50, done on the night of 2026-10-11')
    expect(bodyValue(fg('Red', b))).toBe('SNR 63.2')
    expect(bodyFill(fg('Red', b))).toBe('100%')
  })

  it('says when the trail is still short or the asteroid saturates', () => {
    const short = night('2026-10-12', { snr: 80, trailShort: true, trailPx: 5.4, progress: 0.999 })
    expect(bodyTonightText(fg('Red', body({ kind: 'asteroid', goal: 50, current: short })))).toBe(
      'Tonight: SNR 80.0 of 50 · trail 5 of 12 pixels so far',
    )
    const sat = night('2026-10-12', { snr: null, saturated: true, done: true })
    const b = body({ kind: 'asteroid', goal: 50, done: true, doneNight: '2026-10-12', nights: [sat] })
    expect(bodyTonightText(fg('Red', b))).toBe(
      'Done on the night of 2026-10-12: the asteroid saturates, so it is brighter than the goal needs',
    )
    expect(bodyValue(fg('Red', b))).toBe('saturated')
  })
})

describe('nights imaged', () => {
  const l = fg('Luminance', body({ nights: [night('2026-10-10', { done: true, snr: 12 }), night('2026-10-12')] }))
  const r = fg('Red', body({ nights: [night('2026-10-11', { snr: null, note: 'the body was outside the target\'s reference frame that night', subs: 20 })] }))

  it('lists every night newest first with a cell per filter', () => {
    const rows = nightRows([l, r])
    expect(rows.map((x) => x.night)).toEqual(['2026-10-12', '2026-10-11', '2026-10-10'])
    expect(rows[0].tonight).toBe(true)
    expect(rows[0].cells.map((c) => nightCellText(c.night, 'comet'))).toEqual(['SNR 6.0', 'not imaged'])
    expect(nightCellText(rows[2].cells[0].night, 'comet')).toBe('SNR 12.0, goal met')
    expect(nightCellText(rows[1].cells[1].night, 'comet')).toBe('not measured')
    expect(nightCellTitle(rows[1].cells[1].night)).toBe("20 subs · the body was outside the target's reference frame that night")
    expect(nightsImaged([l, r])).toBe(3)
    expect(bodyNightsSummary([l, r], 'comet')).toBe('3 nights imaged so far.')
  })

  it('names the asteroid filters still waiting for a good night', () => {
    const a = fg('Red', body({ kind: 'asteroid', done: true, nights: [night('2026-10-11')] }))
    const b = fg('Blue', body({ kind: 'asteroid', nights: [night('2026-10-11')] }))
    expect(bodyNightsSummary([a, b], 'asteroid')).toBe('1 night imaged. Still needs a good night in Blue.')
    expect(bodyNightsSummary([a], 'asteroid')).toBe('Done: every filter had its good night. 1 night imaged.')
  })
})

describe('BodyNightsCard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the nights and each night image', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return new Response(
          JSON.stringify([{ filter: 'Luminance', night: '2026-10-12', subs: 30, previewUrl: 'https://img/l.jpg', masterUrl: 'https://img/l.fit' }]),
          { status: 200 },
        )
      }),
    )
    const goals = [fg('Luminance', body({ nights: [night('2026-10-12')] }))]
    const el = document.createElement('div')
    const app = createApp({ render: () => h(BodyNightsCard, { kind: 'comet', goals, objects: ['161P/Hartley-IRAS', 'Hartley 2'] }) })
    app.mount(el)
    for (let i = 0; i < 6; i++) {
      await nextTick()
      await new Promise((r) => setTimeout(r, 0))
    }
    expect(urls[0]).toBe('/api/v1/body-nights?object=161P%2FHartley-IRAS&object=Hartley%202')
    expect(el.querySelector('[data-testid="body-nights"]')?.textContent).toContain('2026-10-12 · tonight')
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://img/l.jpg')
    expect(el.textContent).toContain('1 night imaged so far.')
    app.unmount()
  })
})
