<script setup lang="ts">
defineProps<{ context?: string; title: string }>()
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <p v-if="context || $slots.context" class="text-sm text-muted-foreground">
        <slot name="context">{{ context }}</slot>
      </p>
      <h1 class="text-2xl font-semibold mt-1">{{ title }}<slot name="title" /></h1>
      <div v-if="$slots.default" class="text-sm text-muted-foreground mt-1 max-w-[72ch]">
        <slot />
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
