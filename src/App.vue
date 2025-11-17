<template>
  <div>
    <AppHeader />
    <div class="container mx-auto pt-2">
      <RouterView />
    </div>
    <AppFooter />
  </div>
</template>

<script lang="ts">
import { RouterView } from 'vue-router';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';

export default {
  name: 'App',
  components: {
    RouterView,
    AppHeader,
    AppFooter,
  },
  data() {
    return {
    };
  },
  created() {},
  mounted() {
    this.fetchData();
  },
  unmounted() {
  },
  methods: {
    fetchData() {
    },
  },
  computed: {
  },
};
</script>

<style scoped></style>
