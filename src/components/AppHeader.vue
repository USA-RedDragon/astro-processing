<template>
  <header>
    <h1>
      <RouterLink to="/">Astro Processing</RouterLink>
    </h1>
    <nav>
      <RouterLink to="/">Home</RouterLink>
    </nav>
    <ColorModeButton class="button" />
  </header>
</template>

<script lang="ts">
import ColorModeButton from '@/components/ColorModeButton.vue';

export default {
  components: {
    ColorModeButton,
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
