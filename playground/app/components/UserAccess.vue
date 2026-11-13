<script setup>
// What the signed-in (non-administrator) user may do, per collection. The server resolves roles and grants
// (`GET /auth/permissions`); administrators may do everything and are not asked.
const { authApi } = useMongocampClientApi()
const { isAdmin } = useMongocampRoles()

const access = ref([])
const loading = ref(false)
const failed = ref(false)

async function load() {
  if (isAdmin.value) return
  loading.value = true
  failed.value = false
  try {
    const rows = await authApi.userPermissions({}, { signal: AbortSignal.timeout(15000) })
    access.value = rows
      .filter(row => !row.name.startsWith('mc_'))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  catch {
    failed.value = true
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

const stats = computed(() => [
  { label: 'Collections', icon: 'i-lucide-database', value: access.value.length },
  { label: 'Can read', icon: 'i-lucide-eye', value: access.value.filter(r => r.read).length },
  { label: 'Can write', icon: 'i-lucide-pencil', value: access.value.filter(r => r.write).length },
  { label: 'Can administrate', icon: 'i-lucide-shield-check', value: access.value.filter(r => r.administrate).length },
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UCard
        v-for="stat in stats"
        :key="stat.label"
      >
        <div class="flex items-center gap-3">
          <UIcon
            :name="stat.icon"
            class="size-6 text-(--ui-primary)"
          />
          <div>
            <div class="text-2xl font-semibold">
              {{ loading ? '…' : stat.value }}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ stat.label }}
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold text-lg">
            Your access
          </h2>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Reload"
            :loading="loading"
            @click="load"
          />
        </div>
      </template>

      <UAlert
        v-if="failed"
        color="error"
        variant="subtle"
        title="Could not load your permissions"
        description="Your session may have expired, or the server cannot be reached."
      />
      <MongocampEmptyState
        v-else-if="!loading && !access.length"
        icon="i-lucide-lock"
        title="No collections yet"
        description="No collection has been granted to you. Ask an administrator for access."
      />
      <table
        v-else
        class="w-full text-sm"
      >
        <thead>
          <tr class="text-left text-gray-500 dark:text-gray-400">
            <th class="py-2 font-medium">
              Collection
            </th>
            <th class="py-2 font-medium">
              Read
            </th>
            <th class="py-2 font-medium">
              Write
            </th>
            <th class="py-2 font-medium">
              Administrate
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in access"
            :key="row.name"
            class="border-t border-(--ui-border)"
          >
            <td class="py-2 font-mono">
              {{ row.name }}
            </td>
            <td
              v-for="flag in ['read', 'write', 'administrate']"
              :key="flag"
              class="py-2"
            >
              <UBadge
                :label="row[flag] ? 'yes' : 'no'"
                :color="row[flag] ? 'success' : 'neutral'"
                variant="subtle"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>
  </div>
</template>
