<script setup lang="ts">
import { computed, onMounted, ref, resolveComponent, watch } from 'vue'
import { useI18n, useMongocampAdminGate, useMongocampAutoRefresh, useMongocampPaths, useMongocampProxyMode, useMongocampRoles, useMongocampStorage, useMongocampSystem } from '#imports'
import { useNuxtApp } from '#app'
import { connectionUsage, formatCount, formatUptime } from '../utils/serverInfo'
import { outcomeOfError, serverHealth } from '../utils/serverStatus'
import type { Outcome } from '../utils/serverStatus'

const props = withDefaults(defineProps<{
  // only a coloured dot with the health text as its tooltip — for a collapsed sidebar
  collapsed?: boolean
  // reload every N seconds (0 = off). Pauses while the tab is hidden and slows down while the server is away.
  autoRefresh?: number
  // where the block links to for whoever may see the admin area; defaults to the module option `paths.server`, '' = no link
  detailsPath?: string
}>(), {
  collapsed: false,
  autoRefresh: 30,
})

const { t } = useI18n()
const paths = useMongocampPaths()
const { $mongocampVersion } = useNuxtApp()
const { getStats, getServerInfo } = useMongocampSystem()
const { canSeeAdmin } = useMongocampRoles()
const { blocked } = useMongocampAdminGate()
const state = useMongocampStorage()
const isProxyMode = useMongocampProxyMode()

// `$mongocampVersion` is provided by the module's runtime plugin as a Ref
const server = computed(() => $mongocampVersion.value)

const mongoDbVersion = ref<string>()
const connections = ref<{ current: number, available: number }>()
const uptimeSeconds = ref<number>()
const outcome = ref<{ info: Outcome, stats: Outcome }>({ info: 'skipped', stats: 'skipped' })

// both requests need a login; the load is for administrators (a known non-administrator is not asked at all)
const canAskInfo = computed(() => isProxyMode || !!state.value?.profile)
const canAskStats = computed(() => canAskInfo.value && !blocked.value)

async function refresh() {
  const [info, stats] = await Promise.allSettled([
    canAskInfo.value ? getServerInfo() : Promise.reject(new Error('skipped')),
    canAskStats.value ? getStats() : Promise.reject(new Error('skipped')),
  ])

  mongoDbVersion.value = info.status === 'fulfilled' ? info.value.mongoDbVersion || undefined : undefined
  const current = stats.status === 'fulfilled' ? stats.value.connections?.current : undefined
  const available = stats.status === 'fulfilled' ? stats.value.connections?.available : undefined
  connections.value = typeof current === 'number' && typeof available === 'number' ? { current, available } : undefined
  const uptime = stats.status === 'fulfilled' ? stats.value.uptimeSeconds : undefined
  uptimeSeconds.value = typeof uptime === 'number' ? uptime : undefined

  outcome.value = {
    info: !canAskInfo.value ? 'skipped' : info.status === 'fulfilled' ? 'ok' : outcomeOfError(info.reason),
    stats: !canAskStats.value ? 'skipped' : stats.status === 'fulfilled' ? 'ok' : outcomeOfError(stats.reason),
  }
  // lets the refresh loop back off while the server is away
  if (health.value === 'down' && canAskInfo.value) throw info.status === 'rejected' ? info.reason : new Error('server unreachable')
}

const health = computed(() => serverHealth({ ...outcome.value, hasConnections: !!connections.value, versionKnown: !!server.value }))
const healthLabel = computed(() => t(`nuxtUiMongocamp.serverStatus.${health.value}`))
const dotClass = computed(() => ({ ok: 'bg-success', partial: 'bg-warning', down: 'bg-error' }[health.value]))

const usage = computed(() => connections.value ? connectionUsage(connections.value.current, connections.value.available) : null)
const versions = computed(() => [
  server.value?.version ? `MongoCamp ${server.value.version}` : undefined,
  mongoDbVersion.value ? `MongoDB ${mongoDbVersion.value}` : undefined,
].filter((entry): entry is string => Boolean(entry)))

const linkTarget = computed(() => (canSeeAdmin.value ? (props.detailsPath ?? paths.server) : ''))
const NuxtLink = resolveComponent('NuxtLink')

const auto = useMongocampAutoRefresh(refresh, { intervalMs: () => props.autoRefresh * 1000 })
function syncAutoRefresh() {
  auto.stop()
  if (props.autoRefresh > 0) auto.start()
}
const quietRefresh = () => refresh().catch(() => {})
onMounted(() => {
  quietRefresh()
  syncAutoRefresh()
})
watch(() => props.autoRefresh, syncAutoRefresh)
// a login or logout changes what may be asked
watch(canAskInfo, quietRefresh)

defineExpose({ refresh: quietRefresh })
</script>

<template>
  <UTooltip
    v-if="collapsed"
    :text="healthLabel"
  >
    <div
      class="flex justify-center py-1.5"
      role="status"
      :aria-label="healthLabel"
      data-test="server-status"
      :data-health="health"
    >
      <span
        class="size-2.5 rounded-full"
        :class="dotClass"
      />
    </div>
  </UTooltip>

  <component
    :is="linkTarget ? NuxtLink : 'div'"
    v-else
    :to="linkTarget || undefined"
    class="flex flex-col gap-1.5 rounded-md text-xs"
    :class="linkTarget ? 'hover:bg-elevated' : ''"
    data-test="server-status"
    :data-health="health"
  >
    <div
      class="flex items-center gap-2"
      role="status"
    >
      <span
        class="size-2 shrink-0 rounded-full"
        :class="dotClass"
        aria-hidden="true"
      />
      <span class="truncate font-medium text-highlighted">{{ health === 'down' ? healthLabel : (server?.name ?? healthLabel) }}</span>
      <span class="sr-only">{{ healthLabel }}</span>
    </div>

    <div
      v-for="entry in versions"
      :key="entry"
      class="truncate text-muted"
    >
      {{ entry }}
    </div>

    <template v-if="connections && usage !== null">
      <div class="mt-1 flex items-baseline justify-between gap-2 text-muted">
        <span>{{ t('nuxtUiMongocamp.serverStatus.connections') }}</span>
        <span class="tabular-nums text-default">{{ formatCount(connections.current) }}</span>
      </div>
      <div
        class="h-1 overflow-hidden rounded-full bg-accented"
        role="meter"
        :aria-label="t('nuxtUiMongocamp.serverStatus.connections')"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="usage"
      >
        <div
          class="h-full rounded-full bg-primary"
          :style="{ width: `${Math.max(usage, 2)}%` }"
        />
      </div>
    </template>

    <div
      v-if="uptimeSeconds !== undefined"
      class="text-dimmed"
    >
      {{ t('nuxtUiMongocamp.serverStatus.uptime', { time: formatUptime(uptimeSeconds) }) }}
    </div>
    <!-- The visible text names the link (an aria-label would hide it from voice control); this says where it goes -->
    <span
      v-if="linkTarget"
      class="sr-only"
    >{{ t('nuxtUiMongocamp.serverStatus.details') }}</span>
  </component>
</template>
