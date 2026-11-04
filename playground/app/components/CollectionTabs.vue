<script setup lang="ts">
// The glue every collection page shares: the name, and Data | Overview | Aggregate tabs. Kept in the playground
// (phase 13 option a) — it is a few lines, so the module ships no shell component.
const props = defineProps<{ collectionName: string }>()
const base = computed(() => `/secured/admin/collections/${encodeURIComponent(props.collectionName)}`)
const items = computed(() => [
  { label: 'Data', icon: 'i-lucide-table', to: `${base.value}/data` },
  { label: 'Overview', icon: 'i-lucide-info', to: base.value, exact: true },
  { label: 'Aggregate', icon: 'i-lucide-sigma', to: `${base.value}/aggregate` },
])
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-xl font-semibold">
      {{ collectionName }}
    </h2>
    <UNavigationMenu
      :items="items"
      highlight
      class="-mx-2"
    />
  </div>
</template>
