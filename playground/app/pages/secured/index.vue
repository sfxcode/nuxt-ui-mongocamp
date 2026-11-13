<script setup>
const toast = useToast()
const { isAdmin, isManager } = useMongocampRoles()
const state = useMongocampStorage()
const dashboard = ref(null)

const profile = computed(() => state.value?.profile)

const roleLabel = computed(() => isAdmin.value ? 'Administrator' : isManager.value ? 'Manager' : 'Standard user')

const adminLinks = [
  { label: 'Overview', description: 'Storage, biggest collections, jobs', icon: 'i-lucide-gauge', to: '/secured/admin/overview' },
  { label: 'Collections', description: 'Browse, copy, rename, drop', icon: 'i-lucide-database', to: '/secured/admin/collections' },
  { label: 'Users', description: 'Accounts, roles, API keys', icon: 'i-lucide-users', to: '/secured/admin/users' },
  { label: 'Roles', description: 'Roles and their grants', icon: 'i-lucide-shield', to: '/secured/admin/roles' },
  { label: 'Permissions', description: 'Who can access what', icon: 'i-lucide-key-round', to: '/secured/admin/permissions' },
  { label: 'Jobs', description: 'Scheduled background jobs', icon: 'i-lucide-clock', to: '/secured/admin/jobs' },
  { label: 'Databases', description: 'Databases and sizes', icon: 'i-lucide-server', to: '/secured/admin/databases' },
  { label: 'Server', description: 'MongoDB version, load, capabilities', icon: 'i-lucide-cpu', to: '/secured/admin/server' },
  { label: 'Settings', description: 'Plugins, cluster, configuration', icon: 'i-lucide-settings', to: '/secured/admin/settings' },
]

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
const pendingAction = ref(null)

async function runPendingAction() {
  const action = pendingAction.value
  pendingAction.value = null
  if (action === 'reset') await resetTestData()
  if (action === 'drop') await dropTestCollections()
}

async function dropTestCollections() {
  dropping.value = true
  try {
    await dropAllTestCollections()
    toast.add({ title: 'Collections dropped', description: 'All 7 test collections/buckets have been removed.', color: 'success' })
    await dashboard.value?.refresh()
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
    await dashboard.value?.refresh()
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
  <div class="flex flex-col gap-6 py-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">
          Welcome<span v-if="profile?.user">, {{ profile.user }}</span>
        </h1>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :label="roleLabel"
            :color="isAdmin ? 'error' : isManager ? 'warning' : 'neutral'"
            variant="subtle"
          />
          <UBadge
            v-for="role in profile?.roles ?? []"
            :key="role"
            :label="role"
            color="neutral"
            variant="outline"
          />
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <MongocampVersion />
        <UButton
          label="Account"
          icon="i-lucide-user"
          to="/secured/account"
          color="neutral"
          variant="outline"
        />
      </div>
    </div>

    <!-- Everyone who is not an administrator: what they may access -->
    <template v-if="!isAdmin">
      <UCard v-if="isManager">
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col gap-1">
            <h2 class="font-semibold text-lg">
              Manager area
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Your role gives you access to the manager pages.
            </p>
          </div>
          <UButton
            label="Open"
            icon="i-lucide-layout-dashboard"
            to="/secured/manager"
          />
        </div>
      </UCard>

      <MongocampUserAccess />
    </template>

    <!-- Administrators: server dashboard, shortcuts, test data -->
    <MongocampDashboard
      v-else
      ref="dashboard"
    >
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UCard
          v-for="link in adminLinks"
          :key="link.to"
          :ui="{ root: 'hover:ring-(--ui-primary) transition' }"
        >
          <NuxtLink
            :to="link.to"
            class="flex items-start gap-3"
          >
            <UIcon
              :name="link.icon"
              class="mt-0.5 size-5 shrink-0 text-(--ui-primary)"
            />
            <div class="flex flex-col">
              <span class="font-semibold">{{ link.label }}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400">{{ link.description }}</span>
            </div>
          </NuxtLink>
        </UCard>
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
              @click="pendingAction = 'reset'"
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
              @click="pendingAction = 'drop'"
            />
          </div>
        </UCard>
      </div>

      <UModal
        :open="pendingAction !== null"
        :title="pendingAction === 'drop' ? 'Drop all test collections?' : 'Reset all test data?'"
        :description="pendingAction === 'drop'
          ? 'This permanently deletes all 7 test collections and buckets.'
          : 'This drops and recreates all 7 test collections and buckets. Existing documents are replaced.'"
        @update:open="open => { if (!open) pendingAction = null }"
      >
        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="pendingAction = null"
          />
          <UButton
            :label="pendingAction === 'drop' ? 'Drop all' : 'Reset all'"
            :color="pendingAction === 'drop' ? 'error' : 'primary'"
            @click="runPendingAction"
          />
        </template>
      </UModal>
    </MongocampDashboard>
  </div>
</template>
