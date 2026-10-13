import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import CollabsPage from '@/scheduler/pages/CollabsPage.vue';

afterEach(() => vi.unstubAllGlobals());

const visit = {
  name: 'Frames per visit',
  rule: 'the deal asks at least 10 frames of a filter per visit; not a requirement',
  you: '10 frames at your usual sub lengths take 50 min (L R G B at 300s); your typical visit: median 7 lights of one filter per target per night over 40 target-filter-nights, last 60 days',
  result: 'none',
  scope: 'info',
};

function collab(id: string, status: string) {
  return {
    id,
    name: id === 'a' ? 'M31 NINA TEST COLLAB' : 'heart neb mosaic',
    coordinator: 'astrofalls',
    status,
    kind: 'single',
    created: '2026-10-07T00:00:00Z',
    region: { ra: 10.675, dec: 41.267, width: 5.37, height: 3.58, rotation: 275.8 },
    goals: { H: 500 },
    progress: { H: 17 },
    fits: true,
    verdict: 'fits',
    unchecked: 0,
    criteria: [
      { name: 'Focal length', rule: '100–3000 mm', you: '405 mm', result: 'pass', scope: 'rig' },
      { name: 'Filters', rule: 'H, any bandpass', you: 'all 1', result: 'pass', scope: 'rig' },
      visit,
    ],
    panels: 1,
    columns: 1,
    rows: 1,
    coverage: 0.6,
    months: Array(12).fill(0),
    have: [],
  };
}

async function render(open = [collab('a', 'open')]) {
  const body = { enabled: true, open, closed: [collab('b', 'closed')], closedTotal: 1, rig: null };
  vi.stubGlobal('fetch', vi.fn(async (u: string) =>
    String(u).includes('/sky/cutout')
      ? ({
        status: 200,
        ok: true,
        headers: new Headers(),
        blob: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])]),
      } as unknown as Response)
      : new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })));
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: () => 'blob:sky', revokeObjectURL: () => {} }));
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/collabs', component: CollabsPage }] });
  router.push('/collabs');
  await router.isReady();
  const el = document.createElement('div');
  const app = createApp({ render: () => h(RouterView) });
  app.use(router);
  app.mount(el);
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
  return { el, app };
}

describe('CollabsPage', () => {
  it('shows frames per visit as information beside a fitting verdict', async () => {
    const { el, app } = await render();
    expect(el.textContent).toContain('Fits your rig');
    const row = [...el.querySelectorAll('.crit li')].find((li) => li.textContent?.includes('Frames per visit'));
    expect(row?.textContent).toContain('not a requirement');
    expect(row?.querySelector('.sr-only')?.textContent).toContain('for information, not a requirement');
    expect(row?.querySelector('.what')).not.toBeNull();
    expect(row?.querySelector('.val')?.textContent).toContain('your typical visit');
    app.unmount();
  });

  it('lists the information row under a closed collab’s reasons', async () => {
    const { el, app } = await render();
    const why = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Why');
    why?.click();
    await nextTick();
    const rows = [...el.querySelectorAll('table .crit li')].map((li) => li.textContent ?? '');
    expect(rows.some((t) => t.includes('Frames per visit'))).toBe(true);
    app.unmount();
  });

  it('asks for a survey image wide enough for a 30° region and never shows a broken image', async () => {
    const wide = { ...collab('w', 'open'), region: { ra: 83.8, dec: -1.5, width: 30.76, height: 31.84, rotation: 0 } };
    const { el, app } = await render([wide]);
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    const asked = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls
      .map(([u]) => new URL(String(u), 'http://x'))
      .filter((u) => u.pathname.endsWith('/sky/cutout'));
    expect(asked.length).toBeGreaterThan(0);
    const fov = Number(asked[0]!.searchParams.get('fov'));
    expect(fov).toBeGreaterThanOrEqual(73.8);
    expect(fov).toBeLessThanOrEqual(180);
    const hrefs = [...el.querySelectorAll('svg.sky image')].map((i) => i.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h.startsWith('blob:'))).toBe(true);
    app.unmount();
  });
});
