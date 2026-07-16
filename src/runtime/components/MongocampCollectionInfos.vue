<script setup lang="ts">
import { computed, h, reactive, ref, resolveComponent, watch } from 'vue'
import { useI18n, useMongocampClientApi, useMongocampIndex, useMongocampSchema, useToast } from '#imports'
import type { TableColumn } from '@nuxt/ui'
import type { CollectionStatus, MongoIndex } from '@sfxcode/nuxt-mongocamp-server'
import type { ColumnDefinition } from '../composables/useMongocampSchema'

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

const schemaTableColumns: TableColumn<SchemaRow>[] = [
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
]

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

const indexTableColumns: TableColumn<IndexRow>[] = [
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
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1' }, INDEX_FLAG_BADGES
        .filter(flag => row.original[flag.key])
        .map(flag => h(UBadge, { label: flag.label, color: flag.color, variant: 'subtle', size: 'sm' }))),
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
]
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
          <UButton
            icon="i-lucide-copy"
            :label="t('nuxtUiMongocamp.collectionInfos.copyAsTs')"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="copySchemaAsTs"
          />
        </div>
      </template>
      <UTable
        :data="schemaRows"
        :columns="schemaTableColumns"
      />
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
  </div>
</template>

<style scoped>
</style>
