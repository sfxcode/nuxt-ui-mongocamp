<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n, useMongocampPaths } from '#imports'
import { useNuxtApp } from '#app'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import { useMongocampAutoRefresh } from '../composables/useMongocampAutoRefresh'
import { useMongocampAdminGate } from '../composables/useMongocampAdminGate'

const props = withDefaults(defineProps<{
  collectionsPath?: string
  usersPath?: string
  rolesPath?: string
  // reload the counts every N seconds (at least 1; 0 = off). Pauses while the tab is hidden and slows down after failures.
  autoRefresh?: number
  // hide the component's own heading, e.g. when the page around it already shows a title
  hideHeading?: boolean
  // hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header
  hideRefresh?: boolean
}>(), {
  autoRefresh: 0,
  hideHeading: false,
})

const { t } = useI18n()
const paths = useMongocampPaths()
const { $mongocampVersion } = useNuxtApp()
const { listUsers, listRoles, listCollections } = useMongocampAdmin()

// `$mongocampVersion` is provided by the module's runtime plugin as a Ref
const version = computed(() => $mongocampVersion.value)

const stats = ref<{ collections: number, users: number, roles: number } | null>(null)
const loading = ref(false)
const loadError = ref<unknown>(null)

async function refresh() {
  loading.value = true
  loadError.value = null
  try {
    const [users, roles, collections] = await Promise.all([listUsers(), listRoles(), listCollections()])
    stats.value = { users: users.length, roles: roles.length, collections: collections.length }
  }
  catch (e: unknown) {
    loadError.value = e
    stats.value = null
  }
  finally {
    loading.value = false
  }
}

// a background reload keeps the numbers on screen when it fails (the error banner shows it) — only the button blanks them
async function reloadQuietly() {
  try {
    const [users, roles, collections] = await Promise.all([listUsers(), listRoles(), listCollections()])
    stats.value = { users: users.length, roles: roles.length, collections: collections.length }
    loadError.value = null
  }
  catch (e: unknown) {
    loadError.value = e
    throw e
  }
}

const { blocked, message } = useMongocampAdminGate()
const auto = useMongocampAutoRefresh(reloadQuietly, { intervalMs: () => props.autoRefresh * 1000 })
function syncAutoRefresh() {
  auto.stop()
  if (!blocked.value && props.autoRefresh > 0) auto.start()
}
onMounted(syncAutoRefresh)
watch(() => props.autoRefresh, syncAutoRefresh)

const boxes = computed(() => [
  { key: 'collections', label: t('nuxtUiMongocamp.dashboard.collections'), icon: 'i-lucide-database', to: props.collectionsPath ?? paths.collections },
  { key: 'users', label: t('nuxtUiMongocamp.dashboard.users'), icon: 'i-lucide-users', to: props.usersPath ?? paths.users },
  { key: 'roles', label: t('nuxtUiMongocamp.dashboard.roles'), icon: 'i-lucide-shield', to: props.rolesPath ?? paths.roles },
] as const)

// lets a parent that changes data behind the dashboard's back (e.g. a reset button in the slot) re-count
defineExpose({ refresh })

if (!blocked.value) refresh()
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex items-start justify-between">
      <div
        v-if="!hideHeading"
        class="flex flex-col gap-1"
      >
        <h1 class="text-3xl font-bold">
          {{ t('nuxtUiMongocamp.dashboard.heading') }}
        </h1>
        <p class="text-dimmed">
          {{ t('nuxtUiMongocamp.dashboard.subtitle') }}
          <span
            v-if="version"
            class="font-medium text-default"
          >
            {{ version.name }} {{ version.version }}
          </span>
        </p>
      </div>
      <UTooltip
        v-if="!blocked && !hideRefresh"
        class="ml-auto"
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
    </div>

    <MongocampEmptyState
      v-if="blocked"
      icon="i-lucide-shield-alert"
      :title="message"
      data-test="admin-only"
    />
    <MongocampErrorAlert
      v-if="!blocked"
      :error="loadError"
      @retry="refresh"
    />

    <div
      v-if="!blocked"
      class="grid grid-cols-1 gap-4 sm:grid-cols-3"
    >
      <NuxtLink
        v-for="box in boxes"
        :key="box.key"
        :to="box.to"
        class="group"
      >
        <UCard class="transition-shadow hover:shadow-md">
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-primary/10 p-3 transition-colors group-hover:bg-primary/20">
              <UIcon
                :name="box.icon"
                class="size-6 text-primary"
              />
            </div>
            <div>
              <USkeleton
                v-if="loading && !stats"
                class="h-9 w-12"
              />
              <div
                v-else
                class="tabular-nums text-3xl font-bold"
              >
                {{ stats?.[box.key] ?? '—' }}
              </div>
              <div class="text-sm text-dimmed">
                {{ box.label }}
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>

    <slot />
  </div>
</template>
