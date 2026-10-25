import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import OtherTargetCard from '@/components/OtherTargetCard.vue'
import type { OtherTarget } from '@/graphql/graphql'

const target = (cover: OtherTarget['cover']) =>
  ({
    name: 'Test Nebula',
    lights: 10,
    recorded: 10,
    stacked: 8,
    nights: 1,
    first_night: '2026-10-01',
    last_night: '2026-10-01',
    cover,
  }) as unknown as OtherTarget

async function mount(t: OtherTarget) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  })
  router.push('/')
  await router.isReady()
  const el = document.createElement('div')
  const app = createApp({ render: () => h(OtherTargetCard, { target: t }) })
  app.use(router)
  app.mount(el)
  await nextTick()
  return { el, app }
}

describe('OtherTargetCard', () => {
  it('shows a plain box instead of a picture while the cover waits for data', async () => {
    const { el, app } = await mount(
      target({
        palette: '',
        filter: '',
        preview_url: '',
        updated_at: '2026-10-10T23:16:20Z',
        mosaic: false,
        waiting: true,
      }),
    )
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toContain('Cover waits for more data')
    app.unmount()
  })

  it('names the filter of a single-filter cover', async () => {
    const { el, app } = await mount(
      target({
        palette: '',
        filter: 'OIII',
        preview_url: 'https://s3.example/o.jpg',
        updated_at: '2026-10-10T23:16:20Z',
        mosaic: false,
        waiting: false,
      }),
    )
    expect(el.querySelector('img')!.getAttribute('src')).toBe('https://s3.example/o.jpg')
    expect(el.textContent).toContain('OIII')
    expect(el.textContent).not.toContain('Cover waits for more data')
    app.unmount()
  })
})
