import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import CollabsPage from '@/scheduler/pages/CollabsPage.vue';
import { collabPill, runningText, type CollabSwitchStatus } from '@/scheduler/api/collab';
import { shell } from '@/scheduler/shell';

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

function switchStatus(over: Partial<CollabSwitchStatus> = {}): CollabSwitchStatus {
  return {
    configured: true,
    desired: { on: true, setBy: 'jacob', setAt: new Date(Date.now() - 600000).toISOString() },
    readBack: { present: true, value: '1', at: new Date(Date.now() - 30000).toISOString() },
    matches: true,
    reachable: true,
    ninaStarted: '2026-10-13T12:02:54-05:00',
    checkedAt: new Date(Date.now() - 20000).toISOString(),
    running: ['Targets', 'Night', 'Collab', 'Starfront collaboration', 'M31 · panel 2'],
    lastSendAt: null,
    ...over,
  };
}

const posts: { url: string; body: unknown }[] = [];

async function render(open = [collab('a', 'open')], extra: Record<string, unknown> = {}, sw: CollabSwitchStatus = switchStatus()) {
  const body = { enabled: true, open, closed: [collab('b', 'closed')], closedTotal: 1, rig: null, ...extra };
  shell.collab = null;
  posts.length = 0;
  const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    if (String(u).includes('/collab-switch')) {
      if (init?.method === 'POST' && !String(u).endsWith('/read')) {
        const req = JSON.parse(String(init.body)) as { on: boolean };
        posts.push({ url: String(u), body: req });
        const status = switchStatus({ desired: { on: req.on, setBy: 'jacob', setAt: new Date().toISOString() }, readBack: { present: true, value: req.on ? '1' : '0', at: new Date().toISOString() } });
        return json({ status, record: { id: 'r1', kind: 'collab.switch', title: req.on ? 'Turn the collab on' : 'Pause the collab', status: 'applied', category: 'control', message: 'NINA reads back collab = 0.' } });
      }
      return json(sw);
    }
    return String(u).includes('/sky/cutout')
      ? ({
        status: 200,
        ok: true,
        headers: new Headers(),
        blob: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])]),
      } as unknown as Response)
      : json(body);
  }));
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: () => 'blob:sky', revokeObjectURL: () => {} }));
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/collabs', component: CollabsPage }, { path: '/object/:name', component: CollabsPage }] });
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

  it('marks colour-camera bands as not for a mono rig without failing the collab', async () => {
    const c = {
      ...collab('a', 'open'),
      goals: { 'OSC-RGB': 5, H: 10, 'OSC-Ha+OIII': 5, O: 10 },
      progress: {},
      colourOnly: ['OSC-Ha+OIII', 'OSC-RGB'],
      criteria: [
        { name: 'Filters', rule: 'H O OSC-Ha+OIII OSC-RGB, any bandpass', you: 'H O; OSC-Ha+OIII, OSC-RGB need a colour camera, yours is mono', result: 'pass', scope: 'rig' },
        { name: 'OSC-RGB', rule: 'a colour camera with no narrowband filter: red, green and blue in one sub', you: 'mono camera: not for this rig', result: 'none', scope: 'info' },
        { name: 'Sky darkness', rule: 'Bortle 5 or darker', you: 'not measured: no L, R, G or B master with a Gaia zero point has been measured yet', result: 'open', scope: 'rig' },
      ],
    };
    const { el, app } = await render([c]);
    expect(el.textContent).toContain('Fits your rig for its mono bands; its colour bands need a colour camera');
    const rows = [...el.querySelectorAll('.crit li')].map((li) => li.textContent ?? '');
    expect(rows.some((t) => t.includes('OSC-RGB') && t.includes('not for this rig') && t.includes('for information'))).toBe(true);
    expect(rows.some((t) => t.includes('Sky darkness') && t.includes('not measured') && t.includes('not checked'))).toBe(true);
    const goalNames = [...el.querySelectorAll('.goal')].map((g) => g.querySelector('span')?.textContent?.trim());
    expect(goalNames).toEqual(['H', 'O', 'OSC-Ha+OIII', 'OSC-RGB']);
    app.unmount();
  });

  it('lists our frames shot for collabs with links to their stacks', async () => {
    const frames = [{
      project: 'd07d82eb861e', name: 'M31 NINA TEST COLLAB', nights: 2, firstNight: '2026-10-12', lastNight: '2026-10-13', frames: 3, hours: 0.33,
      filters: [{ filter: 'H-a', exposure: 300, frames: 2 }, { filter: 'O-III', exposure: 600, frames: 1 }],
      targets: [
        { object: 'M31 NINA TEST COLLAB panel 1', panel: 1, frames: 2, stacked: [{ filter: 'H-a', frames: 2 }] },
        { object: 'M31 NINA TEST COLLAB panel 2', panel: 2, frames: 1, stacked: [] },
      ],
    }];
    const { el, app } = await render(undefined, { frames, sharedPrefix: 'starfront-shared/' });
    const sec = el.querySelector('[aria-labelledby="frames-h"]');
    expect(sec?.textContent).toContain('Your frames shot for collabs');
    expect(sec?.textContent).toContain('M31 NINA TEST COLLAB');
    expect(sec?.textContent).toContain('2 · 2026-10-12 to 2026-10-13');
    expect(sec?.textContent).toContain('2 × H-a 300 s, 1 × O-III 600 s');
    expect(sec?.textContent).toContain('in masters: 2 H-a');
    expect(sec?.textContent).toContain('none in a master yet');
    expect(sec?.textContent).toContain('starfront-shared/');
    const links = [...(sec?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'));
    expect(links).toContain('/object/M31%20NINA%20TEST%20COLLAB%20panel%201');
    app.unmount();
  });

  it('says plainly when no collab frames exist', async () => {
    const { el, app } = await render(undefined, { frames: [] });
    expect(el.querySelector('[aria-labelledby="frames-h"]')?.textContent).toContain('No frames shot for a collab yet');
    app.unmount();
  });

  it('shows the switch with its read-back and age, and pauses it', async () => {
    const { el, app } = await render();
    for (let i = 0; i < 3; i++) await nextTick();
    const card = el.querySelector('[aria-labelledby="ctl-h"]');
    expect(card?.textContent).toContain('Read back from NINA');
    expect(card?.textContent).toMatch(/collab = 1 · read \d+ s ago through NINA's Advanced API/);
    expect(card?.textContent).toContain('Starfront collaboration · M31 · panel 2');
    const btn = [...(card?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('Pause the collab'));
    expect(btn).toBeDefined();
    btn!.click();
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toEqual([{ url: '/api/v1/collab-switch', body: { on: false } }]);
    expect(card?.textContent).toContain('Resume the collab');
    expect(card?.textContent).toContain('collab = 0');
    app.unmount();
  });

  it('says so when the running sequence has no collab constant', async () => {
    const missing = { present: false, value: null, at: new Date().toISOString() };
    const sw = switchStatus({ readBack: missing, matches: false });
    const { el, app } = await render(undefined, {}, sw);
    for (let i = 0; i < 3; i++) await nextTick();
    expect(el.textContent).toContain('Not in the running sequence: it has no Powerups constant named collab');
    expect(collabPill(sw)?.label).toBe('Collab: not in the sequence');
    app.unmount();
  });
});

describe('collab pill', () => {
  it('reads the switch state for the header', () => {
    expect(collabPill(null)).toBeNull();
    expect(collabPill(switchStatus({ configured: false, desired: null }))).toBeNull();
    expect(collabPill(switchStatus())?.label).toBe('Collab: on, preempting');
    expect(collabPill(switchStatus({ desired: { on: false, setBy: 'a', setAt: '' }, matches: true, readBack: { present: true, value: '0', at: 'x' } }))?.label).toBe('Collab: paused');
    expect(collabPill(switchStatus({ matches: false, readBack: { present: true, value: '0', at: 'x' } }))?.label).toBe('Collab: on, not confirmed');
    const off = { on: false, setBy: 'a', setAt: '' };
    const stillOn = { present: true, value: '1', at: 'x' };
    expect(collabPill(switchStatus({ desired: off, matches: false, readBack: stillOn }))?.label).toBe('Collab: paused, not confirmed');
    expect(collabPill(switchStatus({ reachable: false, ninaError: 'timeout' }))?.label).toBe('Collab: NINA not answering');
    expect(collabPill(switchStatus())?.short).toBe('Collab on');
  });

  it('names what NINA is running in plain words', () => {
    expect(runningText([])).toBe('Nothing is running');
    expect(runningText(['Targets', 'Night', 'Imaging', 'Target Scheduler Container'])).toBe('Target Scheduler');
    expect(runningText(['Targets', 'Night', 'Collab', 'Starfront collaboration'])).toBe('Starfront collaboration');
  });
});
