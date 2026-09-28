<template>
  <span v-if="!url">{{ fileName }}</span>
  <template v-else>
    <button
      type="button"
      class="underline decoration-dotted underline-offset-2 hover:text-foreground cursor-zoom-in text-left"
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
        <img :src="url" :alt="fileName" class="block max-w-[480px] max-h-[360px]">
      </div>
      <!-- Touch: full screen until tapped again. -->
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/90 p-4"
        @click="open = false"
      >
        <img :src="url" :alt="fileName" class="max-w-full max-h-[85vh] object-contain">
        <span class="text-xs text-white/80 break-all text-center">{{ fileName }}</span>
      </div>
    </Teleport>
  </template>
</template>

<script lang="ts">
// Preview size on screen, used to keep the floating image inside the window.
const FLOAT_W = 490;
const FLOAT_H = 370;
const OFFSET = 16;

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
  },
  data() {
    return {
      hovering: false,
      open: false,
      x: 0,
      y: 0,
    };
  },
  computed: {
    floatStyle(): Record<string, string> {
      // Prefer below-right of the cursor; flip when that would leave the window.
      let left = this.x + OFFSET;
      let top = this.y + OFFSET;
      if (left + FLOAT_W > window.innerWidth) left = Math.max(0, this.x - OFFSET - FLOAT_W);
      if (top + FLOAT_H > window.innerHeight) top = Math.max(0, this.y - OFFSET - FLOAT_H);
      return { left: `${left}px`, top: `${top}px` };
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
    onEnter(e: MouseEvent) {
      if (!this.canHover()) return;
      this.x = e.clientX;
      this.y = e.clientY;
      this.hovering = true;
    },
    onMove(e: MouseEvent) {
      this.x = e.clientX;
      this.y = e.clientY;
    },
    onLeave() {
      this.hovering = false;
    },
    onClick() {
      if (this.canHover()) {
        window.open(this.url, '_blank', 'noopener');
        return;
      }
      this.open = true;
    },
    onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') this.open = false;
    },
  },
};
</script>
