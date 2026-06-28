<script setup lang="ts">
import { h, ref, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { useMongocampApi } from '#imports'
import { useJsonSchema } from '../composables/useMongocampSchema'
import useMongocampCollection from '../composables/useMongocampCollection'

const props = defineProps<{
  collectionName: string
}>()

const { collectionApi, documentApi } = useMongocampApi()
const { schemaToColumnDefinition } = useJsonSchema()
const { pagination, total } = useMongocampCollection()

type Row = Record<string, unknown>

const columns = ref<TableColumn<Row>[]>([])
const documents = ref<Row[]>([])
const loading = ref(false)

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('$oid' in obj) return String(obj.$oid)
    if ('$date' in obj) return new Date(String(obj.$date)).toLocaleString()
    return JSON.stringify(value)
  }
  return String(value)
}

function makeCell(key: string, type: string) {
  return ({ row }: { row: { original: Row } }) => {
    const raw = row.original[key]
    if (type === 'date-time' && raw) {
      const obj = typeof raw === 'object' ? raw as Record<string, unknown> : null
      const ts = obj && '$date' in obj ? String(obj.$date) : String(raw)
      return h('span', new Date(ts).toLocaleString())
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
