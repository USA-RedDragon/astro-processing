import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import ProjectCard from '@/components/ProjectCard.vue';
import OtherTargetCard from '@/components/OtherTargetCard.vue';
import type { OtherTarget, Project } from '@/graphql/graphql';

const cover = { palette: 'SHO', filter: '', mosaic: false, preview_url: 'https://s3.example/tall.jpg', updated_at: '2026-10-10T00:00:00Z' };

const imgClasses = (el: HTMLElement) => el.querySelector('img')!.className.split(/\s+/);

const expectUncropped = (classes: string[]) => {
  expect(classes).toContain('w-full');
  expect(classes).toContain('h-auto');
  for (const c of classes) expect(c).not.toMatch(/^(max-h-|h-\d|h-\[|object-cover|aspect-)/);
};

describe('cover pictures on Home cards', () => {
  it('ProjectCard shows the full field at its natural height', async () => {
    const project = {
      id: '6', name: 'Heart and Soul', state: 'ACTIVE', priority: 'NORMAL', is_mosaic: false, targets: [],
      stats: { imaging: { desired_images: 0, accepted_images: 0, rejected_images: 0, acquired_images: 0 } },
      cover,
    } as unknown as Project;
    const el = document.createElement('div');
    const app = createApp({ render: () => h(ProjectCard, { project, planningState: 'ok' }) });
    app.mount(el);
    await nextTick();
    expectUncropped(imgClasses(el));
    app.unmount();
  });

  it('OtherTargetCard shows the full field at its natural height', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
    const target = { name: 'IC 1848', lights: 10, stacked: 5, nights: 1, first_night: '2026-10-01', last_night: '2026-10-01', cover } as unknown as OtherTarget;
    const el = document.createElement('div');
    const app = createApp({ render: () => h(OtherTargetCard, { target }) });
    app.use(router);
    app.mount(el);
    await nextTick();
    expectUncropped(imgClasses(el));
    app.unmount();
  });
});
