<script setup lang="ts">
import { computed, h, ref, resolveComponent, watch } from 'vue'
import { useI18n, useMongocampClientApi, useMongocampSchema, useToast } from '#imports'
import type { TableColumn } from '@nuxt/ui'
import type { CollectionStatus } from '@sfxcode/nuxt-mongocamp-server'
import type { ColumnDefinition } from '../composables/useMongocampSchema'
import MongocampIndexes from './MongocampIndexes.vue'
import { useMongocampAggregation } from '../composables/useMongocampAggregation'
import type { DescribedAggregationError } from '../composables/useMongocampAggregation'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import { analyzeSamples } from '../utils/analyzeSamples'
import { downloadTextFile } from '../utils/exportRows'
import type { FieldStatistic, SampleAnalysis, ValueKind } from '../utils/analyzeSamples'
import { FULL_ANALYSIS_MAX_DOCUMENTS, statisticsFromSchemaAnalysis } from '../utils/schemaAnalysis'

const props = withDefaults(defineProps<{
  collectionName: string
  sampleSize?: number
}>(), {
  sampleSize: 500,
})

const { t } = useI18n()
const { collectionApi, documentApi } = useMongocampClientApi()
const { schemaFromSamples, schemaToTsInterface } = useMongocampSchema()
const { sampleDocuments, describeAggregationError } = useMongocampAggregation()
const { getJsonSchema, getSchemaAnalysis } = useMongocampAdmin()

const UBadge = resolveComponent('UBadge')
const UIcon = resolveComponent('UIcon')

const info = ref<CollectionStatus | null>(null)
const columnDefinitions = ref<ColumnDefinition[]>([])
const loading = ref(false)

async function fetchInfo() {
  if (!props.collectionName) return
  loading.value = true
  try {
    info.value = await collectionApi.getCollectionInformation({ collectionName: props.collectionName })
    const samples = await documentApi.listDocuments({
      collectionName: props.collectionName,
      rowsPerPage: props.sampleSize,
      page: 1,
    })
    columnDefinitions.value = schemaFromSamples(samples as Array<Record<string, unknown>>)
  }
  finally {
    loading.value = false
  }
}

watch(() => [props.collectionName, props.sampleSize], fetchInfo, { immediate: true })

const TYPE_COLORS: Record<string, string> = {
  'string': 'neutral',
  'number': 'warning',
  'integer': 'warning',
  'date-time': 'info',
  'boolean': 'success',
  'object': 'secondary',
  'array': 'primary',
}

interface SchemaRow {
  field: string
  type: string
  required: boolean
}

const schemaRows = computed<SchemaRow[]>(() =>
  columnDefinitions.value.map(col => ({
    field: col.columnKey,
    type: col.columnType,
    required: col.required,
  })),
)

const schemaTitle = computed(() => props.collectionName)

const tsInterface = computed(() => schemaToTsInterface(columnDefinitions.value, props.collectionName))

const toast = useToast()

async function copySchemaAsTs() {
  await navigator.clipboard.writeText(tsInterface.value)
  toast.add({ title: t('nuxtUiMongocamp.collectionInfos.copiedTitle'), description: t('nuxtUiMongocamp.collectionInfos.copiedDescription'), color: 'success' })
}

// The server's inferred JSON schema, fetched only when the viewer is opened. It is shown verbatim —
// nothing here reads into its structure.
const isSchemaOpen = ref(false)
const schemaJson = ref('')
const schemaLoading = ref(false)
const schemaError = ref<unknown>(null)
let schemaRun = 0

async function loadJsonSchema() {
  const run = ++schemaRun
  schemaLoading.value = true
  schemaError.value = null
  try {
    const schema: unknown = await getJsonSchema(props.collectionName)
    if (run !== schemaRun) return
    schemaJson.value = JSON.stringify(schema, null, 2)
  }
  catch (e: unknown) {
    if (run !== schemaRun) return
    schemaError.value = e
  }
  finally {
    if (run === schemaRun) schemaLoading.value = false
  }
}

function openJsonSchema() {
  isSchemaOpen.value = true
  if (!schemaJson.value) loadJsonSchema()
}

async function copyJsonSchema() {
  await navigator.clipboard.writeText(schemaJson.value)
  toast.add({ title: t('nuxtUiMongocamp.collectionInfos.copiedTitle'), description: t('nuxtUiMongocamp.collectionInfos.schemaCopiedDescription'), color: 'success' })
}

function downloadJsonSchema() {
  downloadTextFile(`${props.collectionName}.schema.json`, schemaJson.value, 'application/json')
}

// the schema belongs to one collection
watch(() => props.collectionName, () => {
  schemaRun++
  schemaJson.value = ''
  schemaError.value = null
  schemaLoading.value = false
  isSchemaOpen.value = false
})

const schemaTableColumns = computed<TableColumn<SchemaRow>[]>(() => [
  {
    accessorKey: 'field',
    header: t('nuxtUiMongocamp.collectionInfos.columnField'),
  },
  {
    accessorKey: 'type',
    header: t('nuxtUiMongocamp.collectionInfos.columnType'),
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.type,
        color: TYPE_COLORS[row.original.type] ?? 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'required',
    header: t('nuxtUiMongocamp.collectionInfos.columnInAllSamples'),
    cell: ({ row }) =>
      row.original.required
        ? h(UIcon, { name: 'i-lucide-check', class: 'size-4 text-success' })
        : h('span', { class: 'text-dimmed' }, '—'),
  },
])

// ---- field statistics ---------------------------------------------------------------------------
// Computed here from a random sample (an aggregation with `$sample`), on demand. The server's own
// schema-analysis endpoint is deliberately not used: it returns an accumulation of every earlier
// analysis across collections.

const STATS_SAMPLE_SIZES = [100, 500, 1000]
const KIND_COLORS: Record<ValueKind, string> = {
  string: 'neutral',
  number: 'warning',
  boolean: 'success',
  date: 'info',
  object: 'secondary',
  array: 'primary',
  null: 'neutral',
}

const statsSampleSize = ref(500)
// 'sample': the client-side statistics over a `$sample`; 'server': the server's own analysis of every document
const statsMode = ref<'sample' | 'server'>('sample')
const statsLoading = ref(false)
const statsError = ref<DescribedAggregationError | null>(null)
const statsAnalysis = ref<SampleAnalysis | null>(null)
let statsRun = 0

async function analyzeFields() {
  const run = ++statsRun
  statsLoading.value = true
  statsError.value = null
  statsMode.value = 'sample'
  try {
    const { rows } = await sampleDocuments(props.collectionName, statsSampleSize.value)
    if (run !== statsRun) return
    statsAnalysis.value = analyzeSamples(rows)
  }
  catch (error) {
    const described = await describeAggregationError(error)
    if (run !== statsRun) return
    statsAnalysis.value = null
    statsError.value = described
  }
  finally {
    if (run === statsRun) statsLoading.value = false
  }
}

// "Analyze all documents": the server's own analysis, explicit because it scans the whole collection (about 10 000
// documents per second) — refused above FULL_ANALYSIS_MAX_DOCUMENTS, where a sample is the sensible choice.
const canAnalyzeAll = computed(() => (info.value?.count ?? 0) > 0 && (info.value?.count ?? 0) <= FULL_ANALYSIS_MAX_DOCUMENTS)

async function analyzeAllDocuments() {
  const run = ++statsRun
  statsLoading.value = true
  statsError.value = null
  statsMode.value = 'server'
  try {
    const analysis = await getSchemaAnalysis(props.collectionName, info.value?.count ?? 0)
    if (run !== statsRun) return
    statsAnalysis.value = statisticsFromSchemaAnalysis(analysis)
  }
  catch (error) {
    const timedOut = (error as { name?: string } | null)?.name === 'TimeoutError'
    const described: DescribedAggregationError = timedOut
      ? { kind: 'retryable', message: t('nuxtUiMongocamp.collectionInfos.statsServerTimeout') }
      : await describeAggregationError(error)
    if (run !== statsRun) return
    statsAnalysis.value = null
    statsError.value = described
  }
  finally {
    if (run === statsRun) statsLoading.value = false
  }
}

function retryStats() {
  return statsMode.value === 'server' ? analyzeAllDocuments() : analyzeFields()
}

// statistics belong to one collection
watch(() => props.collectionName, () => {
  statsRun++
  statsMode.value = 'sample'
  statsAnalysis.value = null
  statsError.value = null
  statsLoading.value = false
})

function percent(share: number): string {
  if (share >= 1) return '100%'
  return share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`
}

const statsColumns = computed<TableColumn<FieldStatistic>[]>(() => [
  {
    accessorKey: 'path',
    header: t('nuxtUiMongocamp.collectionInfos.columnField'),
  },
  {
    id: 'types',
    header: t('nuxtUiMongocamp.collectionInfos.columnType'),
    cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, row.original.types.map(({ type, count }) =>
      h(UBadge, {
        label: row.original.types.length > 1 ? `${type} ${percent(count / row.original.present)}` : type,
        color: KIND_COLORS[type] ?? 'neutral',
        variant: 'subtle',
        size: 'sm',
      }),
    )),
  },
  {
    id: 'present',
    header: t('nuxtUiMongocamp.collectionInfos.statsColumnPresent'),
    cell: ({ row }) => h('span', { title: t(statsMode.value === 'server' ? 'nuxtUiMongocamp.collectionInfos.statsPresentTitleAll' : 'nuxtUiMongocamp.collectionInfos.statsPresentTitle', { present: row.original.present, sampled: statsAnalysis.value?.sampled ?? 0 }) }, percent(row.original.share)),
  },
  {
    id: 'values',
    header: t('nuxtUiMongocamp.collectionInfos.statsColumnValues'),
    cell: ({ row }) => row.original.topValues
      ? h('span', { class: 'text-xs' }, row.original.topValues.map(v => `${v.value} (${v.count})`).join(', '))
      : h('span', { class: 'text-dimmed' }, '—'),
  },
])

// the index panel is its own component; after an index was created or dropped only the numbers above are refreshed
async function refreshInfo() {
  info.value = await collectionApi.getCollectionInformation({ collectionName: props.collectionName })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <USkeleton
      v-if="loading"
      class="h-32 w-full"
    />
    <div
      v-else-if="info"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('nuxtUiMongocamp.collectionInfos.documents') }}
        </div>
        <div class="text-2xl font-semibold">
          {{ info.count }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('nuxtUiMongocamp.collectionInfos.dataSize') }}
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.size / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('nuxtUiMongocamp.collectionInfos.storageSize') }}
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.storageSize / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('nuxtUiMongocamp.collectionInfos.avgDocSize') }}
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.avgObjSize) }} B
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('nuxtUiMongocamp.collectionInfos.indexes') }}
        </div>
        <div class="text-2xl font-semibold">
          {{ info.nindexes }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('nuxtUiMongocamp.collectionInfos.indexSize') }}
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.totalIndexSize / 1024) }} KB
        </div>
      </UCard>
    </div>
    <MongocampIndexes
      v-if="!loading"
      :collection-name="collectionName"
      :fields="columnDefinitions.map(c => c.columnKey)"
      @changed="refreshInfo"
    />

    <UCard v-if="schemaRows.length">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-braces"
              class="size-4 text-(--ui-primary)"
            />
            <span class="font-semibold">{{ schemaTitle }}</span>
            <UBadge
              :label="t('nuxtUiMongocamp.collectionInfos.fieldsCount', { count: schemaRows.length })"
              variant="subtle"
              color="neutral"
              size="sm"
            />
          </div>
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-file-json"
              :label="t('nuxtUiMongocamp.collectionInfos.jsonSchema')"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openJsonSchema"
            />
            <UButton
              icon="i-lucide-copy"
              :label="t('nuxtUiMongocamp.collectionInfos.copyAsTs')"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="copySchemaAsTs"
            />
          </div>
        </div>
      </template>
      <UTable
        :data="schemaRows"
        :columns="schemaTableColumns"
      />
    </UCard>

    <UCard v-if="info && !loading">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-chart-no-axes-column"
              class="size-4 text-(--ui-primary)"
            />
            <span class="font-semibold">{{ t('nuxtUiMongocamp.collectionInfos.statsTitle') }}</span>
            <UBadge
              v-if="statsAnalysis"
              :label="statsMode === 'server' ? t('nuxtUiMongocamp.collectionInfos.statsAnalysed', { count: statsAnalysis.sampled }) : t('nuxtUiMongocamp.collectionInfos.statsSampled', { sampled: statsAnalysis.sampled, total: info.count })"
              variant="subtle"
              color="neutral"
              size="sm"
            />
          </div>
          <div class="flex items-center gap-2">
            <USelect
              v-model="statsSampleSize"
              :items="STATS_SAMPLE_SIZES"
              size="sm"
              class="w-24"
              :aria-label="t('nuxtUiMongocamp.collectionInfos.statsSampleSize')"
            />
            <UButton
              icon="i-lucide-activity"
              :label="t('nuxtUiMongocamp.collectionInfos.statsAnalyze')"
              color="neutral"
              variant="subtle"
              size="sm"
              :loading="statsLoading && statsMode === 'sample'"
              :disabled="statsLoading"
              @click="analyzeFields"
            />
            <UButton
              icon="i-lucide-scan-search"
              :label="t('nuxtUiMongocamp.collectionInfos.statsAnalyzeAll')"
              :title="canAnalyzeAll || (info.count ?? 0) === 0 ? t('nuxtUiMongocamp.collectionInfos.statsAnalyzeAllHint') : t('nuxtUiMongocamp.collectionInfos.statsAnalyzeAllTooLarge', { max: FULL_ANALYSIS_MAX_DOCUMENTS })"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="statsLoading && statsMode === 'server'"
              :disabled="!canAnalyzeAll || statsLoading"
              @click="analyzeAllDocuments"
            />
          </div>
        </div>
      </template>

      <p
        v-if="!statsAnalysis && !statsError && !statsLoading"
        class="text-sm text-dimmed"
      >
        {{ t('nuxtUiMongocamp.collectionInfos.statsHint') }}
      </p>
      <UAlert
        v-if="statsError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t('nuxtUiMongocamp.collectionInfos.statsFailed')"
        :description="statsError.message"
      >
        <template #actions>
          <UButton
            v-if="statsError.kind === 'unauthorized'"
            :label="t('nuxtUiMongocamp.errors.loginAgain')"
            to="/"
            color="error"
            variant="subtle"
            icon="i-lucide-log-in"
          />
          <UButton
            v-else
            :label="t('nuxtUiMongocamp.common.retry')"
            color="error"
            variant="subtle"
            icon="i-lucide-refresh-cw"
            @click="retryStats"
          />
        </template>
      </UAlert>
      <template v-if="statsAnalysis">
        <p class="mb-2 text-xs text-dimmed">
          {{ statsMode === 'server' ? t('nuxtUiMongocamp.collectionInfos.statsNoteAll', { count: statsAnalysis.sampled }) : t('nuxtUiMongocamp.collectionInfos.statsNote') }}
          <template v-if="statsAnalysis.truncated">
            {{ t('nuxtUiMongocamp.collectionInfos.statsTruncated', { count: statsAnalysis.fields.length }) }}
          </template>
        </p>
        <UTable
          :data="statsAnalysis.fields"
          :columns="statsColumns"
        >
          <template #empty>
            <MongocampEmptyState :title="t('nuxtUiMongocamp.collectionInfos.statsEmpty')" />
          </template>
        </UTable>
      </template>
    </UCard>

    <UModal
      v-model:open="isSchemaOpen"
      :title="t('nuxtUiMongocamp.collectionInfos.jsonSchemaTitle', { name: collectionName })"
      :ui="{ content: 'sm:max-w-3xl', footer: 'justify-end' }"
    >
      <template #body>
        <MongocampErrorAlert
          :error="schemaError"
          :title="t('nuxtUiMongocamp.collectionInfos.jsonSchemaFailedTitle')"
          @retry="loadJsonSchema"
        />
        <div
          v-if="schemaLoading"
          class="flex justify-center py-8"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-6 animate-spin text-dimmed"
          />
        </div>
        <pre
          v-else-if="schemaJson"
          class="max-h-[60vh] overflow-auto rounded-md bg-elevated p-3 text-xs"
          tabindex="0"
          :aria-label="t('nuxtUiMongocamp.collectionInfos.jsonSchema')"
        >{{ schemaJson }}</pre>
      </template>
      <template #footer>
        <UButton
          icon="i-lucide-copy"
          :label="t('nuxtUiMongocamp.common.copy')"
          color="neutral"
          variant="ghost"
          :disabled="!schemaJson"
          @click="copyJsonSchema"
        />
        <UButton
          icon="i-lucide-download"
          :label="t('nuxtUiMongocamp.collectionInfos.downloadSchema')"
          :disabled="!schemaJson"
          @click="downloadJsonSchema"
        />
      </template>
    </UModal>
  </div>
</template>

<style scoped>
</style>
