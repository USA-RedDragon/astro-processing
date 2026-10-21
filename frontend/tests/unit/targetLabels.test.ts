import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { labelEdges, subChart, targetLabels, type ChartLabel } from '@/scheduler/plan'
import type { TonightSub } from '@/scheduler/api/scheduler'
import TargetLabels from '@/scheduler/components/TargetLabels.vue'

const box = { x0: 56, x1: 1180, yTop: 20, yBottom: 190 }

function apart(a: ChartLabel, b: ChartLabel) {
  const [, ar] = labelEdges(a)
  const [bl] = labelEdges(b, 600)
  expect(ar).toBeLessThan(bl)
}

describe('targetLabels', () => {
  it('keeps the first name whole with no change', () => {
    const l = targetLabels('Lagoon Nebula', [], box)
    expect(l.first?.text).toBe('Lagoon Nebula')
    expect(l.current).toBeNull()
  })

  it('keeps both whole when the change is far from the left', () => {
    const l = targetLabels('Lagoon Nebula', [{ x: 600, label: 'Cygnis Loop Panel 1' }], box)
    expect(l.current).toEqual({ x: 594, text: 'Cygnis Loop Panel 1 →', anchor: 'end' })
    expect(l.first?.text).toBe('Lagoon Nebula')
    apart(l.first!, l.current!)
  })

  it('moves the current name right of an early change and shortens the first', () => {
    const l = targetLabels('Lagoon Nebula', [{ x: 120, label: 'Cygnis Loop Panel 1' }], box)
    expect(l.current).toEqual({ x: 126, text: 'Cygnis Loop Panel 1', anchor: 'start' })
    expect(l.first?.text).toBe('Lagoon…')
    apart(l.first!, l.current!)
    expect(labelEdges(l.first!)[1]).toBeLessThan(120)
  })

  it('drops the first name when the current one leaves no room for it', () => {
    const l = targetLabels('Lagoon Nebula', [{ x: 230, label: 'Cygnis Loop Panel 1' }], box)
    expect(l.current?.anchor).toBe('end')
    expect(l.current?.text).toBe('Cygnis Loop Panel 1 →')
    expect(l.first).toBeNull()
  })

  it('labels only the last of several changes', () => {
    const l = targetLabels(
      'Lagoon Nebula',
      [
        { x: 400, label: 'M31' },
        { x: 900, label: 'Cygnis Loop Panel 1' },
      ],
      box,
    )
    expect(l.current?.text).toBe('Cygnis Loop Panel 1 →')
    expect(l.first?.text).toBe('Lagoon Nebula')
  })
})

function sub(min: number, id: number, target: string): TonightSub {
  return {
    time: new Date(Date.parse('2026-10-21T01:00:00Z') + min * 60e3).toISOString(),
    target_id: id,
    target,
    hfr: 2 + (min % 5) * 0.05,
  } as TonightSub
}

describe('target labels on the HFR chart', () => {
  it('renders apart labels for a target change soon after the chart starts', async () => {
    const subs = [
      sub(0, 1, 'Lagoon Nebula'),
      sub(3, 1, 'Lagoon Nebula'),
      sub(6, 1, 'Lagoon Nebula'),
      ...Array.from({ length: 60 }, (_, i) => sub(9 + i * 4, 2, 'Cygnis Loop Panel 1')),
    ]
    const t0 = Date.parse('2026-10-21T00:50:00Z')
    const c = subChart(subs, (s) => s.hfr, 2, t0, t0 + 6 * 3600e3, box)
    const el = document.createElement('div')
    const app = createApp({
      render: () =>
        h('svg', { viewBox: '0 0 1200 216' }, [
          h(TargetLabels, { first: c.firstLabel, changes: c.changes, box, y: 14 }),
        ]),
    })
    app.mount(el)
    await nextTick()
    const first = el.querySelector('text.tl-first')
    const cur = el.querySelector('text.tl-current')
    expect(cur?.textContent?.trim()).toBe('Cygnis Loop Panel 1')
    expect(cur?.getAttribute('text-anchor')).toBe('start')
    const curX = Number(cur?.getAttribute('x'))
    if (first) {
      const text = first.textContent!.trim()
      expect(text.endsWith('…')).toBe(true)
      const [, right] = labelEdges({ x: Number(first.getAttribute('x')), text, anchor: 'start' })
      expect(right).toBeLessThan(curX)
    }
    app.unmount()
  })
})
