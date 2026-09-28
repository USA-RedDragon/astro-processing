<template>
  <Card>
    <CardHeader>
      <CardTitle>Palette</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-wrap items-end gap-4 text-sm">
        <label class="flex flex-col gap-1">
          <span class="text-muted-foreground">Palette</span>
          <select v-model="preset" class="border rounded-md bg-background px-2 py-1" @change="applyPreset">
            <option
              v-for="p in presets"
              :key="p.name"
              :value="p.name"
              :disabled="!p.available"
            >
              {{ p.name }}{{ p.available ? '' : ' (missing filters)' }}
            </option>
            <option value="Custom">Custom</option>
          </select>
        </label>
        <label v-for="c in channels" :key="c.key" class="flex flex-col gap-1">
          <span :class="c.color">{{ c.label }}</span>
          <select
            v-model="mapping[c.key]"
            class="border rounded-md bg-background px-2 py-1"
            @change="preset = 'Custom'"
          >
            <option value="">None</option>
            <option v-for="f in filters" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <label v-if="canBlendHa" class="flex flex-col gap-1">
          <span class="text-muted-foreground">Ha into red: {{ Math.round(haBlend * 100) }}%</span>
          <input v-model.number="haBlend" type="range" min="0" max="1" step="0.05" class="w-40">
        </label>
        <label class="flex items-center gap-2">
          <input v-model="linked" type="checkbox">
          <span>Linked stretch</span>
        </label>
        <button
          type="button"
          class="border rounded-md px-3 py-1 hover:bg-accent"
          :disabled="!rendered"
          @click="savePNG"
        >
          Save PNG
        </button>
      </div>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <p v-else-if="loading" class="text-sm text-muted-foreground">Loading linear previews…</p>
      <canvas ref="canvas" class="w-full h-auto bg-black rounded-md" />
      <p class="text-xs text-muted-foreground">
        Preview only: each channel is auto-stretched from the linear masters.
        For finished colour, calibrate in PixInsight.
      </p>
    </CardContent>
  </Card>
</template>

<script lang="ts">
import { markRaw, type PropType } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  apply,
  autoStretch,
  normalize,
  parseLinear,
  stats,
  type LinearImage,
  type StretchParams,
} from '@/lib/stretch';
// Masters and mosaics both work: anything with a filter and a linear preview.
interface Mixable {
  filter: string;
  linear_url: string;
  updated_at: string;
}

type Channel = 'r' | 'g' | 'b';

interface Preset {
  name: string;
  r: string;
  g: string;
  b: string;
}

const PRESETS: Preset[] = [
  { name: 'RGB', r: 'Red', g: 'Green', b: 'Blue' },
  { name: 'SHO', r: 'S-II', g: 'H-a', b: 'O-III' },
  { name: 'HOO', r: 'H-a', g: 'O-III', b: 'O-III' },
];

// Loaded images live outside Vue's reactivity: they're large typed arrays.
const cache = new Map<string, LinearImage>();

export default {
  name: 'PaletteMixer',
  components: { Card, CardContent, CardHeader, CardTitle },
  props: {
    masters: {
      type: Array as PropType<Mixable[]>,
      required: true,
    },
  },
  data() {
    return {
      preset: '',
      mapping: { r: '', g: '', b: '' } as Record<Channel, string>,
      haBlend: 0,
      linked: false,
      loading: false,
      error: '',
      rendered: false,
      channels: [
        { key: 'r' as Channel, label: 'Red', color: 'text-red-500' },
        { key: 'g' as Channel, label: 'Green', color: 'text-green-500' },
        { key: 'b' as Channel, label: 'Blue', color: 'text-blue-500' },
      ],
    };
  },
  computed: {
    filters(): string[] {
      return this.masters.map((m) => m.filter);
    },
    presets(): (Preset & { available: boolean })[] {
      return PRESETS.map((p) => ({ ...p, available: [p.r, p.g, p.b].every((f) => this.filters.includes(f)) }));
    },
    canBlendHa(): boolean {
      return this.filters.includes('H-a') && this.mapping.r !== '' && this.mapping.r !== 'H-a';
    },
  },
  watch: {
    mapping: { handler() { this.render(); }, deep: true },
    // Redraw when a master is updated; the old image stays until then.
    masters() { this.render(); },
    haBlend() { this.render(); },
    linked() { this.render(); },
  },
  mounted() {
    const first = this.presets.find((p) => p.available);
    if (first) {
      this.preset = first.name;
      this.applyPreset();
    } else {
      // A single filter: show it in all three channels, as mono.
      const f = this.filters[0] ?? '';
      this.preset = 'Custom';
      this.mapping = { r: f, g: f, b: f };
    }
  },
  methods: {
    applyPreset() {
      const p = PRESETS.find((x) => x.name === this.preset);
      if (p) this.mapping = { r: p.r, g: p.g, b: p.b };
    },
    async load(filter: string): Promise<LinearImage | undefined> {
      if (!filter) return undefined;
      const master = this.masters.find((m) => m.filter === filter);
      if (!master) return undefined;
      // The link changes on every fetch; the image only when the master does.
      const key = `${master.linear_url.split('?')[0]}@${master.updated_at}`;
      let img = cache.get(key);
      if (!img) {
        // The object is stored gzip-encoded; the browser decompresses it.
        const res = await fetch(master.linear_url);
        if (!res.ok) throw new Error(`${filter}: HTTP ${res.status}`);
        img = markRaw(parseLinear(await res.arrayBuffer()));
        cache.set(key, img);
      }
      return img;
    },
    async render() {
      const canvas = this.$refs.canvas as HTMLCanvasElement | undefined;
      if (!canvas) return;
      this.loading = true;
      this.error = '';
      try {
        const needed = new Set<string>([this.mapping.r, this.mapping.g, this.mapping.b]);
        if (this.canBlendHa && this.haBlend > 0) needed.add('H-a');
        const imgs = new Map<string, LinearImage>();
        for (const f of needed) {
          const img = await this.load(f);
          if (img) imgs.set(f, img);
        }
        const any = [...imgs.values()][0];
        if (!any) return;
        const { width, height } = any;
        const planes: (Float32Array | undefined)[] = (['r', 'g', 'b'] as Channel[]).map((c) => {
          const img = imgs.get(this.mapping[c]);
          if (!img || img.width !== width || img.height !== height) return undefined;
          if (c === 'r' && this.canBlendHa && this.haBlend > 0) {
            return this.blendHa(img.data, imgs.get('H-a')!.data);
          }
          return img.data;
        });

        const params: (StretchParams | undefined)[] = planes.map(
          (p) => (p ? autoStretch(stats(p), this.maxOf(p)) : undefined),
        );
        if (this.linked) {
          // One stretch for all channels, from their average statistics.
          const defined = planes.filter((p): p is Float32Array => !!p);
          const s = defined.map((p) => stats(p));
          const avg = {
            median: s.reduce((a, x) => a + x.median, 0) / s.length,
            madn: s.reduce((a, x) => a + x.madn, 0) / s.length,
          };
          const max = Math.max(...defined.map((p) => this.maxOf(p)));
          const p = autoStretch(avg, max);
          params.fill(p);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const out = ctx.createImageData(width, height);
        // The stacker stores linear previews top row first, like its JPEGs.
        const maxes = planes.map((p) => (p ? this.maxOf(p) : 1));
        for (let i = 0; i < width * height; i++) {
          const o = i * 4;
          for (let c = 0; c < 3; c++) {
            const plane = planes[c];
            const p = params[c];
            out.data[o + c] = plane && p ? Math.round(apply(plane[i] ?? 0, p, maxes[c] ?? 1) * 255) : 0;
          }
          out.data[o + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        this.rendered = true;
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.loading = false;
      }
    },
    // blendHa adds Ha signal that is brighter than the red channel, after
    // putting both on the same scale (median 0, σ 1), then maps the result
    // back to red's scale.
    blendHa(red: Float32Array, ha: Float32Array): Float32Array {
      const rs = stats(red);
      const hs = stats(ha);
      const r = normalize(red, rs);
      const h = normalize(ha, hs);
      const out = new Float32Array(red.length);
      const k = this.haBlend;
      for (let i = 0; i < out.length; i++) {
        if (red[i] === 0) continue;
        const ri = r[i] ?? 0;
        const v = ri + k * Math.max(0, (h[i] ?? 0) - ri);
        out[i] = v * rs.madn + rs.median;
      }
      return out;
    },
    maxOf(p: Float32Array): number {
      let m = 0;
      for (let i = 0; i < p.length; i += 7) m = Math.max(m, p[i] ?? 0);
      return m || 1;
    },
    savePNG() {
      const canvas = this.$refs.canvas as HTMLCanvasElement;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${this.preset || 'palette'}.png`;
      a.click();
    },
  },
};
</script>
