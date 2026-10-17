<script setup lang="ts">
import { computed, h, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useI18n, useMongocampClientApi } from '#imports'
import useMongocampCollection from '../composables/useMongocampCollection'
import { useMongocampBucket } from '../composables/useMongocampBucket'
import { isIsoDateTimeString, unwrapExtendedJson, wrapExtendedJson } from '../composables/useMongocampExtendedJson'
import { downloadTextFile, rowsToCsv } from '../composables/useMongocampExport'
import useMongocampDocument from '../composables/useMongocampDocument'
import { useMongocampQuery } from '../composables/useMongocampQuery'

const props = defineProps<{
  collectionName: string
}>()

const { t } = useI18n()
const { documentApi } = useMongocampClientApi()
const { pagination, total } = useMongocampCollection()
const { isBucketCollection, fileIdForRow, downloadingFileIds, uploading, downloadFile, uploadFile } = useMongocampBucket()
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

// Unwrapped current page of rows, passed to FUAutoForm purely as schema-inference input —
// empty when the collection has no loaded rows to infer a schema from, which is the signal to
// fall back to the raw-JSON-textarea modal below (editSamples.length === 0).
const editSamples = ref<Record<string, unknown>[]>([])
const editFormData = ref<Record<string, unknown>>({})
const originalRow = ref<Row | undefined>(undefined)

function omitId(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row }
  delete rest._id
  return rest
}

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
  editSamples.value = documents.value.map(row => omitId(unwrapExtendedJson(row) as Record<string, unknown>))
  if (editSamples.value.length > 0) {
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
  editSamples.value = documents.value.map(r => omitId(unwrapExtendedJson(r) as Record<string, unknown>))
  if (editSamples.value.length > 0) {
    editFormData.value = omitId(unwrapExtendedJson(row) as Record<string, unknown>)
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
  if (editSamples.value.length > 0) {
    payload = wrapExtendedJson(editFormData.value, editMode.value === 'update' ? originalRow.value : undefined)
  }
  else {
    try {
      payload = JSON.parse(editJson.value)
    }
    catch {
      editError.value = t('nuxtUiMongocamp.collectionData.invalidJson')
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
    editError.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.collectionData.errorSave')
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
    deleteError.value = e instanceof Error ? e.message : t('nuxtUiMongocamp.collectionData.errorDelete')
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
          buttons.push(withTooltip(t('nuxtUiMongocamp.collectionData.downloadFileTooltip'), h(UButton, {
            'icon': 'i-lucide-download',
            'color': 'neutral',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collectionData.downloadFileTooltip'),
            'loading': downloadingFileIds.value.has(fileId),
            'onClick': () => downloadFile(props.collectionName, fileId),
          })))
        }
      }
      buttons.push(
        withTooltip(t('nuxtUiMongocamp.collectionData.editDocumentTooltip'), h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.collectionData.editDocumentTooltip'),
          'onClick': () => openEdit(row.original),
        })),
        withTooltip(t('nuxtUiMongocamp.collectionData.deleteDocumentTooltip'), h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.collectionData.deleteDocumentTooltip'),
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
const columnVisibility = ref<Record<string, boolean>>({})
const PAGE_SIZES = [10, 20, 50, 100]
const isInitializing = ref(false)
const detailOpen = ref(false)
const detailContent = ref('')
let filterTimer: ReturnType<typeof setTimeout> | undefined

function openDetail(value: unknown) {
  detailContent.value = JSON.stringify(value, null, 2)
  detailOpen.value = true
}

function buildLuceneFilter(term: string): string | undefined {
  const trimmed = term.trim()
  if (!trimmed || filterableColumns.value.length === 0) return undefined
  return or(...filterableColumns.value.map(col => like(col, trimmed))) || undefined
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
const TIMESTAMP_PREFIX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

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
              h('span', { class: 'text-dimmed' }, t('nuxtUiMongocamp.collectionData.createdByPrefix')),
              h('span', toDateDisplay(obj.created)),
            ]))
          }
          if (obj.updated && obj.updated !== obj.created) {
            rows.push(h('div', [
              h('span', { class: 'text-dimmed' }, t('nuxtUiMongocamp.collectionData.updatedByPrefix')),
              h('span', toDateDisplay(obj.updated)),
            ]))
          }
          if (obj.createdBy) {
            rows.push(h('div', [
              h('span', { class: 'text-dimmed' }, t('nuxtUiMongocamp.collectionData.byPrefix')),
              h('span', String(obj.createdBy)),
            ]))
          }
          return h('div', { class: 'flex flex-col gap-0.5 text-xs py-1' }, rows)
        }
      }
      const viewLabel = Array.isArray(raw) ? t('nuxtUiMongocamp.collectionData.viewArray') : t('nuxtUiMongocamp.collectionData.viewObject')
      return withTooltip(viewLabel, h(UButton, {
        'icon': Array.isArray(raw) ? 'i-lucide-list' : 'i-lucide-braces',
        'color': 'neutral',
        'variant': 'ghost',
        'size': 'xs',
        'aria-label': viewLabel,
        'onClick': () => openDetail(raw),
      }))
    }
    // a column can mix real dates and ISO strings (e.g. generated data), so decide per cell; date-only
    // strings are left alone because formatting them would shift the day by the UTC offset
    if (typeof raw === 'string' && TIMESTAMP_PREFIX.test(raw) && isIsoDateTimeString(raw)) {
      return h('span', toDateDisplay(raw))
    }
    const text = String(raw)
    const truncated = truncateText(text)
    return h('span', { title: truncated !== text ? text : undefined }, truncated)
  }
}

const loadError = ref<unknown>(null)

async function fetchDocuments() {
  loading.value = true
  loadError.value = null
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
      columns.value = orderedKeys.map((key, index) => ({
        accessorKey: key,
        header: ({ column }: { column: Column<Row> }) => sortHeader(column, key),
        cell: makeCell(key, 'string'),
        // keep the first column (usually _id) pinned so rows stay identifiable when the table scrolls sideways
        ...(index === 0 ? { meta: { class: { th: 'sticky left-0 z-10 bg-default', td: 'sticky left-0 z-10 bg-default' } } } : {}),
      }))
      filterableColumns.value = orderedKeys.filter(k => k !== '_id' && k !== 'metaData' && typeof firstRow[k] === 'string')
      columns.value.push(makeActionsColumn())
    }
  }
  catch (e: unknown) {
    loadError.value = e
    documents.value = []
    total.value = 0
  }
  finally {
    loading.value = false
  }
}

function onPageSizeChange() {
  pagination.value.pageIndex = 1
  fetchDocuments()
}

const dataColumnKeys = computed(() =>
  columns.value.flatMap(column => ('accessorKey' in column && typeof column.accessorKey === 'string' ? [column.accessorKey] : [])),
)

const columnMenuItems = computed(() =>
  dataColumnKeys.value.map(key => ({
    label: key,
    type: 'checkbox' as const,
    checked: columnVisibility.value[key] !== false,
    onUpdateChecked: (checked: boolean) => {
      columnVisibility.value = { ...columnVisibility.value, [key]: checked }
    },
    onSelect: (e: Event) => e.preventDefault(),
  })),
)

// Exports the rows on the current page (not the whole collection) so no extra requests are made;
// CSV honours the column-visibility toggles, JSON always carries the full documents.
function exportPage(format: 'json' | 'csv') {
  const rows = documents.value.map(row => unwrapExtendedJson(row) as Row)
  if (format === 'json') {
    downloadTextFile(`${props.collectionName}.json`, JSON.stringify(rows, null, 2), 'application/json')
    return
  }
  const keys = dataColumnKeys.value.filter(key => columnVisibility.value[key] !== false)
  downloadTextFile(`${props.collectionName}.csv`, rowsToCsv(rows, keys), 'text/csv')
}

const exportMenuItems = computed(() => [
  { label: t('nuxtUiMongocamp.collectionData.exportJson'), icon: 'i-lucide-file-json', onSelect: () => exportPage('json') },
  { label: t('nuxtUiMongocamp.collectionData.exportCsv'), icon: 'i-lucide-file-spreadsheet', onSelect: () => exportPage('csv') },
])

async function init() {
  isInitializing.value = true
  sorting.value = []
  pagination.value.pageIndex = 1
  filterText.value = ''
  filterableColumns.value = []
  columnVisibility.value = {}
  columns.value = []
  documents.value = []
  await fetchDocuments()
  isInitializing.value = false
}

watch(() => props.collectionName, init, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <UInput
        v-model="filterText"
        icon="i-lucide-search"
        :placeholder="t('nuxtUiMongocamp.collectionData.filterPlaceholder')"
        size="sm"
        class="flex-1 max-w-xs"
        :disabled="filterableColumns.length === 0"
        @input="onFilterInput"
      />
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-gray-500 dark:text-gray-400 shrink-0">
          {{ t('nuxtUiMongocamp.collectionData.documentsCount', { count: total }) }}
        </span>
        <UTooltip
          v-if="isBucketCollection(collectionName)"
          :text="t('nuxtUiMongocamp.collectionData.uploadFileTooltip')"
        >
          <UButton
            icon="i-lucide-upload"
            color="primary"
            variant="ghost"
            size="sm"
            :loading="uploading"
            :aria-label="t('nuxtUiMongocamp.collectionData.uploadFileTooltip')"
            @click="openFilePicker"
          />
        </UTooltip>
        <UTooltip
          v-else
          :text="t('nuxtUiMongocamp.collectionData.insertDocumentTooltip')"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="ghost"
            size="sm"
            :aria-label="t('nuxtUiMongocamp.collectionData.insertDocumentTooltip')"
            @click="openInsert"
          />
        </UTooltip>
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          @change="handleFileSelected"
        >
        <UTooltip :text="t('nuxtUiMongocamp.collectionData.reloadTooltip')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('nuxtUiMongocamp.collectionData.reloadTooltip')"
            @click="init"
          />
        </UTooltip>
        <UDropdownMenu :items="columnMenuItems">
          <UButton
            icon="i-lucide-columns-3"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="dataColumnKeys.length === 0"
            :aria-label="t('nuxtUiMongocamp.collectionData.columnsTooltip')"
          />
        </UDropdownMenu>
        <UDropdownMenu :items="exportMenuItems">
          <UButton
            icon="i-lucide-download"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="documents.length === 0"
            :aria-label="t('nuxtUiMongocamp.collectionData.exportTooltip')"
          />
        </UDropdownMenu>
        <USelect
          v-model="pagination.pageSize"
          :items="PAGE_SIZES"
          size="sm"
          class="w-20"
          :aria-label="t('nuxtUiMongocamp.collectionData.pageSizeLabel')"
          @update:model-value="onPageSizeChange"
        />
        <UPagination
          v-model:page="pagination.pageIndex"
          :total="total"
          :items-per-page="pagination.pageSize"
          @update:page="fetchDocuments"
        />
      </div>
    </div>
    <MongocampErrorAlert
      :error="loadError"
      @retry="fetchDocuments"
    />

    <UTable
      v-model:sorting="sorting"
      v-model:column-visibility="columnVisibility"
      :sorting-options="{ manualSorting: true }"
      :data="documents"
      :columns="columns"
      :loading="loading"
    >
      <template #empty>
        <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.documents')" />
      </template>
    </UTable>

    <UModal
      v-model:open="detailOpen"
      :title="t('nuxtUiMongocamp.collectionData.detailsTitle')"
    >
      <template #body>
        <pre class="text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">{{ detailContent }}</pre>
      </template>
    </UModal>

    <UModal
      v-model:open="isEditModalOpen"
      :title="editMode === 'insert' ? t('nuxtUiMongocamp.collectionData.insertDocumentTitle') : t('nuxtUiMongocamp.collectionData.editDocumentTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <FUAutoForm
          v-if="editSamples.length > 0"
          v-model="editFormData"
          :data="editSamples"
          :submit-label="editMode === 'insert' ? t('nuxtUiMongocamp.collectionData.insert') : t('nuxtUiMongocamp.common.save')"
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
        v-if="editSamples.length === 0"
        #footer
      >
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isEditModalOpen = false"
        />
        <UButton
          :label="editMode === 'insert' ? t('nuxtUiMongocamp.collectionData.insert') : t('nuxtUiMongocamp.common.save')"
          :icon="editMode === 'insert' ? 'i-lucide-plus' : 'i-lucide-save'"
          @click="handleSave"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteModalOpen"
      :title="t('nuxtUiMongocamp.collectionData.deleteDocumentTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.collectionData.confirmDeleteDocument') }}</p>
        <p
          v-if="deleteError"
          class="mt-2 text-sm text-error-500"
        >
          {{ deleteError }}
        </p>
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isDeleteModalOpen = false"
        />
        <UButton
          :label="t('nuxtUiMongocamp.common.delete')"
          color="error"
          icon="i-lucide-trash-2"
          @click="handleDelete"
        />
      </template>
    </UModal>
  </div>
</template>
