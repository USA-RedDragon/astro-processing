import { describe, expect, it } from 'vitest'
import type { MoonNight, PlanBlock, Preview, SchedProject } from '@/scheduler/api/scheduler'
import type { Snapshot } from '@/scheduler/api/planning'
import { flatsPlan, flatsTile, moonTile, moonUpSpans, mosaicTile } from '@/scheduler/tonightTiles'

const t = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 11, h, m)).toISOString()
const at = (h: number, m = 0) => Date.UTC(2026, 9, 11, h, m)

function block(
  h0: number,
  h1: number,
  project: number,
  target: number,
  filter: string,
  exposure = 300,
): PlanBlock {
  return {
    start: t(h0),
    end: t(h1),
    wait: false,
    project_id: project,
    project_name: 'P' + project,
    target_id: target,
    target_name: 'T' + target,
    filter,
    exposure_seconds: exposure,
    count: 1,
    picked: true,
  }
}

const moon: MoonNight = {
  samples: [
    { t: t(1), alt: 10 },
    { t: t(4), alt: -5 },
    { t: t(10), alt: 5 },
  ],
  illumination: 0.42,
  age: 21,
  waxing: false,
  rises: [t(9)],
  sets: [t(3)],
  next_new: t(200),
  next_full: t(600),
}

describe('moon tile', () => {
  it('finds when the moon is up from rise and set', () => {
    expect(moonUpSpans(moon, at(1), at(11))).toEqual([
      [at(1), at(3)],
      [at(9), at(11)],
    ])
    expect(moonUpSpans({ ...moon, rises: [], sets: [] }, at(1), at(11))).toEqual([[at(1), at(11)]])
    expect(
      moonUpSpans({ ...moon, rises: [], sets: [], samples: [{ t: t(2), alt: -3 }] }, at(1), at(11)),
    ).toEqual([])
  })

  it('names the phase, rise and set, and the moon-up hours of the plan', () => {
    const p: Preview = { blocks: [block(2, 4, 1, 1, 'Red'), block(8, 10, 1, 1, 'Red')] }
    const tile = moonTile(moon, p, [at(1), at(11)])
    expect(tile.value).toBe('42% lit')
    expect(tile.note).toBe(
      'waning gibbous · sets 22:00 CDT, rises 04:00 CDT · up for 2 h of 4 h planned: 21:00–22:00, 04:00–05:00',
    )
    expect(moonTile(moon, { blocks: [block(4, 8, 1, 1, 'Red')] }, [at(1), at(11)]).note).toContain(
      'down for all planned imaging',
    )
    expect(moonTile(null, p, null, 'boom')).toEqual({
      label: 'Moon',
      value: 'Not available',
      note: 'boom',
    })
  })
})

const projects: SchedProject[] = [
  {
    id: 1,
    guid: null,
    name: 'Sadr Region',
    state: 1,
    priority: 1,
    minimumtime: 30,
    isMosaic: true,
    targets: [1, 2, 3, 4].map((id) => ({
      id,
      guid: null,
      name: 'Panel ' + id,
      active: id !== 4,
      ra: null,
      dec: null,
      rotation: 0,
      plans: [],
    })),
  },
  {
    id: 2,
    guid: null,
    name: 'M 31',
    state: 1,
    priority: 1,
    minimumtime: 30,
    isMosaic: false,
    targets: [],
  },
]

describe('mosaic tile', () => {
  it('sums the mosaic panel time per mosaic and counts the panels covered', () => {
    const p: Preview = {
      blocks: [
        block(2, 3, 1, 1, 'Red'),
        block(3, 4, 1, 2, 'Red'),
        block(4, 5, 2, 9, 'Red'),
        { start: t(5), end: t(6), wait: true },
        block(6, 7, 1, 1, 'Green'),
      ],
    }
    expect(mosaicTile(p, projects)).toEqual({
      label: 'Mosaic time',
      value: '3 h',
      note: 'Sadr Region 3 h, 2 of 3 panels',
    })
    expect(mosaicTile({ blocks: [block(4, 5, 2, 9, 'Red')] }, projects).value).toBe('None')
    expect(mosaicTile(p, [], 'down').value).toBe('Not available')
  })
})

function snapshot(handling: (number | null)[]): Snapshot {
  return {
    projects: handling.map((h, i) => ({
      id: i + 1,
      name: 'Project ' + (i + 1),
      flatsHandling: h,
      targets: [
        {
          id: (i + 1) * 10,
          name: 'Target ' + (i + 1) * 10,
          rotation: i === 0 ? 12.34 : null,
          plans: [
            { templateId: 1, filter: 'Red', exposure: 300, enabled: true, gain: 0 },
            { templateId: 2, filter: 'Red', exposure: 600, enabled: true, gain: 100 },
            { templateId: 3, filter: 'H-a', exposure: 600, enabled: true, gain: -1 },
          ],
        },
      ],
    })),
    templates: [
      { id: 1, gain: 0, offset: -1, bin: 1 },
      { id: 2, gain: 100, offset: -1, bin: 1 },
      { id: 3, gain: -1, offset: -1, bin: 1 },
    ],
  } as unknown as Snapshot
}

describe('flats tile', () => {
  it('lists one dawn set per filter, rotation and gain for daily projects', () => {
    const p: Preview = {
      end: t(11, 2),
      blocks: [
        block(2, 3, 1, 10, 'Red', 300),
        block(3, 4, 1, 10, 'Red', 300),
        block(4, 5, 1, 10, 'Red', 600),
        block(5, 6, 1, 10, 'H-a', 600),
      ],
    }
    const f = flatsPlan(p, snapshot([1]))
    expect(f.dawn.map((s) => [s.filter, s.rotation, s.gain])).toEqual([
      ['Red', 12.3, 0],
      ['Red', 12.3, 100],
      ['H-a', 12.3, null],
    ])
    const tile = flatsTile(p, snapshot([1]))
    expect(tile.value).toBe('3 sets')
    expect(tile.note).toBe('After the plan ends at 06:02 CDT')
    expect(tile.lines).toEqual([
      'Red · rotation 12.3° · gain 0',
      'Red · rotation 12.3° · gain 100',
      'H-a · rotation 12.3° · camera default gain',
    ])
  })

  it('says when other flats handling takes the flats', () => {
    const p: Preview = {
      blocks: [
        block(2, 3, 1, 10, 'Red'),
        block(3, 4, 2, 20, 'Red'),
        block(4, 5, 3, 30, 'Red'),
        block(5, 6, 4, 40, 'Red'),
        block(6, 7, 5, 50, 'Red'),
        block(7, 8, 6, 60, 'Red'),
      ],
    }
    const tile = flatsTile(p, snapshot([3, 100, 200, 0, null, -4]))
    expect(tile.value).toBe('None')
    expect(tile.note).toBe('')
    expect(tile.lines).toEqual([
      "Project 1 every 3 days, so tonight's subs wait for a later dawn",
      'At target completion: Target 20',
      'Use with immediate: Target 30',
      'Off: Project 4',
      'Flats handling not reported: Project 5, Project 6',
    ])
    expect(flatsTile({ blocks: [] }, snapshot([1])).note).toBe('Nothing planned')
    expect(flatsTile(p, null, 'nope')).toEqual({
      label: 'Flats at dawn',
      value: 'Not available',
      note: 'Project settings are not available: nope',
    })
  })
})
