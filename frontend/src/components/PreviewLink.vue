<template>
  <button
    type="button"
    class="underline decoration-dotted underline-offset-2 hover:text-foreground text-left"
    :class="url ? 'cursor-zoom-in' : 'cursor-help'"
    :aria-label="url ? `Preview of ${fileName}` : `${fileName}: no preview, ${missingText}`"
    @mouseenter="onEnter"
    @mousemove="onMove"
    @mouseleave="onLeave"
    @click="onClick"
  >
    {{ fileName }}
  </button>
  <Teleport to="body">
    <!-- Hover: a floating preview next to the cursor. -->
    <div
      v-if="hovering"
      class="fixed z-50 pointer-events-none rounded-md border bg-background p-1 shadow-lg"
      :style="floatStyle"
    >
      <p v-if="!url" class="px-2 py-1 text-xs text-muted-foreground max-w-xs">No preview: {{ missingText }}</p>
      <p v-else-if="state === 'failed'" class="px-2 py-1 text-xs text-muted-foreground max-w-xs">{{ failedText }}</p>
      <template v-else>
        <p v-if="state === 'loading'" class="px-2 py-1 text-xs text-muted-foreground">Loading preview…</p>
        <img
          :src="src"
          :alt="fileName"
          class="block max-w-[min(480px,90vw)] max-h-[360px]"
          :class="{ hidden: state === 'loading' }"
          @load="onLoad"
          @error="onError"
        >
      </template>
    </div>
    <!-- Touch: full screen until tapped again. -->
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/90 p-4"
      @click="open = false"
    >
      <p v-if="!url" class="text-sm text-white/80 text-center">No preview: {{ missingText }}</p>
      <p v-else-if="state === 'failed'" class="text-sm text-white/80 text-center">{{ failedText }}</p>
      <template v-else>
        <p v-if="state === 'loading'" class="text-sm text-white/80">Loading preview…</p>
        <img
          :src="src"
          :alt="fileName"
          class="max-w-full max-h-[85vh] object-contain"
          :class="{ hidden: state === 'loading' }"
          @load="onLoad"
          @error="onError"
        >
      </template>
      <span class="text-xs text-white/80 break-all text-center">{{ fileName }}</span>
      <span class="text-xs text-white/60">Tap anywhere to close</span>
    </div>
  </Teleport>
</template>

<script lang="ts">
// Preview size on screen, used to keep the floating image inside the window.
const FLOAT_W = 490;
const FLOAT_H = 370;
const OFFSET = 16;
// A remembered link is not reused this close to its expiry.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

// loaded remembers the link each file's preview last loaded from, so when a
// refresh signs the same preview again the browser shows it from its cache
// instead of downloading it again under the new signature.
const loaded = new Map<string, string>();

export function clearPreviewCache() {
  loaded.clear();
}

// signedUntil reads when a presigned S3 link expires from its X-Amz-Date and
// X-Amz-Expires parameters; 0 when it has neither.
export function signedUntil(link: string): number {
  try {
    const q = new URL(link).searchParams;
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(q.get('X-Amz-Date') ?? '');
    const ttl = Number(q.get('X-Amz-Expires'));
    if (!m || !ttl) return 0;
    const [, y, mo, d, h, mi, se] = m.map(Number);
    return Date.UTC(y!, mo! - 1, d!, h!, mi!, se!) + ttl * 1000;
  } catch {
    return 0;
  }
}

export default {
  name: 'PreviewLink',
  props: {
    fileName: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      default: undefined,
    },
    missing: {
      type: String,
      default: undefined,
    },
  },
  emits: ['stale'],
  data() {
    return {
      hovering: false,
      open: false,
      x: 0,
      y: 0,
      src: '',
      state: 'loading' as 'loading' | 'loaded' | 'failed',
      askedForNew: false,
      retried: false,
    };
  },
  computed: {
    missingText(): string {
      return this.missing || 'none rendered yet';
    },
    failedText(): string {
      return this.retried
        ? 'The preview did not load. Its file may be gone from storage.'
        : 'The preview did not load; its link may have expired. Fetching a new one.';
    },
    floatStyle(): Record<string, string> {
      // Prefer below-right of the cursor; flip when that would leave the window.
      let left = this.x + OFFSET;
      let top = this.y + OFFSET;
      if (left + FLOAT_W > window.innerWidth) left = Math.max(0, this.x - OFFSET - FLOAT_W);
      if (top + FLOAT_H > window.innerHeight) top = Math.max(0, this.y - OFFSET - FLOAT_H);
      return { left: `${left}px`, top: `${top}px` };
    },
  },
  watch: {
    url() {
      if (this.state === 'failed') {
        this.retried = this.askedForNew;
        this.show();
      } else if ((this.hovering || this.open) && this.src !== this.url) {
        this.show();
      }
    },
  },
  mounted() {
    window.addEventListener('keydown', this.onKey);
  },
  unmounted() {
    window.removeEventListener('keydown', this.onKey);
  },
  methods: {
    // Touch screens fire mouseenter on tap too, so hover only counts on
    // devices with a precise pointer that can actually hover.
    canHover(): boolean {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    },
    // show picks the link to load: the one that loaded before while it is
    // still valid, else the newest.
    show() {
      const before = loaded.get(this.fileName);
      const next = before && signedUntil(before) - EXPIRY_MARGIN_MS > Date.now() ? before : (this.url ?? '');
      if (next === this.src && this.state !== 'failed') return;
      this.src = next;
      this.state = 'loading';
    },
    onEnter(e: MouseEvent) {
      if (!this.canHover()) return;
      this.x = e.clientX;
      this.y = e.clientY;
      this.hovering = true;
      if (this.url) this.show();
    },
    onMove(e: MouseEvent) {
      this.x = e.clientX;
      this.y = e.clientY;
    },
    onLeave() {
      this.hovering = false;
    },
    onClick() {
      if (this.canHover() && this.url && this.state === 'loaded') {
        window.open(this.src, '_blank', 'noopener');
        return;
      }
      this.hovering = false;
      this.open = true;
      if (this.url) this.show();
    },
    onLoad() {
      this.state = 'loaded';
      loaded.set(this.fileName, this.src);
    },
    onError() {
      if (loaded.get(this.fileName) === this.src) loaded.delete(this.fileName);
      if (this.src !== this.url && this.url) {
        this.src = this.url;
        return;
      }
      this.state = 'failed';
      if (!this.askedForNew) {
        this.askedForNew = true;
        this.$emit('stale');
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') this.open = false;
    },
  },
};
</script>
