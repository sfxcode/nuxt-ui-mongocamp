<script setup lang="ts">
import { computed, h, reactive, ref, resolveComponent, watch } from 'vue'
import { useI18n, useMongocampClientApi, useMongocampIndex, useMongocampSchema, useToast } from '#imports'
import type { TableColumn } from '@nuxt/ui'
import type { CollectionStatus, MongoIndex } from '@sfxcode/nuxt-mongocamp-server'
import type { ColumnDefinition } from '../composables/useMongocampSchema'
import { useMongocampAggregation } from '../composables/useMongocampAggregation'
import type { DescribedAggregationError } from '../composables/useMongocampAggregation'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import { analyzeSamples } from '../utils/analyzeSamples'
import { downloadTextFile } from '../utils/exportRows'
import type { FieldStatistic, SampleAnalysis, ValueKind } from '../utils/analyzeSamples'

const props = withDefaults(defineProps<{
  collectionName: string
  sampleSize?: number
}>(), {
  sampleSize: 500,
})

const { t } = useI18n()
const { collectionApi, documentApi } = useMongocampClientApi()
const { schemaFromSamples, schemaToTsInterface } = useMongocampSchema()
const { listIndexes, createIndex, createUniqueIndex, createTextIndex, createExpiringIndex, deleteIndex } = useMongocampIndex()
const { sampleDocuments, describeAggregationError } = useMongocampAggregation()
const { getJsonSchema } = useMongocampAdmin()

const UBadge = resolveComponent('UBadge')
const UIcon = resolveComponent('UIcon')
const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

const info = ref<CollectionStatus | null>(null)
const columnDefinitions = ref<ColumnDefinition[]>([])
const indexes = ref<MongoIndex[]>([])
const loading = ref(false)

async function fetchIndexes() {
  if (!props.collectionName) return
  indexes.value = await listIndexes(props.collectionName)
}

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
    await fetchIndexes()
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
const statsLoading = ref(false)
const statsError = ref<DescribedAggregationError | null>(null)
const statsAnalysis = ref<SampleAnalysis | null>(null)
let statsRun = 0

async function analyzeFields() {
  const run = ++statsRun
  statsLoading.value = true
  statsError.value = null
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

// statistics belong to one collection
watch(() => props.collectionName, () => {
  statsRun++
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
    cell: ({ row }) => h('span', { title: t('nuxtUiMongocamp.collectionInfos.statsPresentTitle', { present: row.original.present, sampled: statsAnalysis.value?.sampled ?? 0 }) }, percent(row.original.share)),
  },
  {
    id: 'values',
    header: t('nuxtUiMongocamp.collectionInfos.statsColumnValues'),
    cell: ({ row }) => row.original.topValues
      ? h('span', { class: 'text-xs' }, row.original.topValues.map(v => `${v.value} (${v.count})`).join(', '))
      : h('span', { class: 'text-dimmed' }, '—'),
  },
])

interface IndexRow {
  name: string
  keys: string
  unique: boolean
  text: boolean
  expire: boolean
  sizeKb: number
}

const indexRows = computed<IndexRow[]>(() =>
  indexes.value.map(idx => ({
    name: idx.name,
    keys: Object.entries(idx.keys ?? {}).map(([field, direction]) => `${field}: ${direction}`).join(', '),
    unique: idx.unique,
    text: idx.text,
    expire: idx.expire,
    sizeKb: Math.round((info.value?.indexSizes?.[idx.name] ?? 0) / 1024),
  })),
)

const isCreateIndexModalOpen = ref(false)
const createIndexError = ref('')
const newIndex = ref({ fieldName: '', sortAscending: true, indexType: 'standard', duration: '3600s' })

const createIndexSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'fieldName',
    label: t('nuxtUiMongocamp.collectionInfos.fieldName'),
    validation: 'required',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'sortAscending',
    label: t('nuxtUiMongocamp.collectionInfos.ascending'),
  },
  {
    $formkit: 'nuxtUISelectMenu',
    id: 'indexType',
    name: 'indexType',
    label: t('nuxtUiMongocamp.collectionInfos.indexType'),
    options: ['standard', 'unique', 'text', 'expiring'],
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'duration',
    label: t('nuxtUiMongocamp.collectionInfos.expireAfter'),
    help: t('nuxtUiMongocamp.collectionInfos.expireAfterHelp'),
    if: '$get(indexType).value === \'expiring\'',
  },
])

function extractSelectValue(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as { value?: string, label?: string }
    return obj.value ?? obj.label ?? ''
  }
  return String(raw ?? '')
}

function openCreateIndex() {
  createIndexError.value = ''
  newIndex.value = { fieldName: '', sortAscending: true, indexType: 'standard', duration: '3600s' }
  isCreateIndexModalOpen.value = true
}

async function handleCreateIndex() {
  createIndexError.value = ''
  const { fieldName, sortAscending } = newIndex.value
  const indexType = extractSelectValue(newIndex.value.indexType)
  try {
    if (indexType === 'unique') {
      await createUniqueIndex(props.collectionName, fieldName, sortAscending)
    }
    else if (indexType === 'text') {
      await createTextIndex(props.collectionName, fieldName)
    }
    else if (indexType === 'expiring') {
      await createExpiringIndex(props.collectionName, fieldName, newIndex.value.duration)
    }
    else {
      await createIndex(props.collectionName, { [fieldName]: sortAscending ? 1 : -1 })
    }
    isCreateIndexModalOpen.value = false
    await fetchIndexes()
  }
  catch (e) {
    createIndexError.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.collectionInfos.errorCreateIndex')
  }
}

const isDeleteIndexModalOpen = ref(false)
const deleteIndexError = ref('')
const indexToDelete = ref<string | undefined>(undefined)

function confirmDeleteIndex(indexName: string) {
  indexToDelete.value = indexName
  deleteIndexError.value = ''
  isDeleteIndexModalOpen.value = true
}

async function handleDeleteIndex() {
  deleteIndexError.value = ''
  if (!indexToDelete.value) return
  try {
    await deleteIndex(props.collectionName, indexToDelete.value)
    isDeleteIndexModalOpen.value = false
    await fetchIndexes()
  }
  catch (e) {
    deleteIndexError.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.collectionInfos.errorDeleteIndex')
  }
}

const INDEX_FLAG_BADGES: Array<{ key: 'unique' | 'text' | 'expire', label: string, color: string }> = [
  { key: 'unique', label: 'unique', color: 'warning' },
  { key: 'text', label: 'text', color: 'info' },
  { key: 'expire', label: 'expire', color: 'secondary' },
]

const indexTableColumns = computed<TableColumn<IndexRow>[]>(() => [
  {
    accessorKey: 'name',
    header: t('nuxtUiMongocamp.collectionInfos.columnIndex'),
  },
  {
    accessorKey: 'keys',
    header: t('nuxtUiMongocamp.collectionInfos.columnKeys'),
    cell: ({ row }) => h('span', { class: 'font-mono text-xs' }, row.original.keys),
  },
  {
    id: 'flags',
    header: t('nuxtUiMongocamp.collectionInfos.columnType'),
    cell: ({ row }) => {
      const badges = INDEX_FLAG_BADGES
        .filter(flag => row.original[flag.key])
        .map(flag => h(UBadge, { label: flag.label, color: flag.color, variant: 'subtle', size: 'sm' }))
      // a plain index has none of the special flags — say so instead of leaving the cell blank
      if (badges.length === 0) {
        badges.push(h(UBadge, { label: t('nuxtUiMongocamp.collectionInfos.typeStandard'), color: 'neutral', variant: 'subtle', size: 'sm' }))
      }
      return h('div', { class: 'flex gap-1' }, badges)
    },
  },
  {
    accessorKey: 'sizeKb',
    header: t('nuxtUiMongocamp.collectionInfos.columnSizeKb'),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      row.original.name === '_id_'
        ? null
        : h('div', { class: 'flex justify-end' }, [
            withTooltip(t('nuxtUiMongocamp.collectionInfos.deleteIndexTooltip'), h(UButton, {
              'icon': 'i-lucide-trash-2',
              'color': 'error',
              'variant': 'ghost',
              'size': 'sm',
              'aria-label': t('nuxtUiMongocamp.collectionInfos.deleteIndexTooltip'),
              'onClick': () => confirmDeleteIndex(row.original.name),
            })),
          ]),
  },
])
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
    <UCard v-if="indexRows.length">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-list-tree"
              class="size-4 text-(--ui-primary)"
            />
            <span class="font-semibold">{{ t('nuxtUiMongocamp.collectionInfos.indexes') }}</span>
            <UBadge
              :label="t('nuxtUiMongocamp.collectionInfos.indexesCount', { count: indexRows.length })"
              variant="subtle"
              color="neutral"
              size="sm"
            />
          </div>
          <UButton
            icon="i-lucide-plus"
            :label="t('nuxtUiMongocamp.collectionInfos.createIndex')"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="openCreateIndex"
          />
        </div>
      </template>
      <UTable
        :data="indexRows"
        :columns="indexTableColumns"
      />
    </UCard>

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
              :label="t('nuxtUiMongocamp.collectionInfos.statsSampled', { sampled: statsAnalysis.sampled, total: info.count })"
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
              :loading="statsLoading"
              @click="analyzeFields"
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
            @click="analyzeFields"
          />
        </template>
      </UAlert>
      <template v-if="statsAnalysis">
        <p class="mb-2 text-xs text-dimmed">
          {{ t('nuxtUiMongocamp.collectionInfos.statsNote') }}
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
      v-model:open="isCreateIndexModalOpen"
      :title="t('nuxtUiMongocamp.collectionInfos.createIndexTitle')"
    >
      <template #body>
        <FUDataEdit
          :data="newIndex"
          :schema="createIndexSchema"
          :submit-label="t('nuxtUiMongocamp.collectionInfos.createIndex')"
          submit-icon="i-lucide-plus"
          @data-saved="handleCreateIndex"
        />
        <p
          v-if="createIndexError"
          class="mt-2 text-sm text-error-500"
        >
          {{ createIndexError }}
        </p>
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteIndexModalOpen"
      :title="t('nuxtUiMongocamp.collectionInfos.deleteIndexTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.collectionInfos.confirmDeleteIndex', { indexName: indexToDelete }) }}</p>
        <p
          v-if="deleteIndexError"
          class="mt-2 text-sm text-error-500"
        >
          {{ deleteIndexError }}
        </p>
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isDeleteIndexModalOpen = false"
        />
        <UButton
          :label="t('nuxtUiMongocamp.common.delete')"
          color="error"
          icon="i-lucide-trash-2"
          @click="handleDeleteIndex"
        />
      </template>
    </UModal>

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
