<script setup lang="ts">
import { h, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { FormKitSchemaDefinition } from '@formkit/core'
import { useMongocampApi } from '#imports'
import useMongocampCollection from '../composables/useMongocampCollection'
import { useMongocampBucket } from '../composables/useMongocampBucket'
import { useMongocampSchema } from '../composables/useMongocampSchema'
import type { ColumnDefinition } from '../composables/useMongocampSchema'
import { columnsToFormKitSchema, documentToFormData, formDataToDocument } from '../composables/useMongocampDynamicForm'
import useMongocampDocument from '../composables/useMongocampDocument'
import { useMongocampQuery } from '../composables/useMongocampQuery'

const props = defineProps<{
  collectionName: string
}>()

const { documentApi } = useMongocampApi()
const { pagination, total } = useMongocampCollection()
const { isBucketCollection, fileIdForRow, downloadingFileIds, uploading, downloadFile, uploadFile } = useMongocampBucket()
const { schemaFromSamples } = useMongocampSchema()
const { ensureMetaData } = useMongocampDocument()
const { like, or } = useMongocampQuery()

const fileInputRef = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInputRef.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const success = await uploadFile(props.collectionName, file)
  if (success) await fetchDocuments()
}

const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

type Row = Record<string, unknown>
type SortEntry = { id: string, desc: boolean }

const isEditModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const editMode = ref<'insert' | 'update'>('insert')
const editDocId = ref<string | undefined>(undefined)
const editJson = ref('{}')
const editError = ref('')
const docToDelete = ref<string | undefined>(undefined)
const deleteError = ref('')

// Populated per modal-open from the currently-loaded page (schemaFromSamples) — empty when the
// collection has no loaded rows to infer a schema from, which is the signal to fall back to the
// raw-JSON-textarea modal below (editColumns.length === 0).
const editColumns = ref<ColumnDefinition[]>([])
// columnsToFormKitSchema's own return type is a loose internal shape (kept simple for unit
// testing); FormKit's real schema union requires a cast at the boundary where it's actually
// bound to a component prop, same as the DocumentApi.update cast below.
const editSchema = ref<FormKitSchemaDefinition>([])
const editFormData = ref<Record<string, unknown>>({})
const originalRow = ref<Row | undefined>(undefined)

function getDocId(row: Row): string | undefined {
  const id = row._id
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id !== null && '$oid' in (id as Record<string, unknown>))
    return String((id as Record<string, unknown>).$oid)
  return undefined
}

function openInsert() {
  editMode.value = 'insert'
  editDocId.value = undefined
  editError.value = ''
  originalRow.value = undefined
  editColumns.value = schemaFromSamples(documents.value)
  if (editColumns.value.length > 0) {
    editSchema.value = columnsToFormKitSchema(editColumns.value) as unknown as FormKitSchemaDefinition
    editFormData.value = {}
  }
  else {
    editJson.value = '{}'
  }
  isEditModalOpen.value = true
}

function openEdit(row: Row) {
  editMode.value = 'update'
  editDocId.value = getDocId(row)
  editError.value = ''
  originalRow.value = row
  editColumns.value = schemaFromSamples(documents.value)
  if (editColumns.value.length > 0) {
    editSchema.value = columnsToFormKitSchema(editColumns.value) as unknown as FormKitSchemaDefinition
    editFormData.value = documentToFormData(row, editColumns.value)
  }
  else {
    editJson.value = JSON.stringify(row, null, 2)
  }
  isEditModalOpen.value = true
}

function confirmDelete(row: Row) {
  docToDelete.value = getDocId(row)
  deleteError.value = ''
  isDeleteModalOpen.value = true
}

async function handleSave() {
  editError.value = ''
  let payload: Record<string, unknown> & { metaData?: Partial<{ createdBy: string, updatedBy: string, created: string | Date, updated: string | Date }> }
  if (editColumns.value.length > 0) {
    payload = formDataToDocument(editFormData.value, editColumns.value, editMode.value === 'update' ? originalRow.value : undefined)
  }
  else {
    try {
      payload = JSON.parse(editJson.value)
    }
    catch {
      editError.value = 'Invalid JSON'
      return
    }
  }
  ensureMetaData(payload)
  try {
    if (editMode.value === 'insert') {
      await documentApi.insert({ collectionName: props.collectionName, requestBody: payload as { [key: string]: string } })
    }
    else {
      if (!editDocId.value) return
      const body: Record<string, unknown> = { ...payload }
      delete body._id
      // UpdateRequest name collides with a models type in the generated client — cast through unknown
      await documentApi.update({ collectionName: props.collectionName, documentId: editDocId.value, requestBody: body as { [key: string]: string } } as unknown as Parameters<typeof documentApi.update>[0])
    }
    isEditModalOpen.value = false
    await fetchDocuments()
  }
  catch (e) {
    editError.value = e instanceof Error ? e.message : 'Error saving document'
  }
}

async function handleDelete() {
  deleteError.value = ''
  if (!docToDelete.value) return
  try {
    await documentApi._delete({ collectionName: props.collectionName, documentId: docToDelete.value })
    isDeleteModalOpen.value = false
    await fetchDocuments()
  }
  catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Error deleting document'
  }
}

function makeActionsColumn(): TableColumn<Row> {
  return {
    id: 'actions',
    header: '',
    cell: ({ row }: { row: { original: Row } }) => {
      const buttons: ReturnType<typeof h>[] = []
      if (isBucketCollection(props.collectionName)) {
        const fileId = fileIdForRow(props.collectionName, row.original)
        if (fileId) {
          buttons.push(withTooltip('Download file', h(UButton, {
            'icon': 'i-lucide-download',
            'color': 'neutral',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': 'Download file',
            'loading': downloadingFileIds.value.has(fileId),
            'onClick': () => downloadFile(props.collectionName, fileId),
          })))
        }
      }
      buttons.push(
        withTooltip('Edit document', h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Edit document',
          'onClick': () => openEdit(row.original),
        })),
        withTooltip('Delete document', h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Delete document',
          'onClick': () => confirmDelete(row.original),
        })),
      )
      return h('div', { class: 'flex gap-1 justify-end' }, buttons)
    },
  }
}

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
const filterableColumns = ref<string[]>([])
const sorting = ref<SortEntry[]>([])
const isInitializing = ref(false)
const detailOpen = ref(false)
const detailContent = ref('')
let filterTimer: ReturnType<typeof setTimeout> | undefined

function openDetail(value: unknown) {
  detailContent.value = JSON.stringify(value, null, 2)
  detailOpen.value = true
}

function buildLuceneFilter(term: string): string | undefined {
  const t = term.trim()
  if (!t || filterableColumns.value.length === 0) return undefined
  return or(...filterableColumns.value.map(col => like(col, t))) || undefined
}

function onFilterInput() {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    pagination.value.pageIndex = 1
    fetchDocuments()
  }, 300)
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

const CELL_TEXT_MAX_LENGTH = 60

function truncateText(value: string, maxLength = CELL_TEXT_MAX_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
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
      const viewLabel = Array.isArray(raw) ? 'View array' : 'View object'
      return withTooltip(viewLabel, h(UButton, {
        'icon': Array.isArray(raw) ? 'i-lucide-list' : 'i-lucide-braces',
        'color': 'neutral',
        'variant': 'ghost',
        'size': 'xs',
        'aria-label': viewLabel,
        'onClick': () => openDetail(raw),
      }))
    }
    const text = String(raw)
    const truncated = truncateText(text)
    return h('span', { title: truncated !== text ? text : undefined }, truncated)
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
      filter: buildLuceneFilter(filterText.value),
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
      filterableColumns.value = orderedKeys.filter(k => k !== '_id' && k !== 'metaData' && typeof firstRow[k] === 'string')
      columns.value.push(makeActionsColumn())
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
  filterableColumns.value = []
  columns.value = []
  documents.value = []
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
        :disabled="filterableColumns.length === 0"
        @input="onFilterInput"
      />
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500 dark:text-gray-400 shrink-0">
          {{ total }} documents
        </span>
        <UTooltip
          v-if="isBucketCollection(collectionName)"
          text="Upload file"
        >
          <UButton
            icon="i-lucide-upload"
            color="primary"
            variant="ghost"
            size="sm"
            :loading="uploading"
            aria-label="Upload file"
            @click="openFilePicker"
          />
        </UTooltip>
        <UTooltip
          v-else
          text="Insert document"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            aria-label="Insert document"
            @click="openInsert"
          />
        </UTooltip>
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          @change="handleFileSelected"
        >
        <UTooltip text="Reload">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            aria-label="Reload"
            @click="init"
          />
        </UTooltip>
        <UPagination
          v-model:page="pagination.pageIndex"
          :total="total"
          :items-per-page="pagination.pageSize"
          @update:page="fetchDocuments"
        />
      </div>
    </div>
    <UTable
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

    <UModal
      v-model:open="isEditModalOpen"
      :title="editMode === 'insert' ? 'Insert Document' : 'Edit Document'"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <FUDataEdit
          v-if="editColumns.length > 0"
          :data="editFormData"
          :schema="editSchema"
          :submit-label="editMode === 'insert' ? 'Insert' : 'Save'"
          :submit-icon="editMode === 'insert' ? 'i-lucide-plus' : 'i-lucide-save'"
          @data-saved="handleSave"
        />
        <textarea
          v-else
          v-model="editJson"
          class="w-full h-80 font-mono text-xs p-2 border rounded bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:outline-none resize-y"
          spellcheck="false"
        />
        <p
          v-if="editError"
          class="mt-2 text-sm text-error-500"
        >
          {{ editError }}
        </p>
      </template>
      <template
        v-if="editColumns.length === 0"
        #footer
      >
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="isEditModalOpen = false"
        />
        <UButton
          :label="editMode === 'insert' ? 'Insert' : 'Save'"
          :icon="editMode === 'insert' ? 'i-lucide-plus' : 'i-lucide-save'"
          @click="handleSave"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteModalOpen"
      title="Delete Document"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>Are you sure you want to delete this document? This action cannot be undone.</p>
        <p
          v-if="deleteError"
          class="mt-2 text-sm text-error-500"
        >
          {{ deleteError }}
        </p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="isDeleteModalOpen = false"
        />
        <UButton
          label="Delete"
          color="error"
          icon="i-lucide-trash-2"
          @click="handleDelete"
        />
      </template>
    </UModal>
  </div>
</template>
