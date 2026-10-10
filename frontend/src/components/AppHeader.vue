<template>
  <header ref="root" :class="{ tucked: hidden && !menuOpen && !openGroup && !shell.statusOpen }">
    <h1>
      <RouterLink to="/">Astro Processing</RouterLink>
    </h1>
    <nav class="desktop-nav" aria-label="Main">
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/calibration">Calibration</RouterLink>
      <div v-for="g in navGroups" :key="g.label" class="group">
        <button
          type="button"
          class="group-btn"
          :class="{ active: groupActive(g) }"
          aria-haspopup="true"
          :aria-expanded="openGroup === g.label"
          @click.stop="openGroup = openGroup === g.label ? '' : g.label"
        >
          {{ g.label }}
          <ChevronDown class="size-3.5" />
        </button>
        <div v-if="openGroup === g.label" class="menu" role="menu">
          <RouterLink
            v-for="it in g.items"
            :key="it.to"
            :to="it.to"
            role="menuitem"
            class="menu-item"
            :class="{ current: itemActive(it) }"
            @click="openGroup = ''"
          >
            <span class="font-medium">{{ it.label }}</span>
            <span class="text-xs text-muted-foreground">{{ it.note }}</span>
          </RouterLink>
        </div>
      </div>
    </nav>
    <div class="button flex items-center justify-end gap-2">
      <SchedulerIndicator />
      <ProcessingIndicator />
      <ColorModeButton />
      <button
        type="button"
        class="menu-btn"
        aria-label="Menu"
        :aria-expanded="menuOpen"
        @click.stop="menuOpen = !menuOpen"
      >
        <XIcon v-if="menuOpen" class="size-5" />
        <MenuIcon v-else class="size-5" />
      </button>
    </div>
    <nav v-if="menuOpen" class="mobile-nav" aria-label="Main">
      <div class="mobile-top">
        <RouterLink to="/" @click="menuOpen = false">Home</RouterLink>
        <RouterLink to="/calibration" @click="menuOpen = false">Calibration</RouterLink>
      </div>
      <div v-for="g in navGroups" :key="g.label" class="mobile-group">
        <span class="mobile-label">{{ g.label }}</span>
        <RouterLink
          v-for="it in g.items"
          :key="it.to"
          :to="it.to"
          class="mobile-item"
          :class="{ current: itemActive(it) }"
          @click="menuOpen = false"
        >
          {{ it.label }}
        </RouterLink>
      </div>
    </nav>
  </header>
</template>

<script lang="ts">
import { ChevronDown, Menu as MenuIcon, X as XIcon } from 'lucide-vue-next';
import ColorModeButton from '@/components/ColorModeButton.vue';
import ProcessingIndicator from '@/components/ProcessingIndicator.vue';
import SchedulerIndicator from '@/components/SchedulerIndicator.vue';
import { navGroups, type NavGroup, type NavItem } from '@/router/nav';
import { shell } from '@/scheduler/shell';

export default {
  components: {
    ChevronDown,
    ColorModeButton,
    MenuIcon,
    ProcessingIndicator,
    SchedulerIndicator,
    XIcon,
  },
  data: function() {
    return {
      hidden: false,
      lastY: 0,
      navGroups,
      openGroup: '',
      menuOpen: false,
      shell,
    };
  },
  watch: {
    $route() {
      this.openGroup = '';
      this.menuOpen = false;
    },
  },
  mounted() {
    this.lastY = window.scrollY;
    window.addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('click', this.closeOutside);
  },
  unmounted() {
    window.removeEventListener('scroll', this.onScroll);
    document.removeEventListener('click', this.closeOutside);
  },
  methods: {
    // Hides the header while scrolling down and shows it again on any
    // scroll up. Small movements are ignored so it doesn't flicker.
    onScroll() {
      const y = window.scrollY;
      const delta = y - this.lastY;
      if (Math.abs(delta) < 4) {
        return;
      }
      this.hidden = delta > 0 && y > (this.$el as HTMLElement).offsetHeight;
      this.lastY = y;
    },
    closeOutside(e: MouseEvent) {
      const root = this.$refs.root as HTMLElement | undefined;
      if (root && !root.contains(e.target as Node)) {
        this.openGroup = '';
        this.menuOpen = false;
      }
    },
    itemActive(it: NavItem): boolean {
      const name = String(this.$route.name ?? '');
      const nav = String(this.$route.meta.nav ?? '');
      return it.names.includes(name) || (nav !== '' && it.names.includes(nav)) ||
        (it.to.includes('?') && this.$route.fullPath === it.to);
    },
    groupActive(g: NavGroup): boolean {
      return g.items.some((it) => this.itemActive(it));
    },
  },
};
</script>

<style scoped>
header {
  position: sticky;
  top: 0;
  z-index: 50;
  transition: transform 0.2s ease;
  min-height: 3em;
  padding: 0.5em;
  margin: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: var(--secondary);
}

header.tucked:not(:focus-within) {
  transform: translateY(-100%);
}

header h1,
.desktop-nav,
.button {
  font-size: 1rem;
}

header h1 {
  flex: 1 1 0;
  white-space: nowrap;
}

.button {
  flex: 1 1 0;
  text-align: right;
}

.desktop-nav {
  display: none;
  align-items: center;
  justify-content: center;
}

.desktop-nav > a,
.group {
  padding: 0 1rem;
  border-left: 1px solid #444;
}

.desktop-nav > a:first-of-type {
  border: 0;
}

.desktop-nav .router-link-active,
.group-btn.active {
  color: var(--secondary-foreground) !important;
  font-weight: bolder;
}

.group {
  position: relative;
}

.group-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}

.menu {
  position: absolute;
  left: 50%;
  top: calc(100% + 0.75rem);
  transform: translateX(-50%);
  z-index: 60;
  width: 18rem;
  display: flex;
  flex-direction: column;
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) - 2px);
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: 0 10px 30px oklch(0 0 0 / 0.2);
  text-align: left;
}

.menu-item {
  display: flex;
  flex-direction: column;
  padding: 0.375rem 0.625rem;
  border-radius: calc(var(--radius) - 4px);
  font-size: 0.875rem;
  line-height: 1.35;
}

.menu-item:hover,
.menu-item.current {
  background: var(--accent);
}

.menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  cursor: pointer;
}

.mobile-nav {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 0.25rem 0.5rem;
  font-size: 0.9375rem;
}

.mobile-top {
  display: flex;
  gap: 1.25rem;
}

.mobile-group {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
}

.mobile-label {
  flex-basis: 100%;
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.mobile-nav .router-link-active,
.mobile-item.current {
  font-weight: bolder;
}

@media (min-width: 1024px) {
  .desktop-nav {
    display: flex;
  }

  .menu-btn,
  .mobile-nav {
    display: none;
  }
}
</style>
