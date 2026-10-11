import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ObjectPage from '@/views/ObjectPage.vue';

afterEach(() => vi.unstubAllGlobals());

async function render(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/object/:name', component: ObjectPage }] });
  router.push('/object/IC%20405');
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

describe('ObjectPage', () => {
  it('says the target failed to load instead of that it does not exist', async () => {
    const { el, app } = await render(async () => new Response('', { status: 502 }));
    expect(el.textContent).toContain('Could not load IC 405');
    expect(el.textContent).not.toContain('No target named');
    app.unmount();
  });

  it('says there is no such target when the backend has none', async () => {
    const { el, app } = await render(async () => new Response(JSON.stringify({ data: { otherTarget: null } })));
    expect(el.textContent).toContain('No target named IC 405');
    app.unmount();
  });
});
