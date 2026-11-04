<script setup lang="ts">
// Collections grouped as ordinary / buckets / MongoCamp's own, from one `listCollections` request. MongoCamp's own
// (`mc_*`) are many and rarely wanted, so they sit in a closed group; the current collection is highlighted on every tab.
const { listCollections } = useMongocampAdmin()
const route = useRoute()
// shared between the sidebar and the narrow-screen list, so the page asks the server once
const names = useState<string[]>('collection-sidebar-names', () => [])
const failed = ref(false)
onMounted(async () => {
  if (names.value.length) return
  try {
    names.value = await listCollections()
  }
  catch {
    failed.value = true
  }
})

function collectionItem(name: string) {
  const base = `/secured/admin/collections/${encodeURIComponent(name)}`
  return { label: name, title: name, to: `${base}/data`, active: route.path === base || route.path.startsWith(`${base}/`) }
}
function bucketItem(name: string) {
  const to = `/secured/admin/buckets/${encodeURIComponent(name)}`
  return { label: name, title: name, to, active: route.path === to }
}

const groups = computed(() => {
  const user = names.value.filter(n => !n.startsWith('mc_') && !/\.(?:files|chunks)$/.test(n)).sort()
  const buckets = names.value.filter(n => n.endsWith('.files') && !n.startsWith('mc_')).map(n => n.slice(0, -6)).sort()
  const system = names.value.filter(n => n.startsWith('mc_')).sort()
  return [
    { label: 'Collections', items: user.map(collectionItem), open: true },
    { label: 'Buckets', items: buckets.map(bucketItem), open: true },
    // open when the current page is one of them
    { label: 'MongoCamp', items: system.map(collectionItem), open: system.some(n => route.path.includes(`/collections/${encodeURIComponent(n)}`)) },
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
