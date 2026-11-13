<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n, useMongocampClientApi, useMongocampStorage } from '#imports'

withDefaults(defineProps<{
  // hide the component's own heading, e.g. when the page around it already shows a title
  hideHeading?: boolean
  // hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header
  hideRefresh?: boolean
  // hide the four count cards above the table
  hideStats?: boolean
}>(), {
  hideHeading: false,
  hideRefresh: false,
  hideStats: false,
})

interface AccessRow {
  name: string
  read: boolean
  write: boolean
  administrate: boolean
}
const FLAGS = ['read', 'write', 'administrate'] as const

const { t } = useI18n()
const { authApi } = useMongocampClientApi()
const state = useMongocampStorage()

// an administrator may do everything — the server is not asked
const isAdmin = computed(() => state.value?.profile?.isAdmin === true)

const access = ref<AccessRow[]>([])
const loading = ref(false)
const loadError = ref<unknown>(null)

async function refresh() {
  if (isAdmin.value) return
  loading.value = true
  loadError.value = null
  try {
    // the server resolves roles and grants itself (`GET /auth/permissions`, server 1.7.0)
    const rows = await authApi.userPermissions({}, { signal: AbortSignal.timeout(15_000) })
    access.value = rows
      .filter(row => !row.name.startsWith('mc_'))
      .map(row => ({ name: row.name, read: row.read === true, write: row.write === true, administrate: row.administrate === true }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  catch (e: unknown) {
    loadError.value = e
    access.value = []
  }
  finally {
    loading.value = false
  }
}

const stats = computed(() => [
  { key: 'collections', label: t('nuxtUiMongocamp.userAccess.collections'), icon: 'i-lucide-database', value: access.value.length },
  { key: 'read', label: t('nuxtUiMongocamp.userAccess.canRead'), icon: 'i-lucide-eye', value: access.value.filter(r => r.read).length },
  { key: 'write', label: t('nuxtUiMongocamp.userAccess.canWrite'), icon: 'i-lucide-pencil', value: access.value.filter(r => r.write).length },
  { key: 'administrate', label: t('nuxtUiMongocamp.userAccess.canAdministrate'), icon: 'i-lucide-shield-check', value: access.value.filter(r => r.administrate).length },
])

defineExpose({ refresh })

refresh()
</script>

<template>
  <div class="flex flex-col gap-6">
    <div
      v-if="!hideHeading || !hideRefresh || $slots.toolbar"
      class="flex items-center justify-between gap-2"
    >
      <h2
        v-if="!hideHeading"
        class="text-lg font-semibold"
      >
        {{ t('nuxtUiMongocamp.userAccess.heading') }}
      </h2>
      <div class="ml-auto flex items-center gap-2">
        <UTooltip
          v-if="!isAdmin && !hideRefresh"
          :text="t('nuxtUiMongocamp.common.refresh')"
        >
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('nuxtUiMongocamp.common.refresh')"
            @click="refresh"
          />
        </UTooltip>
        <slot name="toolbar" />
      </div>
    </div>

    <UAlert
      v-if="isAdmin"
      color="info"
      variant="subtle"
      icon="i-lucide-shield-check"
      :title="t('nuxtUiMongocamp.userAccess.adminTitle')"
      :description="t('nuxtUiMongocamp.userAccess.adminDescription')"
      data-test="admin-access"
    />

    <template v-else>
      <div
        v-if="!hideStats"
        class="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <UCard
          v-for="stat in stats"
          :key="stat.key"
          :data-test="`access-stat-${stat.key}`"
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="stat.icon"
              class="size-6 text-primary"
            />
            <div>
              <div class="text-2xl font-semibold tabular-nums">
                {{ loading || loadError ? '…' : stat.value }}
              </div>
              <div class="text-sm text-muted">
                {{ stat.label }}
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <MongocampErrorAlert
        :error="loadError"
        @retry="refresh"
      />
      <MongocampEmptyState
        v-if="!loadError && !loading && !access.length"
        icon="i-lucide-lock"
        :title="t('nuxtUiMongocamp.userAccess.emptyTitle')"
        :description="t('nuxtUiMongocamp.userAccess.emptyDescription')"
      />
      <table
        v-else-if="access.length"
        class="w-full text-sm"
      >
        <thead>
          <tr class="text-left text-muted">
            <th
              scope="col"
              class="py-2 font-medium"
            >
              {{ t('nuxtUiMongocamp.userAccess.collection') }}
            </th>
            <th
              v-for="flag in FLAGS"
              :key="flag"
              scope="col"
              class="py-2 font-medium"
            >
              {{ t(`nuxtUiMongocamp.userAccess.${flag}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in access"
            :key="row.name"
            class="border-t border-default"
          >
            <th
              scope="row"
              class="py-2 text-left font-mono font-normal"
            >
              {{ row.name }}
            </th>
            <td
              v-for="flag in FLAGS"
              :key="flag"
              class="py-2"
            >
              <UBadge
                :label="row[flag] ? t('nuxtUiMongocamp.common.yes') : t('nuxtUiMongocamp.common.no')"
                :color="row[flag] ? 'success' : 'neutral'"
                variant="subtle"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
