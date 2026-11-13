<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n, useMongocampSystem } from '#imports'
import { useNuxtApp } from '#app'
import type { Capabilities, SystemStats } from '@sfxcode/nuxt-mongocamp-server'
import { useMongocampAutoRefresh } from '../composables/useMongocampAutoRefresh'
import { formatBytes } from '../utils/formatBytes'
import { connectionUsage, formatCount, formatUptime, OP_COUNTER_KEYS } from '../utils/serverInfo'

const props = withDefaults(defineProps<{
  /** Hide the "Server information" heading. */
  hideHeading?: boolean
  /** Hide the refresh button. */
  hideRefresh?: boolean
  /** Hide the database load card (uptime, connections, counters, replica set — the request is skipped too). */
  hideStats?: boolean
  /** Hide the capabilities card (features, limits, refused operators — the request is skipped too). */
  hideCapabilities?: boolean
  /** Reload the numbers every N seconds (at least 1; 0 = off). Pauses while the tab is hidden and slows down after failures. */
  autoRefresh?: number
}>(), {
  hideHeading: false,
  hideRefresh: false,
  hideStats: false,
  hideCapabilities: false,
  autoRefresh: 0,
})

const { t } = useI18n()
const { $mongocampVersion } = useNuxtApp()
const { getServerInfo, getStats, getCapabilities } = useMongocampSystem()

// `$mongocampVersion` is provided by the module's runtime plugin as a Ref
const version = computed(() => $mongocampVersion.value)

const mongoDbVersion = ref<string | null>(null)
const stats = ref<SystemStats | null>(null)
const capabilities = ref<Capabilities | null>(null)
const loading = ref(false)
// the parts are independent: one failing endpoint names itself and leaves the others on screen
const failed = ref<{ info: boolean, stats: boolean, capabilities: boolean }>({ info: false, stats: false, capabilities: false })
// a server without the capabilities route is older than 1.9.0 — say so instead of "failed"
const olderServer = ref(false)

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status
}

async function load() {
  const [info, loadedStats, loadedCapabilities] = await Promise.allSettled([
    getServerInfo(),
    props.hideStats ? Promise.resolve(null) : getStats(),
    props.hideCapabilities ? Promise.resolve(null) : getCapabilities(),
  ])
  mongoDbVersion.value = info.status === 'fulfilled' ? info.value.mongoDbVersion || null : mongoDbVersion.value
  stats.value = loadedStats.status === 'fulfilled' ? loadedStats.value : stats.value
  capabilities.value = loadedCapabilities.status === 'fulfilled' ? loadedCapabilities.value : capabilities.value
  const missing = loadedCapabilities.status === 'rejected' && [404, 405].includes(statusOf(loadedCapabilities.reason) ?? 0)
  olderServer.value = missing
  failed.value = {
    info: info.status === 'rejected',
    stats: loadedStats.status === 'rejected',
    capabilities: loadedCapabilities.status === 'rejected' && !missing,
  }
  // every part failing is one outcome worth raising to the auto-refresh backoff
  if ([info, loadedStats, loadedCapabilities].every(r => r.status === 'rejected')) throw (info as PromiseRejectedResult).reason
}

async function refresh() {
  loading.value = true
  try {
    await load()
  }
  catch {
    // each part already shows its own failure
  }
  finally {
    loading.value = false
  }
}

const { start, stop } = useMongocampAutoRefresh(load, { intervalMs: () => props.autoRefresh * 1000 })
watch(() => props.autoRefresh, (seconds) => {
  stop()
  if (seconds > 0) start()
})

onMounted(() => {
  refresh()
  if (props.autoRefresh > 0) start()
})

const usage = computed(() => connectionUsage(stats.value?.connections?.current, stats.value?.connections?.available))
// the generated client calls the `delete` counter `_delete` (reserved word)
function opCount(counters: NonNullable<SystemStats['opcounters']>, key: typeof OP_COUNTER_KEYS[number]): number {
  return key === 'delete' ? counters._delete : counters[key]
}

const counters = computed(() => OP_COUNTER_KEYS.map(key => ({
  key,
  label: t(`nuxtUiMongocamp.serverInfo.op_${key}`),
  value: stats.value?.opcounters ? formatCount(opCount(stats.value.opcounters, key)) : '-',
})))
const hasLoad = computed(() => !!stats.value && !stats.value.partial)

defineExpose({ refresh })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="!hideHeading || !hideRefresh"
      class="flex items-center justify-between gap-4"
    >
      <h2 class="text-xl font-semibold">
        <template v-if="!hideHeading">
          {{ t('nuxtUiMongocamp.serverInfo.heading') }}
        </template>
      </h2>
      <UTooltip
        v-if="!hideRefresh"
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

    <UAlert
      v-if="failed.info"
      color="warning"
      variant="subtle"
      data-testid="info-failed"
      :description="t('nuxtUiMongocamp.serverInfo.partFailed', { part: t('nuxtUiMongocamp.serverInfo.partInfo') })"
    />
    <UAlert
      v-if="failed.stats && !hideStats"
      color="warning"
      variant="subtle"
      data-testid="stats-failed"
      :description="t('nuxtUiMongocamp.serverInfo.partFailed', { part: t('nuxtUiMongocamp.serverInfo.partStats') })"
    />
    <UAlert
      v-if="failed.capabilities && !hideCapabilities"
      color="warning"
      variant="subtle"
      data-testid="capabilities-failed"
      :description="t('nuxtUiMongocamp.serverInfo.partFailed', { part: t('nuxtUiMongocamp.serverInfo.partCapabilities') })"
    />

    <UCard>
      <template #header>
        <span class="font-semibold">{{ t('nuxtUiMongocamp.serverInfo.serverHeading') }}</span>
      </template>
      <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div class="flex justify-between gap-4">
          <dt class="text-dimmed">
            {{ t('nuxtUiMongocamp.serverInfo.mongocampVersion') }}
          </dt>
          <dd data-testid="mongocamp-version">
            {{ version ? `${version.name} v${version.version}` : '-' }}
          </dd>
        </div>
        <div class="flex justify-between gap-4">
          <dt class="text-dimmed">
            {{ t('nuxtUiMongocamp.serverInfo.mongoDbVersion') }}
          </dt>
          <dd data-testid="mongodb-version">
            {{ mongoDbVersion ?? '-' }}
          </dd>
        </div>
        <div
          v-if="capabilities?.mongoDbMajor != null"
          class="flex justify-between gap-4"
        >
          <dt class="text-dimmed">
            {{ t('nuxtUiMongocamp.serverInfo.mongoDbMajor') }}
          </dt>
          <dd>{{ capabilities.mongoDbMajor }}</dd>
        </div>
        <div
          v-if="hasLoad && stats?.uptimeSeconds != null"
          class="flex justify-between gap-4"
        >
          <dt class="text-dimmed">
            {{ t('nuxtUiMongocamp.serverInfo.uptime') }}
          </dt>
          <dd data-testid="uptime">
            {{ formatUptime(stats.uptimeSeconds) }}
          </dd>
        </div>
        <div
          v-if="stats?.replicaSet"
          class="flex justify-between gap-4"
        >
          <dt class="text-dimmed">
            {{ t('nuxtUiMongocamp.serverInfo.replicaSet') }}
          </dt>
          <dd class="flex flex-wrap items-center justify-end gap-2">
            <span>{{ stats.replicaSet.name }}</span>
            <UBadge
              :label="stats.replicaSet.state"
              color="neutral"
              variant="subtle"
            />
            <span class="text-dimmed">{{ t('nuxtUiMongocamp.serverInfo.replicaMembers', { healthy: stats.replicaSet.healthyMembers, count: stats.replicaSet.memberCount }) }}</span>
          </dd>
        </div>
      </dl>
    </UCard>

    <UCard v-if="!hideStats && stats">
      <template #header>
        <span class="font-semibold">{{ t('nuxtUiMongocamp.serverInfo.statsHeading') }}</span>
      </template>
      <UAlert
        v-if="stats.partial"
        color="info"
        variant="subtle"
        data-testid="stats-partial"
        :description="t('nuxtUiMongocamp.serverInfo.partialNote')"
      />
      <div
        v-else
        class="flex flex-col gap-4"
      >
        <div
          v-if="stats.connections"
          class="flex flex-col gap-2"
        >
          <div class="text-sm font-medium">
            {{ t('nuxtUiMongocamp.serverInfo.connections') }}
          </div>
          <UProgress
            v-if="usage != null"
            :model-value="usage"
            :aria-label="t('nuxtUiMongocamp.serverInfo.connections')"
          />
          <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div class="flex justify-between gap-4">
              <dt class="text-dimmed">
                {{ t('nuxtUiMongocamp.serverInfo.connectionsCurrent') }}
              </dt>
              <dd
                class="tabular-nums"
                data-testid="connections-current"
              >
                {{ formatCount(stats.connections.current) }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-dimmed">
                {{ t('nuxtUiMongocamp.serverInfo.connectionsAvailable') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatCount(stats.connections.available) }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-dimmed">
                {{ t('nuxtUiMongocamp.serverInfo.connectionsTotal') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatCount(stats.connections.totalCreated) }}
              </dd>
            </div>
          </dl>
        </div>
        <div v-if="stats.opcounters">
          <div class="mb-2 text-sm font-medium">
            {{ t('nuxtUiMongocamp.serverInfo.opCounters') }}
          </div>
          <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div
              v-for="counter in counters"
              :key="counter.key"
              class="flex justify-between gap-4"
            >
              <dt class="text-dimmed">
                {{ counter.label }}
              </dt>
              <dd
                class="tabular-nums"
                :data-testid="`op-${counter.key}`"
              >
                {{ counter.value }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </UCard>

    <UAlert
      v-if="olderServer && !hideCapabilities"
      color="neutral"
      variant="subtle"
      data-testid="older-server"
      :description="t('nuxtUiMongocamp.serverInfo.olderServer')"
    />
    <UCard v-if="!hideCapabilities && capabilities">
      <template #header>
        <span class="font-semibold">{{ t('nuxtUiMongocamp.serverInfo.capabilitiesHeading') }}</span>
      </template>
      <div class="flex flex-col gap-4">
        <div v-if="capabilities.features?.length">
          <div class="mb-2 text-sm font-medium">
            {{ t('nuxtUiMongocamp.serverInfo.features') }}
          </div>
          <div
            class="flex flex-wrap gap-1.5"
            data-testid="features"
          >
            <UBadge
              v-for="feature in capabilities.features"
              :key="feature"
              :label="feature"
              color="primary"
              variant="subtle"
            />
          </div>
        </div>
        <div>
          <div class="mb-2 text-sm font-medium">
            {{ t('nuxtUiMongocamp.serverInfo.limits') }}
          </div>
          <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div class="flex justify-between gap-4">
              <dt class="text-dimmed">
                {{ t('nuxtUiMongocamp.serverInfo.importMaxBytes') }}
              </dt>
              <dd data-testid="import-max">
                {{ formatBytes(capabilities.limits.importMaxBytes) }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-dimmed">
                {{ t('nuxtUiMongocamp.serverInfo.grantDeniedStatus') }}
              </dt>
              <dd data-testid="grant-denied">
                {{ capabilities.limits.grantDeniedStatus }}
              </dd>
            </div>
          </dl>
        </div>
        <div v-if="capabilities.aggregationStagesDenied?.length">
          <div class="mb-2 text-sm font-medium">
            {{ t('nuxtUiMongocamp.serverInfo.deniedStages') }}
          </div>
          <div
            class="flex flex-wrap gap-1.5"
            data-testid="denied-stages"
          >
            <UBadge
              v-for="stage in capabilities.aggregationStagesDenied"
              :key="stage"
              :label="stage"
              color="error"
              variant="subtle"
              class="font-mono"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
