<script setup lang="ts">
import { h, ref, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { useMongocampApi } from '#imports'
import { useMongocampSchema } from '../composables/useMongocampSchema'
import useMongocampCollection from '../composables/useMongocampCollection'

const props = defineProps<{
  collectionName: string
}>()

const { collectionApi, documentApi } = useMongocampApi()
const { schemaToColumnDefinition } = useMongocampSchema()
const { pagination, total } = useMongocampCollection()

type Row = Record<string, unknown>

const columns = ref<TableColumn<Row>[]>([])
const documents = ref<Row[]>([])
const loading = ref(false)

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

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('$oid' in obj) return String(obj.$oid)
    if ('$date' in obj) return toDateDisplay(obj)
    return JSON.stringify(value)
  }
  return String(value)
}

function isMetaData(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return 'created' in obj || 'updated' in obj
}

function makeCell(key: string, type: string) {
  return ({ row }: { row: { original: Row } }) => {
    const raw = row.original[key]
    if (type === 'date-time' && raw) {
      return h('span', toDateDisplay(raw))
    }
    if (isMetaData(raw)) {
      const meta = raw as Record<string, unknown>
      const rows: ReturnType<typeof h>[] = []
      if (meta.created) {
        rows.push(h('div', [
          h('span', { class: 'text-dimmed' }, 'created: '),
          h('span', toDateDisplay(meta.created)),
        ]))
      }
      if (meta.updated && meta.updated !== meta.created) {
        rows.push(h('div', [
          h('span', { class: 'text-dimmed' }, 'updated: '),
          h('span', toDateDisplay(meta.updated)),
        ]))
      }
      if (meta.createdBy) {
        rows.push(h('div', [
          h('span', { class: 'text-dimmed' }, 'by: '),
          h('span', String(meta.createdBy)),
        ]))
      }
      return h('div', { class: 'flex flex-col gap-0.5 text-xs py-1' }, rows)
    }
    return h('span', cellValue(raw))
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
      header: col.columnName,
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
    })
    total.value = +(res.raw.headers.get('x-pagination-count-rows') ?? 0)
    const rows = (await res.value()) as Row[]
    documents.value = rows
    // fallback: derive columns from first row if schema produced nothing
    const firstRow = rows[0]
    if (columns.value.length === 0 && firstRow) {
      columns.value = Object.keys(firstRow).map(key => ({
        accessorKey: key,
        header: key,
        cell: makeCell(key, 'string'),
      }))
    }
  }
  finally {
    loading.value = false
  }
}

async function init() {
  pagination.value.pageIndex = 1
  columns.value = []
  documents.value = []
  await initSchema()
  await fetchDocuments()
}

watch(() => props.collectionName, init, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {{ total }} documents
      </span>
      <div class="flex items-center gap-2">
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
      :data="documents"
      :columns="columns"
      :loading="loading"
    />
  </div>
</template>
