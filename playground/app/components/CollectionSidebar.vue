<script setup lang="ts">
// Collections grouped as ordinary / buckets / MongoCamp's own, from one `listCollections` request.
const { listCollections } = useMongocampAdmin()
const names = ref<string[]>([])
const failed = ref(false)
onMounted(async () => {
  try {
    names.value = await listCollections()
  }
  catch {
    failed.value = true
  }
})

const groups = computed(() => {
  const user = names.value.filter(n => !n.startsWith('mc_') && !/\.(?:files|chunks)$/.test(n)).sort()
  const buckets = names.value.filter(n => n.endsWith('.files') && !n.startsWith('mc_')).map(n => n.slice(0, -6)).sort()
  const system = names.value.filter(n => n.startsWith('mc_')).sort()
  return [
    { label: 'Collections', items: user.map(n => ({ label: n, to: `/secured/admin/collections/${encodeURIComponent(n)}/data` })) },
    { label: 'Buckets', items: buckets.map(n => ({ label: n, to: `/secured/admin/buckets/${encodeURIComponent(n)}` })) },
    { label: 'MongoCamp', items: system.map(n => ({ label: n, to: `/secured/admin/collections/${encodeURIComponent(n)}/data` })) },
  ].filter(g => g.items.length)
})
</script>

<template>
  <nav
    class="flex flex-col gap-3 text-sm"
    aria-label="Collections"
  >
    <p
      v-if="failed"
      class="text-dimmed"
    >
      Collections could not be loaded.
    </p>
    <div
      v-for="group in groups"
      :key="group.label"
    >
      <h3 class="px-2 pb-1 text-xs font-medium uppercase text-dimmed">
        {{ group.label }}
      </h3>
      <UNavigationMenu
        orientation="vertical"
        :items="group.items"
      />
    </div>
  </nav>
</template>
