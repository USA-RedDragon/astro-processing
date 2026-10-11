<template>
  <div>
    <AppHeader />
    <div class="container mx-auto pt-2">
      <div
        v-if="pageLoad.failed"
        role="alert"
        class="m-4 flex flex-wrap items-center gap-3 rounded-md border border-red-600 p-4 text-sm"
      >
        <span>This page failed to load.</span>
        <button
          type="button"
          class="rounded-md border px-3 py-1 font-medium hover:bg-accent cursor-pointer"
          @click="reloadPage"
        >
          Reload
        </button>
      </div>
      <RouterView />
    </div>
    <AppFooter />
    <ToastHost />
  </div>
</template>

<script lang="ts">
import { RouterView } from 'vue-router';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
import ToastHost from './components/ToastHost.vue';
import { shell, startShell } from './scheduler/shell';
import { pageLoad } from './router';

export default {
  name: 'App',
  components: {
    RouterView,
    AppHeader,
    AppFooter,
    ToastHost,
  },
  data() {
    return { pageLoad };
  },
  mounted() {
    startShell();
    document.addEventListener('click', this.closeStatus);
  },
  unmounted() {
    document.removeEventListener('click', this.closeStatus);
  },
  methods: {
    reloadPage() {
      window.location.assign(pageLoad.failed || window.location.pathname);
    },
    closeStatus(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (shell.statusOpen && t && !t.closest('.pop') && !t.closest('.status-btn')) shell.statusOpen = false;
    },
  },
};
</script>

<style scoped></style>
