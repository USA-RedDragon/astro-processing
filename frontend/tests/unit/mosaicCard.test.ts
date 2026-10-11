import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import MosaicCard from '@/components/MosaicCard.vue';
import type { Mosaic } from '@/graphql/graphql';

describe('MosaicCard', () => {
  it('does not show the preview canvas size as the mosaic size', async () => {
    const mosaic = {
      filter: 'Blue', panels: 4, panels_total: 4, width: 2255, height: 1516,
      updated_at: '2026-10-09T21:42:27Z', master_url: 'https://s3.example/mosaic.fit',
      preview_url: 'https://s3.example/preview.jpg', linear_url: '', crop: null,
    } as unknown as Mosaic;
    const el = document.createElement('div');
    const app = createApp({ render: () => h(MosaicCard, { mosaics: [mosaic], project: '' }) });
    app.mount(el);
    await nextTick();
    expect(el.textContent).toContain('4 of 4 panels');
    expect(el.textContent).not.toContain('2255');
    app.unmount();
  });

  const mount = async (xisf: string | null) => {
    const mosaic = {
      filter: 'Ha', panels: 2, panels_total: 2, width: 2255, height: 1516,
      updated_at: '2026-10-09T21:42:27Z', master_url: 'https://s3.example/mosaic.fit',
      preview_url: 'https://s3.example/preview.jpg', linear_url: '', crop: null, xisf_url: xisf,
    } as unknown as Mosaic;
    const el = document.createElement('div');
    const app = createApp({ render: () => h(MosaicCard, { mosaics: [mosaic], project: '' }) });
    app.mount(el);
    await nextTick();
    const links = [...el.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    app.unmount();
    return links;
  };

  it('offers the XISF next to the FITS when the stacker has one', async () => {
    const links = await mount('https://s3.example/mosaic.xisf');
    expect(links).toContainEqual(['Download FITS', 'https://s3.example/mosaic.fit']);
    expect(links).toContainEqual(['Download XISF', 'https://s3.example/mosaic.xisf']);
  });

  it('hides the XISF button when there is no XISF', async () => {
    const links = await mount(null);
    expect(links).toContainEqual(['Download FITS', 'https://s3.example/mosaic.fit']);
    expect(links.map(([t]) => t)).not.toContain('Download XISF');
  });
});
