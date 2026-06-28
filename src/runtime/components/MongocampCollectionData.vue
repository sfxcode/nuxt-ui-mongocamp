<script setup lang="ts">
import { h, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useMongocampApi } from '#imports'
import { useMongocampSchema } from '../composables/useMongocampSchema'
import useMongocampCollection from '../composables/useMongocampCollection'

const props = defineProps<{
  collectionName: string
}>()

const { collectionApi, documentApi } = useMongocampApi()
const { schemaToColumnDefinition } = useMongocampSchema()
const { pagination, total } = useMongocampCollection()

const UButton = resolveComponent('UButton')

type Row = Record<string, unknown>
type SortEntry = { id: string, desc: boolean }

function sortHeader(column: Column<Row>, label: string) {
  const isSorted = column.getIsSorted()
  return h(UButton, {
    color: 'neutral',
    variant: 'ghost',
    label,
    icon: isSorted === 'asc'
      ? 'i-lucide-arrow-up-narrow-wide'
      : isSorted === 'desc'
        ? 'i-lucide-arrow-down-wide-narrow'
        : 'i-lucide-arrow-up-down',
    class: '-mx-2.5',
    onClick: () => column.toggleSorting(isSorted === 'asc'),
  })
}

const columns = ref<TableColumn<Row>[]>([])
const documents = ref<Row[]>([])
const loading = ref(false)
const filterText = ref('')
const sorting = ref<SortEntry[]>([])
const isInitializing = ref(false)
const detailOpen = ref(false)
const detailContent = ref('')

function openDetail(value: unknown) {
  detailContent.value = JSON.stringify(value, null, 2)
  detailOpen.value = true
}

function sortingToMongoSort(s: SortEntry[]): string[] {
  return s.map(col => (col.desc ? `-${col.id}` : col.id))
}

watch(sorting, () => {
  if (isInitializing.value) return
  pagination.value.pageIndex = 1
  fetchDocuments()
})

function toIso(value: unknown): string {
  if (!value) return ''
  try {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' || typeof value === 'number') return new Date(value).toISOString()
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      if ('$date' in obj) {
        const d = obj.$date
        if (typeof d === 'string' || typeof d === 'number') return new Date(d).toISOString()
        // { $date: { $numberLong: "..." } }
        if (typeof d === 'object' && d !== null && '$numberLong' in (d as Record<string, unknown>)) {
          return new Date(Number((d as Record<string, unknown>).$numberLong)).toISOString()
        }
      }
    }
    return String(value)
  }
  catch {
    return String(value)
  }
}

function toDateDisplay(value: unknown): string {
  const iso = toIso(value)
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  }
  catch {
    return iso
  }
}

function isMetaData(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  return 'created' in obj || 'updated' in obj
}

function makeCell(key: string, type: string) {
  return ({ row }: { row: { original: Row } }) => {
    const raw = row.original[key]
    if (type === 'date-time' && raw) {
      return h('span', toDateDisplay(raw))
    }
    if (raw === null || raw === undefined) {
      return h('span', '')
    }
    if (typeof raw === 'object') {
      if (!Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>
        if ('$oid' in obj) return h('span', { class: 'font-mono text-xs' }, String(obj.$oid))
        if ('$date' in obj) return h('span', toDateDisplay(obj))
        if (isMetaData(obj)) {
          const rows: ReturnType<typeof h>[] = []
          if (obj.created) {
            rows.push(h('div', [
              h('span', { class: 'text-dimmed' }, 'created: '),
              h('span', toDateDisplay(obj.created)),
            ]))
          }
          if (obj.updated && obj.updated !== obj.created) {
            rows.push(h('div', [
              h('span', { class: 'text-dimmed' }, 'updated: '),
              h('span', toDateDisplay(obj.updated)),
            ]))
          }
          if (obj.createdBy) {
            rows.push(h('div', [
              h('span', { class: 'text-dimmed' }, 'by: '),
              h('span', String(obj.createdBy)),
            ]))
          }
          return h('div', { class: 'flex flex-col gap-0.5 text-xs py-1' }, rows)
        }
      }
      return h(UButton, {
        'icon': Array.isArray(raw) ? 'i-lucide-list' : 'i-lucide-braces',
        'color': 'neutral',
        'variant': 'ghost',
        'size': 'xs',
        'aria-label': Array.isArray(raw) ? 'View array' : 'View object',
        'onClick': () => openDetail(raw),
      })
    }
    return h('span', String(raw))
  }
}

async function initSchema() {
  try {
    const jsonSchema = await collectionApi.getJsonSchema({ collectionName: props.collectionName })
    const defKey = jsonSchema.$ref.replace('#/definitions/', '')
    const definition = jsonSchema.definitions[defKey]
    if (!definition || Object.keys(definition.properties ?? {}).length === 0) {
      columns.value = []
      return
    }
    const fields = Object.keys(definition.properties)
    const colDefs = schemaToColumnDefinition(definition, fields)
    columns.value = colDefs.map(col => ({
      accessorKey: col.columnKey,
      header: ({ column }: { column: Column<Row> }) => sortHeader(column, col.columnName),
      cell: makeCell(col.columnKey, col.columnType),
    }))
  }
  catch {
    columns.value = []
  }
}

async function fetchDocuments() {
  loading.value = true
  try {
    const res = await documentApi.listDocumentsRaw({
      collectionName: props.collectionName,
      rowsPerPage: pagination.value.pageSize,
      page: pagination.value.pageIndex,
      sort: sorting.value.length ? sortingToMongoSort(sorting.value) : undefined,
    })
    total.value = +(res.raw.headers.get('x-pagination-count-rows') ?? 0)
    const rows = (await res.value()) as Row[]
    documents.value = rows
    // fallback: derive columns from first row if schema produced nothing
    const firstRow = rows[0]
    if (columns.value.length === 0 && firstRow) {
      const keys = Object.keys(firstRow)
      const orderedKeys = [
        ...keys.filter(k => k === '_id'),
        ...keys.filter(k => k !== '_id' && k !== 'metaData').sort(),
        ...keys.filter(k => k === 'metaData'),
      ]
      columns.value = orderedKeys.map(key => ({
        accessorKey: key,
        header: ({ column }: { column: Column<Row> }) => sortHeader(column, key),
        cell: makeCell(key, 'string'),
      }))
    }
  }
  finally {
    loading.value = false
  }
}

async function init() {
  isInitializing.value = true
  sorting.value = []
  pagination.value.pageIndex = 1
  filterText.value = ''
  columns.value = []
  documents.value = []
  await initSchema()
  await fetchDocuments()
  isInitializing.value = false
}

watch(() => props.collectionName, init, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <UInput
        v-model="filterText"
        icon="i-lucide-search"
        placeholder="Filter rows..."
        size="sm"
        class="flex-1 max-w-xs"
      />
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500 dark:text-gray-400 shrink-0">
          {{ total }} documents
        </span>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          aria-label="Reload"
          @click="init"
        />
        <UPagination
          v-model:page="pagination.pageIndex"
          :total="total"
          :items-per-page="pagination.pageSize"
          @update:page="fetchDocuments"
        />
      </div>
    </div>
    <UTable
      v-model:global-filter="filterText"
      v-model:sorting="sorting"
      :sorting-options="{ manualSorting: true }"
      :data="documents"
      :columns="columns"
      :loading="loading"
    />

    <UModal
      v-model:open="detailOpen"
      title="Details"
    >
      <template #body>
        <pre class="text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">{{ detailContent }}</pre>
      </template>
    </UModal>
  </div>
</template>
