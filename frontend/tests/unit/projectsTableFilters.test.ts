import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

vi.mock('@/scheduler/api/events', () => ({ onEvent: () => () => {}, onReconnect: () => () => {} }))

import ProjectsTable from '@/scheduler/components/ProjectsTable.vue'
import real from './fixtures/project40Real.json'

afterEach(() => vi.unstubAllGlobals())

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

describe('projects table', () => {
  it('lists each project by its filters, never by template or set names', async () => {
    const snapshot = { frame: {}, projects: [real.project], templates: real.templates, rules: [], defaults: {} }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/planning')
          ? new Response(JSON.stringify(snapshot), { status: 200 })
          : new Response('{"error":"not found"}', { status: 404 }),
      ),
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: { render: () => h(ProjectsTable, { filter: { q: '', pri: 'All', state: 'All', kind: 'All' } }) },
        },
      ],
    })
    router.push('/')
    await router.isReady()
    const el = document.createElement('div')
    const app = createApp({ render: () => h(RouterView) })
    app.use(router)
    app.mount(el)
    await settle()
    const heads = [...el.querySelectorAll('th')].map((x) => x.textContent?.trim())
    expect(heads).toContain('Filters')
    expect(heads).not.toContain('Exposure set')
    expect(el.textContent).toContain('Luminance, Red, Green, Blue, H-a, O-III')
    expect(el.textContent).not.toContain('Apply an exposure set')
    app.unmount()
  })
})
