<template>
  <div>
    <AppHeader />
    <div class="container mx-auto pt-2">
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

export default {
  name: 'App',
  components: {
    RouterView,
    AppHeader,
    AppFooter,
    ToastHost,
  },
  mounted() {
    startShell();
    document.addEventListener('click', this.closeStatus);
  },
  unmounted() {
    document.removeEventListener('click', this.closeStatus);
  },
  methods: {
    closeStatus(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (shell.statusOpen && t && !t.closest('.pop') && !t.closest('.status-btn')) shell.statusOpen = false;
    },
  },
};
</script>

<style scoped></style>
