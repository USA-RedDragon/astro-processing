<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{
  headline: string
  lines: string[]
}>()
</script>

<template>
  <section class="card moon-note" role="status" aria-labelledby="mkn-h" data-testid="moon-note">
    <h2 id="mkn-h">{{ headline }}</h2>
    <p v-for="(l, i) in lines" :key="i" class="small" style="margin: 0">{{ l }}</p>
    <p class="xsmall muted" style="margin: 0">
      From the share of past subs the stacker kept with the Moon this bright and this high. The
      scheduler still takes them when the night's measured sky quality is good.
      <RouterLink to="/rule-weights" class="underline">See the kept rates</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.moon-note {
  border-left: 3px solid var(--warn);
}
</style>
