<template>
  <header>
    <h1>
      <RouterLink to="/">Astro Processing</RouterLink>
    </h1>
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/calibration">Calibration</RouterLink>
    </nav>
    <div class="button flex items-center justify-end gap-2">
      <ProcessingIndicator />
      <ColorModeButton />
    </div>
  </header>
</template>

<script lang="ts">
import ColorModeButton from '@/components/ColorModeButton.vue';
import ProcessingIndicator from '@/components/ProcessingIndicator.vue';

export default {
  components: {
    ColorModeButton,
    ProcessingIndicator,
  },
  data: function() {
    return {
    };
  },
  mounted() {},
  methods: {
  },
  computed: {
  },
};
</script>

<style scoped>
header {
  height: 3em;
  padding: 0.5em;
  margin: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: var(--secondary);
}

header h1,
header nav,
.button {
  font-size: 1rem;
  width: 33%;
}

.button {
  text-align: right;
}

header h1,
header nav {
  display: inline;
}

header nav .router-link-active,
.adminNavLink.router-link-active {
  color: var(--secondary-foreground) !important;
  font-weight: bolder;
}

nav {
  text-align: center;
}

nav a {
  padding: 0 1rem;
  border-left: 1px solid #444;
}

nav a:first-of-type {
  border: 0;
}
</style>
