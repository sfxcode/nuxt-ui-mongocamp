<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { useMongocampAutoRefresh } from '../composables/useMongocampAutoRefresh'
import { useMongocampAdminGate } from '../composables/useMongocampAdminGate'
import { useMongocampServerOverview } from '../composables/useMongocampServerOverview'
import type { ServerOverview } from '../composables/useMongocampServerOverview'
import { formatBytes } from '../utils/formatBytes'
import { BYTE_METRICS, nextJobs, overviewTotals, rankCollections, RANK_METRICS, shareSlices } from '../utils/serverOverview'
import type { RankBy } from '../utils/serverOverview'

// What an admin wants to see first: how much the server holds and where. Stat cards, the biggest collections (a chart and a
// ranked list that links to each collection), the share of storage, the databases, the cluster and the next scheduled jobs.
// The numbers of all collections come in one request; every part
// stands on its own — one that cannot be read is named and the others still show.
const props = withDefaults(defineProps<{
  // base path of the page rendering MongocampCollectionInfos (`<infoPath>/<name>`)
  infoPath?: string
  // base path of the data pages (`<dataPath>/<name>/data`)
  dataPath?: string
  jobsPath?: string
  // how many collections the ranking and the chart show
  topN?: number
  // read at most this many collections
  maxCollections?: number
  // reload every N seconds (at least 1; 0 = off): pauses while the tab is hidden, a failed background reload keeps the data
  autoRefresh?: number
  // the list and the cards only, no charts
  hideCharts?: boolean
}>(), {
  infoPath: '/secured/admin/collections',
  dataPath: '/secured/admin/collections',
  jobsPath: '/secured/admin/jobs',
  topN: 10,
  maxCollections: 200,
  autoRefresh: 0,
  hideCharts: false,
})

const { t, locale } = useI18n()
const { loadOverview } = useMongocampServerOverview()

const overview = ref<ServerOverview | null>(null)
const loading = ref(false)
const rankBy = ref<RankBy>('storageSize')
let controller: AbortController | undefined

async function load() {
  controller?.abort()
  const own = new AbortController()
  controller = own
  loading.value = true
  try {
    const result = await loadOverview({
      maxCollections: props.maxCollections,
      signal: own.signal,
    })
    if (controller === own) overview.value = result
  }
  catch (e) {
    if (own.signal.aborted) return
    throw e
  }
  finally {
    if (controller === own) loading.value = false
  }
}

const { blocked, message } = useMongocampAdminGate()
const auto = useMongocampAutoRefresh(() => load(), { intervalMs: () => props.autoRefresh * 1000 })
function syncAutoRefresh() {
  auto.stop()
  if (!blocked.value && props.autoRefresh > 0) auto.start()
}
onMounted(() => {
  if (!blocked.value) void load()
  syncAutoRefresh()
})
watch(() => props.autoRefresh, syncAutoRefresh)
onBeforeUnmount(() => controller?.abort())

const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const collections = computed(() => overview.value?.collections ?? [])
const totals = computed(() => overviewTotals(collections.value, overview.value?.databases ?? null))
const indexShare = computed(() => {
  const all = totals.value.storageBytes + totals.value.indexBytes
  return all > 0 ? `${Math.round((totals.value.indexBytes / all) * 100)} %` : '0 %'
})

const metricItems = computed(() => RANK_METRICS.map(value => ({ value, label: t(`nuxtUiMongocamp.serverOverview.metric${value.charAt(0).toUpperCase()}${value.slice(1)}`) })))
const metricLabel = computed(() => metricItems.value.find(m => m.value === rankBy.value)!.label)
const formatMetric = (value: number) => (BYTE_METRICS.has(rankBy.value) ? formatBytes(value) : number(value))
const ranked = computed(() => rankCollections(collections.value, rankBy.value, props.topN))
const rankedData = computed(() => ranked.value.map(c => ({ name: c.name, value: c[rankBy.value] })))
const biggestDescription = computed(() => (ranked.value[0]
  ? t('nuxtUiMongocamp.serverOverview.chartBiggestDescription', { shown: ranked.value.length, name: ranked.value[0].name, value: formatMetric(ranked.value[0][rankBy.value]) })
  : ''))

const shareData = computed(() => shareSlices(collections.value, 'storageSize').map(s => ({ name: s.name ?? t('nuxtUiMongocamp.serverOverview.otherCollections'), value: s.value })))
const shareDescription = computed(() => (shareData.value[0]
  ? t('nuxtUiMongocamp.serverOverview.chartShareDescription', { shown: shareData.value.length, name: shareData.value[0].name, value: formatBytes(shareData.value[0].value) })
  : ''))

const databases = computed(() => overview.value?.databases ?? [])
const databaseData = computed(() => [...databases.value].sort((a, b) => b.sizeOnDisk - a.sizeOnDisk).map(d => ({ name: d.name, value: d.sizeOnDisk })))
const databaseDescription = computed(() => (databaseData.value[0]
  ? t('nuxtUiMongocamp.serverOverview.chartDatabasesDescription', { shown: databaseData.value.length, name: databaseData.value[0].name, value: formatBytes(databaseData.value[0].value) })
  : ''))
const jobs = computed(() => nextJobs(overview.value?.jobs ?? [], 5))

const failedParts = computed(() => (['databases', 'collections', 'cluster', 'jobs'] as const).filter(part => overview.value?.errors[part] !== undefined))
const failedNames = computed(() => {
  const names = overview.value?.failed ?? []
  return names.length > 5 ? `${names.slice(0, 5).join(', ')}, …` : names.join(', ')
})
const seriesSize = computed(() => [{ key: 'value', label: t('nuxtUiMongocamp.serverOverview.seriesSize') }])
const seriesMetric = computed(() => [{ key: 'value', label: metricLabel.value }])
</script>

<template>
  <MongocampEmptyState
    v-if="blocked"
    icon="i-lucide-shield-alert"
    :title="message"
    data-test="admin-only"
  />
  <div
    v-else
    class="flex flex-col gap-6"
    data-test="server-overview"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold">
          {{ t('nuxtUiMongocamp.serverOverview.heading') }}
        </h2>
        <p class="text-sm text-dimmed">
          {{ t('nuxtUiMongocamp.serverOverview.subtitle') }}
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="loading"
        :aria-label="t('nuxtUiMongocamp.common.refresh')"
        @click="load()"
      />
    </div>

    <UAlert
      v-for="part in failedParts"
      :key="part"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t(`nuxtUiMongocamp.serverOverview.error${part.charAt(0).toUpperCase()}${part.slice(1)}`)"
      data-test="overview-error"
    >
      <template #actions>
        <UButton
          :label="t('nuxtUiMongocamp.serverOverview.retry')"
          color="warning"
          variant="subtle"
          size="sm"
          @click="load()"
        />
      </template>
    </UAlert>

    <template v-if="overview">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <UCard>
          <div class="text-sm text-dimmed">
            {{ t('nuxtUiMongocamp.serverOverview.statDatabases') }}
          </div>
          <div
            class="text-2xl font-semibold"
            data-test="stat-databases"
          >
            {{ overview.databases ? totals.databases : '—' }}
          </div>
          <div
            v-if="overview.databases"
            class="text-xs text-dimmed"
          >
            {{ t('nuxtUiMongocamp.serverOverview.statDisk', { size: formatBytes(totals.diskBytes) }) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-dimmed">
            {{ t('nuxtUiMongocamp.serverOverview.statCollections') }}
          </div>
          <div
            class="text-2xl font-semibold"
            data-test="stat-collections"
          >
            {{ number(overview.collectionCount) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-dimmed">
            {{ t('nuxtUiMongocamp.serverOverview.statDocuments') }}
          </div>
          <div
            class="text-2xl font-semibold"
            data-test="stat-documents"
          >
            {{ number(totals.documents) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-dimmed">
            {{ t('nuxtUiMongocamp.serverOverview.statStorage') }}
          </div>
          <div
            class="text-2xl font-semibold"
            data-test="stat-storage"
          >
            {{ formatBytes(totals.storageBytes) }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-dimmed">
            {{ t('nuxtUiMongocamp.serverOverview.statIndexes') }}
          </div>
          <div
            class="text-2xl font-semibold"
            data-test="stat-indexes"
          >
            {{ formatBytes(totals.indexBytes) }}
          </div>
          <div class="text-xs text-dimmed">
            {{ t('nuxtUiMongocamp.serverOverview.statIndexesHint', { share: indexShare }) }}
          </div>
        </UCard>
      </div>

      <p
        v-if="overview.skipped > 0"
        class="text-sm text-warning"
        data-test="overview-partial"
      >
        {{ t('nuxtUiMongocamp.serverOverview.partial', { read: collections.length + overview.failed.length, total: overview.collectionCount, skipped: overview.skipped, max: maxCollections }) }}
      </p>
      <p
        v-if="overview.failed.length > 0"
        class="text-sm text-warning"
        data-test="overview-failed"
      >
        {{ t('nuxtUiMongocamp.serverOverview.failedCollections', { count: overview.failed.length, names: failedNames }) }}
      </p>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-semibold">{{ t('nuxtUiMongocamp.serverOverview.biggestTitle') }}</span>
            <div class="flex items-center gap-2">
              <span class="text-xs text-dimmed">{{ t('nuxtUiMongocamp.serverOverview.rankBy') }}</span>
              <USelect
                v-model="rankBy"
                :items="metricItems"
                size="sm"
                class="w-60"
                :aria-label="t('nuxtUiMongocamp.serverOverview.rankBy')"
              />
            </div>
          </div>
        </template>
        <p
          v-if="ranked.length === 0"
          class="text-sm text-dimmed"
          data-test="overview-no-collections"
        >
          {{ t('nuxtUiMongocamp.serverOverview.noCollections') }}
        </p>
        <div
          v-else
          class="flex flex-col gap-4"
        >
          <MongocampChart
            v-if="!hideCharts"
            type="bar"
            :data="rankedData"
            index="name"
            :categories="seriesMetric"
            :chart-label="t('nuxtUiMongocamp.serverOverview.chartBiggest', { metric: metricLabel })"
            :chart-description="biggestDescription"
            :index-label="t('nuxtUiMongocamp.serverOverview.columnCollection')"
            :format="formatMetric"
            :show-table="false"
            :legend="false"
          />
          <ol
            class="flex flex-col divide-y divide-default text-sm"
            data-test="ranked-list"
          >
            <li
              v-for="(collection, index) in ranked"
              :key="collection.name"
              class="flex items-center gap-2 py-1.5"
            >
              <span class="w-6 text-right text-dimmed">{{ index + 1 }}</span>
              <NuxtLink
                :to="`${infoPath}/${collection.name}`"
                class="min-w-0 flex-1 truncate font-medium hover:underline"
                :aria-label="t('nuxtUiMongocamp.serverOverview.openInfo', { name: collection.name })"
              >
                {{ collection.name }}
              </NuxtLink>
              <span class="tabular-nums text-dimmed">{{ formatMetric(collection[rankBy]) }}</span>
              <UButton
                icon="i-lucide-table"
                color="neutral"
                variant="ghost"
                size="xs"
                :to="`${dataPath}/${collection.name}/data`"
                :aria-label="t('nuxtUiMongocamp.serverOverview.openData', { name: collection.name })"
              />
            </li>
          </ol>
        </div>
      </UCard>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UCard v-if="!hideCharts && shareData.length > 0">
          <template #header>
            <span class="font-semibold">{{ t('nuxtUiMongocamp.serverOverview.shareTitle') }}</span>
          </template>
          <MongocampChart
            type="donut"
            :data="shareData"
            index="name"
            :categories="seriesSize"
            :chart-label="t('nuxtUiMongocamp.serverOverview.chartShare')"
            :chart-description="shareDescription"
            :index-label="t('nuxtUiMongocamp.serverOverview.columnCollection')"
            :format="formatBytes"
            :height="240"
          />
        </UCard>

        <UCard v-if="overview.databases">
          <template #header>
            <span class="font-semibold">{{ t('nuxtUiMongocamp.serverOverview.databasesTitle') }}</span>
          </template>
          <div class="flex flex-col gap-3">
            <MongocampChart
              v-if="!hideCharts && databaseData.length > 1"
              type="bar"
              :data="databaseData"
              index="name"
              :categories="seriesSize"
              :chart-label="t('nuxtUiMongocamp.serverOverview.chartDatabases')"
              :chart-description="databaseDescription"
              :index-label="t('nuxtUiMongocamp.serverOverview.columnName')"
              :format="formatBytes"
              :height="200"
              :show-table="false"
              :legend="false"
            />
            <ul
              class="flex flex-col divide-y divide-default text-sm"
              data-test="database-list"
            >
              <li
                v-for="database in databases"
                :key="database.name"
                class="flex items-center gap-2 py-1.5"
              >
                <span class="min-w-0 flex-1 truncate font-medium">{{ database.name }}</span>
                <UBadge
                  v-if="database.empty"
                  :label="t('nuxtUiMongocamp.serverOverview.databaseEmpty')"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
                <span class="tabular-nums text-dimmed">{{ formatBytes(database.sizeOnDisk) }}</span>
              </li>
            </ul>
          </div>
        </UCard>

        <UCard v-if="overview.cluster">
          <template #header>
            <span class="font-semibold">{{ t('nuxtUiMongocamp.serverOverview.clusterTitle') }}</span>
          </template>
          <ul
            class="flex flex-col divide-y divide-default text-sm"
            data-test="cluster-list"
          >
            <li
              v-for="member in overview.cluster.members"
              :key="member.name"
              class="flex flex-wrap items-center gap-2 py-1.5"
            >
              <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ member.name }}</span>
              <UBadge
                v-if="member.coordinator"
                :label="t('nuxtUiMongocamp.serverOverview.coordinator')"
                color="primary"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-if="member.siteMaster"
                :label="t('nuxtUiMongocamp.serverOverview.siteMaster')"
                color="info"
                variant="subtle"
                size="sm"
              />
            </li>
          </ul>
        </UCard>

        <UCard v-if="overview.jobs">
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold">{{ t('nuxtUiMongocamp.serverOverview.jobsTitle') }}</span>
              <UButton
                :label="t('nuxtUiMongocamp.serverOverview.allJobs')"
                :to="jobsPath"
                color="neutral"
                variant="link"
                size="xs"
              />
            </div>
          </template>
          <p
            v-if="jobs.length === 0"
            class="text-sm text-dimmed"
            data-test="jobs-none"
          >
            {{ t('nuxtUiMongocamp.serverOverview.jobsNone') }}
          </p>
          <ul
            v-else
            class="flex flex-col divide-y divide-default text-sm"
            data-test="jobs-list"
          >
            <li
              v-for="job in jobs"
              :key="`${job.group}/${job.name}`"
              class="flex items-center gap-2 py-1.5"
            >
              <span class="min-w-0 flex-1 truncate font-medium">{{ job.group }} / {{ job.name }}</span>
              <time
                class="tabular-nums text-dimmed"
                :datetime="job.next.toISOString()"
              >{{ job.next.toLocaleString() }}</time>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </div>
</template>
