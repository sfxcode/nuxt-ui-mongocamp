<script setup>
const { $mongocampVersion } = useNuxtApp()
const { listUsers, listRoles, listCollections } = useMongocampAdmin()
const toast = useToast()
const { isAdmin } = useMongocampRoles()

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

const testCollections = [
  { label: 'Customer', fn: 'resetCustomer' },
  { label: 'Order', fn: 'resetOrder' },
  { label: 'Order Product', fn: 'resetOrderProduct' },
  { label: 'Address', fn: 'resetAddress' },
  { label: 'Product', fn: 'resetProduct' },
  { label: 'Cart', fn: 'resetCart' },
  { label: 'Images', fn: 'resetImages' },
]

const { dropAllTestCollections, resetOrder, resetProduct, resetOrderProduct, resetAddress, resetCustomer, resetCart, resetImages } = useTestData()

const resetting = ref(false)
const resetProgress = ref()
const dropping = ref(false)

async function dropTestCollections() {
  dropping.value = true
  try {
    await dropAllTestCollections()
    toast.add({ title: 'Collections dropped', description: 'All 7 test collections/buckets have been removed.', color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: 'Drop failed', description: 'Could not drop one or more test collections.', color: 'error' })
  }
  finally {
    dropping.value = false
  }
}

async function resetTestData() {
  resetting.value = true
  resetProgress.value = null
  try {
    resetProgress.value = 'Dropping'
    await dropAllTestCollections()
    resetProgress.value = 'Customer'
    await resetCustomer()
    resetProgress.value = 'Order'
    await resetOrder()
    resetProgress.value = 'Order Product'
    await resetOrderProduct()
    resetProgress.value = 'Address'
    await resetAddress()
    resetProgress.value = 'Product'
    await resetProduct()
    resetProgress.value = 'Cart'
    await resetCart()
    resetProgress.value = 'Images'
    await resetImages()
    resetProgress.value = null
    toast.add({ title: 'Test data reset', description: 'All 7 collections/buckets have been recreated.', color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: 'Reset failed', description: `Failed while resetting ${resetProgress.value}.`, color: 'error' })
  }
  finally {
    resetting.value = false
    resetProgress.value = null
  }
}
</script>

<template>
  <div
    v-if="isAdmin"
    class="flex flex-col gap-8 py-8"
  >
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

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UCard>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-database"
                class="size-5 text-(--ui-primary)"
              />
              <h2 class="font-semibold text-lg">
                Test Data
              </h2>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Recreate all test collections with fresh sample data. Existing documents are replaced.
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UBadge
                v-for="col in testCollections"
                :key="col.label"
                :label="col.label"
                variant="subtle"
                :color="resetProgress === col.label ? 'primary' : 'neutral'"
              />
            </div>
          </div>
          <UButton
            icon="i-lucide-rotate-ccw"
            label="Reset All"
            color="neutral"
            :loading="resetting"
            @click="resetTestData"
          />
        </div>
      </UCard>

      <UCard>
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-trash-2"
                class="size-5 text-(--ui-error)"
              />
              <h2 class="font-semibold text-lg">
                Drop Test Collections
              </h2>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Permanently delete all test collections without reinserting data.
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UBadge
                v-for="col in testCollections"
                :key="col.label"
                :label="col.label"
                variant="subtle"
                color="neutral"
              />
            </div>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            label="Drop All"
            color="error"
            variant="subtle"
            :loading="dropping"
            @click="dropTestCollections"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>
