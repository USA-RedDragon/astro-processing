import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

vi.mock('@/scheduler/api/events', () => ({ onEvent: () => () => {}, onReconnect: () => () => {} }))

import FramingEditor from '@/scheduler/components/FramingEditor.vue'
import BodyFramingCard from '@/scheduler/components/BodyFramingCard.vue'
import type { BodyFraming } from '@/scheduler/api/comets'

afterEach(() => vi.unstubAllGlobals())

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const HZ = [
  ['01:00', 321.49362, 4.74841, 84.062, 141.693],
  ['02:00', 321.41186, 4.78003, 84.062, 141.678],
  ['03:00', 321.33029, 4.81158, 84.063, 141.662],
  ['04:00', 321.24889, 4.84306, 84.063, 141.647],
  ['05:00', 321.16767, 4.87447, 84.063, 141.632],
] as const

function row([t, ra, dec, tail, vel]: (typeof HZ)[number], alt: number) {
  return {
    at: `2026-10-13T${t}:00Z`,
    ra,
    dec,
    alt,
    dark: true,
    rate_arcsec_per_min: Math.hypot(-292.5, 113.2) / 60,
    motion_pa: 291.2,
    tail_pa: tail,
    velocity_pa: vel,
    mag: 14.7,
  }
}

const measured = {
  width_deg: 3.32,
  height_deg: 2.22,
  basis: 'Measured camera field 3.32° × 2.22° at 1.91″/px.',
}

function trackView(kind = 'comet', tail = true, frame = true) {
  const rows = HZ.map((r, i) => row(r, [40, 55, 62, 58, 45][i]))
  if (!tail) for (const r of rows) r.tail_pa = null as unknown as number
  return {
    track: {
      designation: '161P',
      kind,
      horizons_command: 'DES=161P;CAP;NOFRAG',
      night: { night: '2026-10-12', start: '2026-10-12T23:00:00Z', stop: '2026-10-13T12:30:00Z' },
      fetched_at: '2026-10-12T15:00:00Z',
      cached: true,
      angles: tail,
      best: rows[2],
      rows,
      basis: 'Horizons',
    },
    frame: frame ? measured : null,
    frame_reason: frame ? null : 'The camera field is not measured yet: no frames',
  }
}

const calls: { url: string; method: string; body: unknown }[] = []

function stub(routes: Record<string, () => Response>) {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const key = Object.keys(routes).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k]
        return m === method && url.includes(path)
      })
      return key ? routes[key]() : json({ error: 'not found' }, 404)
    }),
  )
}

async function settle() {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
}

async function mountEditor(props: Record<string, unknown>) {
  const value = ref<BodyFraming | null>(null)
  const el = document.createElement('div')
  const app = createApp({
    render: () =>
      h(FramingEditor, {
        ...props,
        modelValue: value.value,
        'onUpdate:modelValue': (v: BodyFraming | null) => (value.value = v),
      }),
  })
  app.mount(el)
  await settle()
  return { el, app, value }
}

const button = (el: Element, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement

describe('FramingEditor', () => {
  it('defaults a comet to its tail along the frame from the Horizons tail angle', async () => {
    stub({ '/bodies/track': () => json(trackView()) })
    const { el, app, value } = await mountEditor({ designation: '161P', name: '161P/Hartley-IRAS' })
    expect(calls[0].url).toContain('/bodies/track?designation=161P&kind=comet')
    expect(value.value).toEqual({ rotation_deg: 84.06, offset_frac: -0.25 })
    expect(button(el, 'Tail along the frame').getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector('polygon')).not.toBeNull()
    expect(el.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
    expect(el.textContent).toContain('84° (NINA position angle 174°)')
    expect(el.textContent).toContain('25% toward the sunward end')
    expect(el.textContent).toContain('re-centered about every 2.5 h')
    expect(el.textContent).toContain('Measured camera field 3.32° × 2.22° at 1.91″/px.')
    app.unmount()
  })

  it('centres the comet with the same rotation and lets Custom turn and shift it', async () => {
    stub({ '/bodies/track': () => json(trackView()) })
    const { el, app, value } = await mountEditor({ designation: '161P', name: '161P/Hartley-IRAS' })
    button(el, 'Comet centered').click()
    await settle()
    expect(value.value).toEqual({ rotation_deg: 84.06, offset_frac: 0 })
    button(el, 'Custom').click()
    await settle()
    const [rot, off] = [...el.querySelectorAll('input[type=range]')] as HTMLInputElement[]
    expect(rot.value).toBe('84')
    expect(off.value).toBe('0')
    rot.value = '120'
    rot.dispatchEvent(new Event('input'))
    off.value = '-40'
    off.dispatchEvent(new Event('input'))
    await settle()
    expect(value.value).toEqual({ rotation_deg: 120, offset_frac: -0.4 })
    app.unmount()
  })

  it('gives an asteroid no framing unless Custom is picked, and no tail', async () => {
    stub({ '/bodies/track': () => json(trackView('asteroid')) })
    const { el, app, value } = await mountEditor({
      designation: '4',
      name: '4 Vesta',
      kind: 'asteroid',
    })
    expect(calls[0].url).toContain('kind=asteroid')
    expect(button(el, 'Tail along')).toBeUndefined()
    expect(button(el, 'Asteroid centered').getAttribute('aria-pressed')).toBe('true')
    expect(value.value).toBeNull()
    expect(el.textContent).toContain('not turned for this target')
    expect(el.textContent).not.toContain('tail direction')
    app.unmount()
  })

  it('falls back to centred without a tail angle and says when the field is not measured', async () => {
    stub({ '/bodies/track': () => json(trackView('comet', false, false)) })
    const { el, app, value } = await mountEditor({ designation: '161P', name: '161P' })
    expect(button(el, 'Tail along the frame').disabled).toBe(true)
    expect(value.value).toBeNull()
    expect(el.querySelector('polygon')).toBeNull()
    expect(el.textContent).toContain('The camera field is not measured yet: no frames')
    app.unmount()
  })

  it('starts from a stored framing when editing', async () => {
    stub({ '/bodies/track': () => json(trackView()) })
    const { el, app, value } = await mountEditor({
      designation: '161P',
      name: '161P',
      initial: { rotation_deg: 100, offset_frac: 0.1 },
    })
    expect(button(el, 'Custom').getAttribute('aria-pressed')).toBe('true')
    expect(value.value).toEqual({ rotation_deg: 100, offset_frac: 0.1 })
    app.unmount()
  })

  it('reports a Horizons failure and leaves the framing empty', async () => {
    stub({ '/bodies/track': () => json({ error: 'horizons does not know this body' }, 404) })
    const { el, app, value } = await mountEditor({ designation: 'X', name: 'X' })
    expect(el.textContent).toContain('horizons does not know this body')
    expect(value.value).toBeNull()
    app.unmount()
  })
})

describe('BodyFramingCard', () => {
  async function mountCard() {
    const el = document.createElement('div')
    const app = createApp(BodyFramingCard, { targetGuid: 'g1', targetId: 7, targetName: '161P' })
    app.mount(el)
    await settle()
    return { el, app }
  }

  it('renders nothing for a fixed target', async () => {
    stub({ '/bodies/target': () => json({ target: null, framing_columns: true }) })
    const { el, app } = await mountCard()
    expect(el.querySelector('section')).toBeNull()
    app.unmount()
  })

  it('shows the stored framing and sends target.framing with the before value', async () => {
    stub({
      '/bodies/target': () =>
        json({
          target: {
            target_guid: 'g1',
            name: '161P',
            designation: '161P',
            kind: 'comet',
            active: true,
            rotation_deg: 84.06,
            offset_frac: -0.25,
          },
          framing_columns: true,
        }),
      '/bodies/track': () => json(trackView()),
      'POST /commands': () =>
        json({
          id: 'c',
          kind: 'target.framing',
          status: 'queued',
          payload: {},
          created_at: '',
          updated_at: '',
        }),
    })
    const { el, app } = await mountCard()
    expect(el.textContent).toContain('Long side at 84° (NINA position angle 174°)')
    button(el, 'Change framing').click()
    await settle()
    expect(button(el, 'Tail along the frame').getAttribute('aria-pressed')).toBe('true')
    expect(button(el, 'Save framing').disabled).toBe(true)
    button(el, 'Comet centered').click()
    await settle()
    button(el, 'Save framing').click()
    await settle()
    const sent = calls.find((c) => c.method === 'POST' && c.url.endsWith('/commands'))!
    expect(sent.body).toEqual({
      kind: 'target.framing',
      payload: {
        target_id: 7,
        target_guid: 'g1',
        target_name: '161P',
        framing: { rotation_deg: 84.06, offset_frac: 0 },
        before: { rotation_deg: 84.06, offset_frac: -0.25 },
      },
    })
    app.unmount()
  })

  it('says when the home database has no framing columns', async () => {
    stub({
      '/bodies/target': () =>
        json({
          target: {
            target_guid: 'g1',
            name: '161P',
            designation: '161P',
            kind: 'comet',
            active: true,
            rotation_deg: null,
            offset_frac: null,
          },
          framing_columns: false,
        }),
    })
    const { el, app } = await mountCard()
    expect(el.textContent).toContain('has no framing columns yet')
    app.unmount()
  })
})
