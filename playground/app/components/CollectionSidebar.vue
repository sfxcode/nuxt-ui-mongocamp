<script setup lang="ts">
// Collections grouped as ordinary / buckets / MongoCamp's own, from the module's shared list (one request for the sidebar
// and the narrow-screen list together; the collections table keeps it current). MongoCamp's own (`mc_*`) are many and
// rarely wanted, so they sit in a closed group; the current collection is highlighted on every tab.
const { collections, buckets, system, status, load } = useMongocampCollectionNames()
const paths = useMongocampPaths()
const route = useRoute()
onMounted(() => load())

function collectionItem(name: string) {
  const base = `${paths.collections}/${encodeURIComponent(name)}`
  return { label: name, title: name, to: `${base}/data`, active: route.path === base || route.path.startsWith(`${base}/`) }
}
function bucketItem(name: string) {
  const to = `${paths.buckets}/${encodeURIComponent(name)}`
  return { label: name, title: name, to, active: route.path === to }
}

const groups = computed(() => [
  { label: 'Collections', items: collections.value.map(collectionItem), open: true },
  { label: 'Buckets', items: buckets.value.map(bucketItem), open: true },
  // open when the current page is one of them
  { label: 'MongoCamp', items: system.value.map(collectionItem), open: system.value.some(n => route.path.includes(`/collections/${encodeURIComponent(n)}`)) },
].filter(g => g.items.length))
</script>

<template>
  <nav
    class="flex flex-col gap-3 text-sm"
    aria-label="Collections"
  >
    <p
      v-if="status === 'failed'"
      class="text-dimmed"
    >
      Collections could not be loaded.
    </p>
    <details
      v-for="group in groups"
      :key="group.label"
      :open="group.open"
    >
      <summary class="cursor-pointer px-2 pb-1 text-xs font-medium uppercase text-dimmed">
        {{ group.label }} ({{ group.items.length }})
      </summary>
      <UNavigationMenu
        orientation="vertical"
        :items="group.items"
      />
    </details>
  </nav>
</template>
