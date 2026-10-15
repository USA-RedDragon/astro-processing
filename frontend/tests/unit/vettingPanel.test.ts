import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import VettingPanel from '@/scheduler/components/VettingPanel.vue'
import type { DiscoverySource, SourceChecks } from '@/scheduler/api/discoveries'
import { cygnus, nova } from './fixtures/discoveries'
import andromedaJson from './fixtures/checksAndromeda.json'
import cygnusJson from './fixtures/checksCygnus.json'

const andromeda = andromedaJson as unknown as SourceChecks
const cygnusChecks = cygnusJson as unknown as SourceChecks

interface Props {
  source: DiscoverySource
  checks: SourceChecks | null
  loading?: boolean
  error?: string
  runError?: string
  starting?: boolean
  busy?: boolean
}

const mounted: { unmount(): void }[] = []
afterEach(() => {
  mounted.splice(0).forEach((a) => a.unmount())
  vi.restoreAllMocks()
})

async function mount(p: Props) {
  const props = reactive({ ...p })
  const on = { vet: vi.fn(), run: vi.fn(), reload: vi.fn() }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  })
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({
    render: () =>
      h(
        VettingPanel,
        { ...props, onVet: on.vet, onRun: on.run, onReload: on.reload },
        { note: () => h('p', { class: 'slot-note' }, 'note here') },
      ),
  })
  app.use(router)
  app.mount(el)
  await router.isReady()
  await nextTick()
  mounted.push(app)
  return { el, props, on }
}

const andromedaSource = () =>
  nova({ id: 2, class: 'new_variable_candidate', ra: 10.88933, dec: 41.66236 })

const buttons = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.vet button')]
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

describe('VettingPanel', () => {
  it('shows the Andromeda binary as the mockup does', async () => {
    const { el } = await mount({ source: andromedaSource(), checks: andromeda })
    expect(text(el.querySelector('.lbl'))).toBe('Suggested verdict · High confidence')
    expect(text(el.querySelector('.say'))).toBe(
      'Looks like a new eclipsing binary, repeats every 9.987 days',
    )
    expect(el.querySelector('.verdict')!.classList.contains('new')).toBe(true)
    expect(buttons(el).map((b) => text(b))).toEqual([
      'Real Suggested',
      'Artifact',
      'Already known',
      'Not sure',
    ])
    expect(buttons(el).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(el.textContent).toContain(
      'Not vetted yet. The suggestion is not saved until you pick one.',
    )
    expect(el.querySelector('.verdict .slot-note')).not.toBeNull()

    const groups = [...el.querySelectorAll('.group')]
    expect(
      groups.map((g) => [...g.querySelectorAll('h3 span')].map((x) => text(x)).join(' | ')),
    ).toEqual([
      'Image checks | 4 not run',
      'Your own measurements | 3 pass',
      'Survey history | 5 pass · 3 not run',
      'Catalogs | 4 pass · 1 not run',
      'Moving object check | 1 pass',
    ])
    const ztf = [...el.querySelectorAll('li')].find((l) => text(l.querySelector('.ct')) === 'ZTF')!
    expect(text(ztf.querySelector('.ic'))).toBe('✓')
    expect(text(ztf.querySelector('.st'))).toBe('Pass')
    expect(text(ztf.querySelector('.ev'))).toContain('Repeats every 9.98715 days')
    const atlas = [...el.querySelectorAll('li')].find(
      (l) => text(l.querySelector('.ct')) === 'ATLAS',
    )!
    expect(text(atlas.querySelector('.ic'))).toBe('–')
    expect(text(atlas.querySelector('.st'))).toBe('Not run')
    expect(text(atlas.querySelector('.ev'))).toBe('Not fetched yet.')
    expect(el.textContent).toContain('Still fetching: ATLAS, NEOWISE.')
    expect(el.textContent).toMatch(/Checked \w{3} 13 Oct at 21:14 CDT\./)
    expect(text(el.querySelector('.state .linkish'))).toBe('Run again')

    const charts = [...el.querySelectorAll('.chart')]
    expect(charts.map((c) => text(c.querySelector('h3')))).toEqual([
      'Your night, Oct 11',
      'ZTF r, folded on 9.98715 days',
    ])
    expect(charts[0]!.querySelectorAll('circle.pt')).toHaveLength(28)
    expect(charts[0]!.querySelectorAll('line.eb')).toHaveLength(28)
    expect(charts[0]!.querySelector('path.md')).not.toBeNull()
    expect(charts[0]!.querySelectorAll('line.ref')).toHaveLength(1)
    expect([...charts[0]!.querySelectorAll('.legend span')].map((x) => text(x))).toEqual([
      'Your frames',
      'Predicted dip from ZTF',
    ])
    expect(charts[1]!.querySelectorAll('circle.pt')).toHaveLength(600)
    expect(charts[1]!.querySelectorAll('line.eb')).toHaveLength(0)

    const draft = el.querySelector('.links a.draft')!
    expect(text(draft)).toBe('Report draft (VSX form)')
    expect(draft.getAttribute('href')).toBe('/discoveries/report/18554')
    expect([...el.querySelectorAll('.links a')].map((a) => text(a))).toEqual([
      'Report draft (VSX form)',
      'Aladin',
      'VSX',
      'SIMBAD',
    ])
  })

  it('shows the Cygnus artifact with its empty chart and the fade line', async () => {
    const { el } = await mount({ source: cygnus(), checks: cygnusChecks })
    expect(el.querySelector('.verdict')!.classList.contains('nova')).toBe(true)
    expect(text(el.querySelector('.say'))).toBe('Artifact: reference image contaminated')
    expect(buttons(el).map((b) => text(b))[1]).toBe('Artifact Suggested')
    const ref = [...el.querySelectorAll('li')].find(
      (l) => text(l.querySelector('.ct')) === 'Reference image clean at that spot',
    )!
    expect(text(ref.querySelector('.ic'))).toBe('✕')
    expect(text(ref.querySelector('.st'))).toBe('Fail')
    const charts = [...el.querySelectorAll('.chart')]
    expect(text(charts[0]!.querySelector('.none'))).toBe('Not measured yet')
    expect(charts[0]!.querySelector('svg')).toBeNull()
    expect(charts[0]!.querySelector('.legend')).toBeNull()
    expect(charts[1]!.querySelectorAll('line.ref')).toHaveLength(1)
    expect(charts[1]!.querySelectorAll('line.fade')).toHaveLength(1)
    expect(charts[1]!.querySelector('path.md')).toBeNull()
    expect(el.querySelector('.links a.draft')).toBeNull()
    expect(el.textContent).toContain('Report draft: not offered for artifacts')
    expect(el.textContent).not.toContain('Still fetching')
  })

  it('marks the saved verdict and passes clicks up, without saving the suggestion', async () => {
    const { el, on, props } = await mount({
      source: andromedaSource(),
      checks: andromeda,
    })
    buttons(el)[1]!.click()
    expect(on.vet).toHaveBeenCalledWith('artifact')
    props.source = andromedaSource()
    props.source.vetting = 'real'
    await nextTick()
    expect(buttons(el)[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(el.textContent).toContain('Saved as Real.')
    expect(on.vet).toHaveBeenCalledTimes(1)
  })

  it('asks to run the checks when none have run', async () => {
    const { el, on } = await mount({
      source: cygnus(),
      checks: {
        source_id: 1,
        state: 'none',
        report: null,
        error: '',
        requested_at: null,
        finished_at: null,
      },
    })
    expect(text(el.querySelector('.lbl'))).toBe('Your verdict')
    expect(el.querySelector('.say')).toBeNull()
    expect(el.textContent).toContain('Not vetted yet.')
    expect(el.textContent).not.toContain('The suggestion is not saved')
    expect(buttons(el).some((b) => b.textContent!.includes('Suggested'))).toBe(false)
    expect(el.textContent).toContain('Automatic checks have not run yet.')
    expect(el.querySelector('.cols')).toBeNull()
    expect(el.querySelector('.links a.draft')).toBeNull()
    const run = [...el.querySelectorAll('button')].find((b) => text(b) === 'Run checks')!
    run.click()
    expect(on.run).toHaveBeenCalled()
  })

  it('says the checks are running and shows no numbers', async () => {
    const { el } = await mount({
      source: cygnus(),
      checks: {
        source_id: 1,
        state: 'queued',
        report: null,
        error: '',
        requested_at: '2026-10-15T01:00:00Z',
        finished_at: null,
      },
    })
    expect(el.textContent).toContain('Checks are running.')
    expect(el.querySelector('.cols')).toBeNull()
    expect([...el.querySelectorAll('.state button')]).toHaveLength(0)
  })

  it('says why the checks failed and offers to run them again', async () => {
    const { el, on } = await mount({
      source: cygnus(),
      checks: {
        source_id: 1,
        state: 'failed',
        report: null,
        error: 'ZTF did not answer',
        requested_at: null,
        finished_at: null,
      },
      runError: 'stacker busy',
    })
    expect(el.textContent).toContain('The checks did not finish: ZTF did not answer')
    expect(el.textContent).toContain('The checks did not start: stacker busy')
    ;[...el.querySelectorAll('button')].find((b) => text(b) === 'Run checks again')!.click()
    expect(on.run).toHaveBeenCalled()
  })

  it('says when the checks could not be loaded', async () => {
    const { el, on } = await mount({ source: cygnus(), checks: null, error: 'Bad Gateway' })
    expect(el.textContent).toContain('Could not load the automatic checks: Bad Gateway')
    ;[...el.querySelectorAll('button')].find((b) => text(b) === 'Try again')!.click()
    expect(on.reload).toHaveBeenCalled()
    const loading = await mount({ source: cygnus(), checks: null, loading: true })
    expect(loading.el.textContent).toContain('Loading the automatic checks.')
  })

  it('shows the nearest point on hover', async () => {
    const { el } = await mount({ source: andromedaSource(), checks: andromeda })
    const chart = el.querySelector('.chart')!
    const svg = chart.querySelector('svg')!
    const body = chart.querySelector('.body') as HTMLElement
    const rect = (w: number, hgt: number) =>
      ({ left: 0, top: 0, width: w, height: hgt, right: w, bottom: hgt, x: 0, y: 0 }) as DOMRect
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(rect(460, 210))
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(rect(460, 260))
    const circle = chart.querySelectorAll('circle.pt')[0]!
    const cx = Number(circle.getAttribute('cx'))
    const cy = Number(circle.getAttribute('cy'))
    const hit = chart.querySelector('rect.hit')!
    const move = new MouseEvent('pointermove', { clientX: cx + 1, clientY: cy })
    hit.dispatchEvent(move)
    await nextTick()
    await nextTick()
    const tip = chart.querySelector('.tip') as HTMLElement
    expect(tip.hidden).toBe(false)
    expect(text(tip)).toBe('−39 min: 0.188 mag fainter, ±0.010')
    expect(chart.querySelector('circle.ring')).not.toBeNull()
    hit.dispatchEvent(new MouseEvent('pointerleave'))
    await nextTick()
    expect(tip.hidden).toBe(true)
  })
})
