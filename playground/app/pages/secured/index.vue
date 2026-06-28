<script setup>
const { $mongocampVersion } = useNuxtApp()
const { listUsers, listRoles, listCollections } = useMongocampAdmin()

const { data: stats, refresh, status } = useAsyncData('dashboard-stats', async () => {
  const [users, roles, collections] = await Promise.all([
    listUsers(),
    listRoles(),
    listCollections(),
  ])
  return {
    users: users.length,
    roles: roles.length,
    collections: collections.length,
  }
})

const boxes = computed(() => [
  { label: 'Collections', value: stats.value?.collections ?? '—', icon: 'i-lucide-database', to: '/secured/admin/collections', color: 'primary' },
  { label: 'Users', value: stats.value?.users ?? '—', icon: 'i-lucide-users', to: '/secured/admin/users', color: 'sky' },
  { label: 'Roles', value: stats.value?.roles ?? '—', icon: 'i-lucide-shield', to: '/secured/admin/roles', color: 'violet' },
])
</script>

<template>
  <div class="flex flex-col gap-8 py-8">
    <div class="flex items-start justify-between">
      <div class="flex flex-col gap-1">
        <h1 class="text-3xl font-bold">
          Welcome to MongoCamp
        </h1>
        <p class="text-gray-500 dark:text-gray-400">
          MongoDB Database via REST —
          <span
            v-if="$mongocampVersion"
            class="font-medium text-gray-700 dark:text-gray-300"
          >
            {{ $mongocampVersion.name }} {{ $mongocampVersion.version }}
          </span>
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="status === 'pending'"
        aria-label="Refresh"
        @click="refresh"
      />
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NuxtLink
        v-for="box in boxes"
        :key="box.label"
        :to="box.to"
        class="group"
      >
        <UCard class="transition-shadow hover:shadow-md">
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-(--ui-primary)/10 p-3 group-hover:bg-(--ui-primary)/20 transition-colors">
              <UIcon
                :name="box.icon"
                class="size-6 text-(--ui-primary)"
              />
            </div>
            <div>
              <div class="text-3xl font-bold">
                {{ box.value }}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {{ box.label }}
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
