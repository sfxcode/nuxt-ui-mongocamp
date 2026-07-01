<script setup lang="ts">
import { computed, h, reactive, ref, resolveComponent, watch } from 'vue'
import { useMongocampApi, useMongocampIndex, useMongocampSchema, useToast } from '#imports'
import type { TableColumn } from '@nuxt/ui'
import type { CollectionStatus, MongoIndex } from '@sfxcode/nuxt-mongocamp-server'
import type { ColumnDefinition } from '../composables/useMongocampSchema'

const props = withDefaults(defineProps<{
  collectionName: string
  sampleSize?: number
}>(), {
  sampleSize: 500,
})

const { collectionApi, documentApi } = useMongocampApi()
const { schemaFromSamples, schemaToTsInterface } = useMongocampSchema()
const { listIndexes, createIndex, createUniqueIndex, createTextIndex, createExpiringIndex, deleteIndex } = useMongocampIndex()

const UBadge = resolveComponent('UBadge')
const UIcon = resolveComponent('UIcon')
const UButton = resolveComponent('UButton')

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
  toast.add({ title: 'Copied to clipboard', description: 'TypeScript interface copied.', color: 'success' })
}

const schemaTableColumns: TableColumn<SchemaRow>[] = [
  {
    accessorKey: 'field',
    header: 'Field',
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.type,
        color: TYPE_COLORS[row.original.type] ?? 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'required',
    header: 'In all samples',
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
    label: 'Field Name',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUISwitch',
    name: 'sortAscending',
    label: 'Ascending',
  },
  {
    $formkit: 'nuxtUISelectMenu',
    id: 'indexType',
    name: 'indexType',
    label: 'Index Type',
    options: ['standard', 'unique', 'text', 'expiring'],
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIInput',
    name: 'duration',
    label: 'Expire After (e.g. 3600s)',
    help: 'Only used for the expiring index type.',
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
    createIndexError.value = e instanceof Error ? e.message : 'Error creating index'
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
    deleteIndexError.value = e instanceof Error ? e.message : 'Error deleting index'
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
    header: 'Index',
  },
  {
    accessorKey: 'keys',
    header: 'Keys',
    cell: ({ row }) => h('span', { class: 'font-mono text-xs' }, row.original.keys),
  },
  {
    id: 'flags',
    header: 'Type',
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1' }, INDEX_FLAG_BADGES
        .filter(flag => row.original[flag.key])
        .map(flag => h(UBadge, { label: flag.label, color: flag.color, variant: 'subtle', size: 'sm' }))),
  },
  {
    accessorKey: 'sizeKb',
    header: 'Size (KB)',
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      row.original.name === '_id_'
        ? null
        : h('div', { class: 'flex justify-end' }, [
            h(UButton, {
              'icon': 'i-lucide-trash-2',
              'color': 'error',
              'variant': 'ghost',
              'size': 'sm',
              'aria-label': 'Delete index',
              'onClick': () => confirmDeleteIndex(row.original.name),
            }),
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
          Documents
        </div>
        <div class="text-2xl font-semibold">
          {{ info.count }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Data Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.size / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Storage Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.storageSize / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Avg Doc Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.avgObjSize) }} B
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Indexes
        </div>
        <div class="text-2xl font-semibold">
          {{ info.nindexes }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Index Size
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
            <span class="font-semibold">Indexes</span>
            <UBadge
              :label="`${indexRows.length} indexes`"
              variant="subtle"
              color="neutral"
              size="sm"
            />
          </div>
          <UButton
            icon="i-lucide-plus"
            label="Create Index"
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
              :label="`${schemaRows.length} fields`"
              variant="subtle"
              color="neutral"
              size="sm"
            />
          </div>
          <UButton
            icon="i-lucide-copy"
            label="Copy as TS Interface"
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
      title="Create Index"
    >
      <template #body>
        <FUDataEdit
          :data="newIndex"
          :schema="createIndexSchema"
          submit-label="Create Index"
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
      title="Delete Index"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>Are you sure you want to delete the index "{{ indexToDelete }}"? This action cannot be undone.</p>
        <p
          v-if="deleteIndexError"
          class="mt-2 text-sm text-error-500"
        >
          {{ deleteIndexError }}
        </p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="isDeleteIndexModalOpen = false"
        />
        <UButton
          label="Delete"
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
