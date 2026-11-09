<script setup lang="ts">
import { computed, h, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useI18n, useMongocampClientApi, useMongocampError, useMongocampPermissions, useMongocampRoles, useMongocampSchema, useToast } from '#imports'
import useMongocampCollection from '../composables/useMongocampCollection'
import { useMongocampBucket } from '../composables/useMongocampBucket'
import { useMongocampIndex } from '../composables/useMongocampIndex'
import { unwrapExtendedJson, wrapExtendedJson } from '../composables/useMongocampExtendedJson'
import { readJsonKeepingLongs } from '../utils/bigIntJson'
import { buildPartialBody, diffDocument, hasChanges } from '../utils/documentDiff'
import { isIsoDateTimeString } from '../utils/isoDate'
import { formatDocuments, toExportRow, valueToJson } from '../utils/exportDocuments'
import { downloadTextFile, rowsToCsv } from '../utils/exportRows'
import { runBulkDelete } from '../utils/bulkDelete'
import { BulkMatchShortfall, BulkUnaddressableId, buildIdFilter, isEditableField, runBulkUpdate } from '../utils/bulkEdit'
import type { ImportColumnType } from '../utils/importRows'
import { isObjectIdHex } from '../utils/objectId'
import { createSelectColumn } from '../utils/createSelectColumn'
import { operatorsFor, toFilterFieldType } from '../utils/filterBuilder'
import type { FilterFieldType } from '../utils/filterBuilder'
import { emptyGroup, emptyQueryState, parseSortEntry, usableProjection } from '../utils/queryState'
import type { QueryState } from '../utils/queryState'
import useMongocampDocument from '../composables/useMongocampDocument'
import { useMongocampQuery } from '../composables/useMongocampQuery'
import { useMongocampAggregation } from '../composables/useMongocampAggregation'
import { useMongocampPersistedState } from '../composables/useMongocampPersistedState'
import { useMongocampBulkByFilter } from '../composables/useMongocampBulkByFilter'
import { useMongocampFieldTypes } from '../composables/useMongocampFieldTypes'
import { wireValue } from '../utils/bsonTypes'
import type { BsonType } from '../utils/bsonTypes'
import MongocampDocumentView from './MongocampDocumentView.vue'
import MongocampQueryBar from './MongocampQueryBar.vue'
import MongocampExportAll from './MongocampExportAll.vue'
import MongocampCollectionCharts from './MongocampCollectionCharts.vue'
import { isFilterTooLong } from '../utils/requestLimits'

const props = withDefaults(defineProps<{
  collectionName: string
  // base path of the page rendering MongocampCollectionInfos (`<infoPath>/<name>`); the "index created" toast links there
  infoPath?: string
  // remember page size, sort and hidden columns per collection in localStorage
  persistState?: boolean
  // extra key part, for two tables over the same collection that should not share their state
  stateKey?: string
}>(), {
  infoPath: '/secured/admin/collections',
  persistState: true,
  stateKey: '',
})

const { t } = useI18n()
const { documentApi } = useMongocampClientApi()
const { pagination, total } = useMongocampCollection()
const { state: persisted } = useMongocampPersistedState(
  () => `collectionData:${props.collectionName}${props.stateKey ? `:${props.stateKey}` : ''}`,
  { pageSize: pagination.value.pageSize, sort: [] as SortEntry[], hidden: [] as string[] },
  { storage: props.persistState ? undefined : null },
)
const { isBucketCollection, fileIdForRow, downloadingFileIds, uploading, downloadFile, uploadFile } = useMongocampBucket()
const { ensureMetaData } = useMongocampDocument()
const { and, like, or } = useMongocampQuery()
const { schemaFromSamples } = useMongocampSchema()
const { listDistinct } = useMongocampAggregation()
const { createIndexForField } = useMongocampIndex()
const { isManager } = useMongocampRoles()
// Without a write grant the table is read-only: no insert, import, edit, delete or selection. UI-level only (the server
// refuses a write without a grant anyway); it shows everything when the grants are unknown (utils/grantMatching.ts).
const { canWrite, load: loadPermissions } = useMongocampPermissions()
watch(() => props.collectionName, name => loadPermissions(name), { immediate: true })
const writable = computed(() => canWrite(props.collectionName))
const toast = useToast()

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
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')

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

// One document read with its real types: `extendedJson=canonical` (server 1.8.1) writes every value as the extended-JSON
// wrapper of its type — `{ $oid }`, `{ $date }`, `{ $numberInt | $numberLong | $numberDouble | $numberDecimal }`, and
// `{ $string }` for text that looks like a date. (`relaxed` is lighter but writes int, long and double all as a bare number, so the types cannot be told apart.)
// The table's own page stays a plain read: every number as a wrapper would triple its size.
async function loadTypedRow(row: Row): Promise<Row | undefined> {
  const id = getDocId(row)
  if (!id) return undefined
  const res = await documentApi.getDocumentRaw({ collectionName: props.collectionName, documentId: id, extendedJson: 'canonical' })
  return await readJsonKeepingLongs<Row>(res)
}

// An edit always starts from the typed document: the save then writes every value back as the type it had (an int stays an
// int, text that looks like a date stays text — the server would turn it into a date), and a row loaded with a projection is
// complete (the full-replace fallback would otherwise write the partial row back as the whole document).
async function openEdit(row: Row) {
  const projected = activeProjection.value.length > 0
  let source: Row
  try {
    const typed = await loadTypedRow(row)
    if (!typed) throw new Error('no id')
    source = typed
  }
  catch {
    toast.add({ title: t('nuxtUiMongocamp.collectionData.editLoadFailed'), color: 'error' })
    return
  }
  editMode.value = 'update'
  editDocId.value = getDocId(source)
  editError.value = ''
  originalRow.value = source
  editSamples.value = projected
    ? [omitId(unwrapExtendedJson(source) as Record<string, unknown>)]
    : documents.value.map(r => omitId(unwrapExtendedJson(r) as Record<string, unknown>))
  if (editSamples.value.length > 0) {
    editFormData.value = omitId(unwrapExtendedJson(source) as Record<string, unknown>)
  }
  else {
    editJson.value = JSON.stringify(source, null, 2)
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
    // FormKit adds an internal `slots` entry to the form value; FUDataEdit strips it from what it emits, but we read
    // the v-model, so it is dropped here — otherwise every saved document would get a stray `slots: {}`. On an edit
    // the result starts as a clone of the row, so a real `slots` field of the document survives untouched.
    const { slots: _slots, ...formValues } = editFormData.value
    // the collection's field types type what has no typed original — an insert, or a field the edited document did not have
    payload = wrapExtendedJson(formValues, editMode.value === 'update' ? originalRow.value : undefined, fieldTypes.hints())
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
  // Edit: only what the user actually changed is sent (a partial update), so a concurrent change to another field
  // is not overwritten. Nothing changed ⇒ no request. A change a partial update cannot express falls back to the
  // full replace below.
  const original = editMode.value === 'update' ? originalRow.value : undefined
  if (original && editDocId.value) {
    const unchanged = diffDocument(original, payload)
    if (unchanged && !hasChanges(unchanged)) {
      isEditModalOpen.value = false
      return
    }
  }
  ensureMetaData(payload)
  try {
    if (editMode.value === 'insert') {
      await documentApi.insert({ collectionName: props.collectionName, requestBody: payload as { [key: string]: string } })
      // the new document may have fields the collection did not have
      void fieldTypes.load(true)
    }
    else {
      if (!editDocId.value) return
      const changes = original ? diffDocument(original, payload) : null
      if (changes && hasChanges(changes)) {
        const result = await documentApi.updateDocumentPartial({
          collectionName: props.collectionName,
          documentId: editDocId.value,
          requestBody: buildPartialBody(changes),
        })
        // the server answers 200 with matchedCount 0 for a document that is gone
        if (result.matchedCount === 0) throw new Error(t('nuxtUiMongocamp.collectionData.documentGone'))
        isEditModalOpen.value = false
        await fetchDocuments()
        return
      }
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
      buttons.push(withTooltip(t('nuxtUiMongocamp.collectionData.viewDocumentTooltip'), h(UButton, {
        'icon': 'i-lucide-eye',
        'color': 'neutral',
        'variant': 'ghost',
        'size': 'sm',
        'aria-label': t('nuxtUiMongocamp.collectionData.viewDocumentTooltip'),
        'onClick': () => openView(row.original),
      })))
      if (!writable.value) return h('div', { class: 'flex gap-1 justify-end' }, buttons)
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

// "Index this field": one plain single-field index from the column header. Managers only, never on GridFS
// buckets (their own indexes are the bucket's business), and not for `_id` (always indexed) or the
// `metaData` object.
const indexing = ref<Set<string>>(new Set())

function canIndexField(key: string): boolean {
  return isManager.value && !isBucketCollection(props.collectionName) && key !== '_id' && key !== 'metaData'
}

// The server's refusal (a duplicate or conflicting index) is the useful part; its text can carry the
// database host:port, which readServerError strips.
async function indexFailureMessage(error: unknown): Promise<string> {
  return (await describeServerError(error)).message
}

async function indexField(key: string, ascending: boolean) {
  if (indexing.value.has(key)) return
  indexing.value = new Set(indexing.value).add(key)
  try {
    const created = await createIndexForField(props.collectionName, key, ascending)
    toast.add({
      title: t('nuxtUiMongocamp.collectionData.indexCreatedTitle'),
      description: t('nuxtUiMongocamp.collectionData.indexCreatedDescription', { name: created.name, collection: props.collectionName }),
      color: 'success',
      actions: [{ label: t('nuxtUiMongocamp.collectionData.viewIndexes'), to: `${props.infoPath}/${props.collectionName}` }],
    })
  }
  catch (e: unknown) {
    toast.add({ title: t('nuxtUiMongocamp.collectionData.indexFailedTitle', { field: key }), description: await indexFailureMessage(e), color: 'error' })
  }
  finally {
    const next = new Set(indexing.value)
    next.delete(key)
    indexing.value = next
  }
}

function columnHeader(column: Column<Row>, key: string) {
  const sort = sortHeader(column, key)
  if (!canIndexField(key)) return sort
  const label = t('nuxtUiMongocamp.collectionData.indexFieldTooltip', { field: key })
  return h('div', { class: 'flex items-center gap-1' }, [
    sort,
    h(UDropdownMenu, {
      items: [[
        { label: t('nuxtUiMongocamp.collectionData.indexAscending'), icon: 'i-lucide-arrow-up-narrow-wide', onSelect: () => indexField(key, true) },
        { label: t('nuxtUiMongocamp.collectionData.indexDescending'), icon: 'i-lucide-arrow-down-wide-narrow', onSelect: () => indexField(key, false) },
      ]],
    }, {
      default: () => h(UButton, {
        'icon': 'i-lucide-list-tree',
        'color': 'neutral',
        'variant': 'ghost',
        'size': 'xs',
        'aria-label': label,
        'loading': indexing.value.has(key),
      }),
    }),
  ])
}

const columns = ref<TableColumn<Row>[]>([])
const documents = ref<Row[]>([])
const loading = ref(false)
const filterText = ref('')
const filterableColumns = ref<string[]>([])

// the applied query: what MongocampQueryBar edits (filter group + the Lucene string it builds, sort, fields to load)
const query = ref<QueryState>(emptyQueryState())
const queryBar = ref<InstanceType<typeof MongocampQueryBar> | null>(null)
// The filter builder's fields come from the server's field analysis for the whole collection (`fields/detail`, nested paths
// included: the server's Lucene takes `address.city`), not from the rows on screen — a field that the current page lacks is
// still offered. Until it has loaded, or when it failed, the fields of the loaded rows are used as before.
const fieldTypes = useMongocampFieldTypes(() => props.collectionName)
const pageFilterFields = ref<{ key: string, type: FilterFieldType }[]>([])
const filterFields = computed(() => {
  const fromServer = fieldTypes.filterFields().filter(f => operatorsFor(f.type).length > 0)
  return fromServer.length > 0 ? fromServer : pageFilterFields.value
})
const sorting = ref<SortEntry[]>([])
const columnVisibility = ref<Record<string, boolean>>({})
const PAGE_SIZES = [10, 20, 50, 100]
const isInitializing = ref(false)
const detailOpen = ref(false)
// exactly two ticked rows on screen can be compared side by side
const compareOpen = ref(false)
// Compare reads both documents with their real types (canonical), so `1` as an int and `1` as a long show up as a type
// change; if a read fails the table's rows are compared and the dialog says the types were not.
const compareState = ref<'loading' | 'typed' | 'untyped'>('loading')
const typedPair = ref<[Row, Row] | null>(null)
const compareRows = computed<Row[]>(() => {
  const ticked = documents.value.filter((row, index) => rowSelection.value[rowId(row, index)])
  return ticked.length === 2 && selectedDocIds.value.length === 2 ? ticked : []
})

const viewDoc = ref<Row | null>(null)
const viewOpen = ref(false)
const viewMode = ref<'table' | 'json'>('table')
const detailContent = ref('')
let filterTimer: ReturnType<typeof setTimeout> | undefined

// The row is shown at once; a moment later it is replaced by the typed read of the same document, so the viewer shows real
// types (an id, a date, int/long/double/decimal, text that merely looks like a date) instead of what plain JSON allows.
function openView(row: Row) {
  viewDoc.value = row
  viewOpen.value = true
  void showTyped(row)
}

async function showTyped(row: Row) {
  try {
    const typed = await loadTypedRow(row)
    if (typed && viewDoc.value === row) viewDoc.value = typed
  }
  catch {
    // the row from the table stays: untyped, but never wrong
  }
}

const pageJson = computed(() => valueToJson(documents.value, true))

function openDetail(value: unknown) {
  detailContent.value = JSON.stringify(value, null, 2)
  detailOpen.value = true
}

// the quick search box and the filter builder both narrow the result, so they combine with AND
function buildLuceneFilter(term: string): string | undefined {
  const trimmed = term.trim()
  const quick = trimmed && filterableColumns.value.length > 0
    ? or(...filterableColumns.value.map(col => like(col, trimmed)))
    : ''
  return and(quick, query.value.lucene) || undefined
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

watch(sorting, (sort) => {
  if (isInitializing.value) return
  query.value = { ...query.value, sort: sortingToMongoSort(sort) }
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
        // exact 64-bit integers and decimals arrive as wrappers (see utils/bigIntJson.ts)
        const numberKey = Object.keys(obj).find(k => k === '$numberLong' || k === '$numberDecimal' || k === '$numberInt' || k === '$numberDouble')
        if (numberKey && Object.keys(obj).length === 1) return h('span', { class: 'font-mono text-xs' }, String(obj[numberKey]))
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
// true when the server answered a filtered request with 400, i.e. it rejected the filter itself
const filterRejected = ref(false)

const { describeError, describeServerError } = useMongocampError()
const rowSelection = ref<Record<string, boolean>>({})
const selectedDocIds = computed(() => Object.keys(rowSelection.value).filter(id => rowSelection.value[id]))
const bulkDeleting = ref(false)
const bulkError = ref('')
const bulkEditing = ref(false)
const bulkEditError = ref('')
const bulkEditOpen = ref(false)

// ---- "select all matching": the selection is the Lucene filter of the list, not a list of ids. Delete and edit are one
// request each (server 1.7.0), so there is no cap and no id snapshot; the count is read once when the selection is made and
// compared with what the server reports afterwards.
const { countDocuments, deleteByFilter, updateByFilter } = useMongocampBulkByFilter()
const matching = ref<{ filter: string | undefined, count: number } | null>(null)
const counting = ref(false)
const bulkNote = ref('')
// what a bulk action works on: the ticked rows (never listed while "all matching" is on — the filter is the selection)
const bulkIds = computed(() => (matching.value ? [] : selectedDocIds.value))
const bulkCount = computed(() => matching.value?.count ?? bulkIds.value.length)
const selectablePageCount = computed(() => (writable.value && !isBucketCollection(props.collectionName) ? documents.value.length : 0))

function clearMatching() {
  matching.value = null
  bulkNote.value = ''
}

async function collectMatching() {
  clearMatching()
  const filter = buildLuceneFilter(filterText.value)
  counting.value = true
  try {
    const count = await countDocuments(props.collectionName, filter)
    matching.value = { filter, count }
    rowSelection.value = {}
    if (count !== total.value) bulkNote.value = t('nuxtUiMongocamp.bulk.matchingDrift', { counted: count, reported: total.value })
  }
  catch (e: unknown) {
    bulkNote.value = (await describeServerError(e)).message
  }
  finally {
    counting.value = false
  }
}

function clearBulkSelection() {
  rowSelection.value = {}
  clearMatching()
}

async function openCompare() {
  const [left, right] = compareRows.value
  if (!left || !right) return
  compareOpen.value = true
  compareState.value = 'loading'
  typedPair.value = null
  try {
    const [typedLeft, typedRight] = await Promise.all([loadTypedRow(left), loadTypedRow(right)])
    if (!typedLeft || !typedRight) throw new Error('no id')
    // closed meanwhile: this answer is stale
    if (!compareOpen.value) return
    typedPair.value = [typedLeft, typedRight]
    compareState.value = 'typed'
  }
  catch {
    compareState.value = 'untyped'
  }
}

function openBulkEdit() {
  bulkEditError.value = ''
  bulkEditOpen.value = true
}

function rowId(row: Row, index: number): string {
  return getDocId(row) ?? String(index)
}

async function handleBulkDelete() {
  bulkDeleting.value = true
  bulkError.value = ''
  try {
    if (matching.value) {
      const { filter, count } = matching.value
      const deleted = await deleteByFilter(props.collectionName, filter)
      clearMatching()
      await fetchDocuments()
      toast.add({ title: t('nuxtUiMongocamp.bulk.matchingDeleted', { deleted, total: count }), color: 'success' })
      return
    }
    const ids = [...bulkIds.value]
    const { failed } = await runBulkDelete(
      ids,
      documentId => documentApi._delete({ collectionName: props.collectionName, documentId }),
      undefined,
      {
        // one request per chunk for ids a filter can address; the rest (and any chunk that does not
        // come back fully deleted) go one by one. The generated type says string values only.
        canHandle: isObjectIdHex,
        run: async chunk => (await documentApi.deleteMany({
          collectionName: props.collectionName,
          requestBody: buildIdFilter(chunk) as unknown as { [key: string]: string },
        })).deletedCount,
      },
    )
    await fetchDocuments()
    if (failed.length > 0) {
      // keep only what is still there selected, and say why
      rowSelection.value = Object.fromEntries(failed.map(f => [f.item, true]))
      bulkError.value = t('nuxtUiMongocamp.bulk.partialFailure', { failed: failed.length, total: ids.length, reason: describeError(failed[0]!.error).message })
    }
  }
  catch (e: unknown) {
    bulkError.value = (await describeServerError(e)).message
  }
  finally {
    bulkDeleting.value = false
  }
}

// scalar fields of the loaded rows a bulk edit can write; `_id` and the metaData object are never offered
const editableFields = computed<{ key: string, type: ImportColumnType, bson?: BsonType, mixed?: boolean }[]>(() =>
  filterFields.value
    .filter(f => f.key !== 'metaData' && isEditableField(f.key))
    .flatMap((f) => {
      if (f.type === 'objectId') return []
      // the field's real BSON type, when the server's field analysis is there: an int stays an int
      const info = fieldTypes.typeOf(f.key)
      return [{ key: f.key, type: f.type === 'array' || f.type === 'object' ? 'json' as const : f.type, bson: info?.dominant, mixed: info?.mixed }]
    }),
)

function bulkEditFailureReason(error: unknown): string {
  if (error instanceof BulkMatchShortfall) return t('nuxtUiMongocamp.bulk.editShortfall', { matched: error.matched, expected: error.expected })
  if (error instanceof BulkUnaddressableId) return t('nuxtUiMongocamp.bulk.editUnaddressable')
  return describeError(error).message
}

async function handleBulkEdit(edit: { field: string, value: unknown, bson?: BsonType }) {
  bulkEditing.value = true
  bulkEditError.value = ''
  // the generated types say string values only; the server takes any JSON value
  // written as the chosen BSON type (an int as `{ $numberInt }`, text that looks like a date as `{ $string }`, …); no type chosen: plain
  const value = edit.bson ? wireValue(edit.bson, edit.value) : edit.value
  const document = { [edit.field]: value } as unknown as { [key: string]: string }
  try {
    if (matching.value) {
      const { filter, count } = matching.value
      const { modified } = await updateByFilter(props.collectionName, filter, document)
      clearMatching()
      await fetchDocuments()
      toast.add({ title: t('nuxtUiMongocamp.bulk.matchingUpdated', { updated: modified, total: count }), color: 'success' })
      return
    }
    const ids = [...bulkIds.value]
    const { failed } = await runBulkUpdate(
      ids,
      chunk => documentApi.updateMany({
        collectionName: props.collectionName,
        updateRequest: { filter: buildIdFilter(chunk) as unknown as { [key: string]: string }, document },
      }),
    )
    await fetchDocuments()
    if (failed.length > 0) {
      // keep selected only what is still on screen and was not updated, and say why
      const failedIds = failed.flatMap(f => f.ids)
      const onScreen = new Set(documents.value.map(row => getDocId(row)))
      rowSelection.value = Object.fromEntries(failedIds.filter(id => onScreen.has(id)).map(id => [id, true]))
      bulkEditError.value = t('nuxtUiMongocamp.bulk.editPartialFailure', { failed: failedIds.length, total: ids.length, reason: bulkEditFailureReason(failed[0]!.error) })
    }
  }
  catch (e: unknown) {
    bulkEditError.value = (await describeServerError(e)).message
  }
  finally {
    bulkEditing.value = false
  }
}

// a restored query may name fields this collection lacks; before the columns are known nothing is projected
const projectableKeys = computed(() => dataColumnKeys.value.filter(k => k !== '_id'))
const activeProjection = computed(() => (columns.value.length === 0 ? [] : usableProjection(query.value.projection, projectableKeys.value)))

async function fetchDocuments() {
  loading.value = true
  loadError.value = null
  // paging, filtering and sorting all fetch — a selection from rows no longer on screen must not survive
  rowSelection.value = {}
  clearMatching()
  filterRejected.value = false
  const filter = buildLuceneFilter(filterText.value)
  try {
    // POST, so a long filter is no URL: the GET list dies at 2048 characters without CORS headers (server 1.7.0 added this route)
    const res = await documentApi.searchDocumentsRaw({
      collectionName: props.collectionName,
      rowsPerPage: pagination.value.pageSize,
      page: pagination.value.pageIndex,
      searchRequest: {
        filter,
        sort: sorting.value.length ? sortingToMongoSort(sorting.value) : undefined,
        // only the fields asked for are loaded (the server always adds `_id`); never an empty list, which is a 500
        projection: activeProjection.value.length > 0 ? activeProjection.value : undefined,
      },
    })
    total.value = +(res.raw.headers.get('x-pagination-count-rows') ?? 0)
    // read from the response text: the generated client's JSON.parse would round integers beyond 2^53
    const rows = await readJsonKeepingLongs<Row[]>(res)
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
        header: ({ column }: { column: Column<Row> }) => columnHeader(column, key),
        cell: makeCell(key, 'string'),
        // keep the first column (usually _id) pinned so rows stay identifiable when the table scrolls sideways
        ...(index === 0 ? { meta: { class: { th: 'sticky left-0 z-10 bg-default', td: 'sticky left-0 z-10 bg-default' } } } : {}),
      }))
      filterableColumns.value = orderedKeys.filter(k => k !== '_id' && k !== 'metaData' && typeof firstRow[k] === 'string')
      // `_id` only gets the exact operators (the server matches `_id:"<oid>"`, but
      // wildcards on it match nothing). Arrays/objects have no operators at all.
      // `exactLongs: false`: a huge integer is still a number field for the filter, whatever its exact text
      pageFilterFields.value = schemaFromSamples(rows.map(row => unwrapExtendedJson(row, { exactLongs: false }) as Row))
        .map(c => ({ key: c.columnKey, type: c.columnKey === '_id' ? 'objectId' as const : toFilterFieldType(c.columnType) }))
        .filter(f => operatorsFor(f.type).length > 0)
      // GridFS files/chunks documents are managed through the bucket (deleting them one by one would
      // orphan the other half of a file), so bucket collections get no bulk selection
      if (!isBucketCollection(props.collectionName) && writable.value) {
        columns.value.unshift(createSelectColumn<Row>(UCheckbox, { selectAll: t('nuxtUiMongocamp.bulk.selectAll'), selectRow: t('nuxtUiMongocamp.bulk.selectRow') }))
      }
      columns.value.push(makeActionsColumn())
    }
  }
  catch (e: unknown) {
    loadError.value = e
    documents.value = []
    total.value = 0
    // The server answers a filter it cannot parse with a plain 400.
    filterRejected.value = Boolean(filter) && (e as { response?: { status?: number } } | null)?.response?.status === 400
  }
  finally {
    loading.value = false
  }
}

function clearAllFilters() {
  filterText.value = ''
  query.value = { ...query.value, filterGroup: emptyGroup(), lucene: '' }
  pagination.value.pageIndex = 1
  fetchDocuments()
}

// The bar applied a new query (filter, sort or fields). A changed sort goes through `sorting`, whose watcher fetches.
function onQueryApply(next: QueryState) {
  query.value = next
  const wanted = next.sort.map((entry) => {
    const { field, desc } = parseSortEntry(entry)
    return { id: field, desc }
  })
  const same = wanted.length === sorting.value.length && wanted.every((w, i) => w.id === sorting.value[i]!.id && w.desc === sorting.value[i]!.desc)
  if (same) {
    pagination.value.pageIndex = 1
    fetchDocuments()
  }
  else {
    sorting.value = wanted
  }
}

function onPageSizeChange() {
  pagination.value.pageIndex = 1
  fetchDocuments()
}

const dataColumnKeys = computed(() =>
  columns.value.flatMap(column => ('accessorKey' in column && typeof column.accessorKey === 'string' ? [column.accessorKey] : [])),
)

// columns the projection does not load are hidden whatever the visibility toggles say (and are not remembered as hidden)
const projectedOut = computed(() => new Set(activeProjection.value.length > 0 ? dataColumnKeys.value.filter(k => k !== '_id' && !activeProjection.value.includes(k)) : []))
const effectiveVisibility = computed(() => ({ ...columnVisibility.value, ...Object.fromEntries([...projectedOut.value].map(k => [k, false])) }))

const columnMenuItems = computed(() =>
  dataColumnKeys.value.map(key => ({
    label: key,
    type: 'checkbox' as const,
    disabled: projectedOut.value.has(key),
    checked: columnVisibility.value[key] !== false && !projectedOut.value.has(key),
    onUpdateChecked: (checked: boolean) => {
      columnVisibility.value = { ...columnVisibility.value, [key]: checked }
    },
    onSelect: (e: Event) => e.preventDefault(),
  })),
)

// Exports the rows on the current page (not the whole collection) so no extra requests are made;
// CSV honours the column-visibility toggles, JSON always carries the full documents.
function exportPage(format: 'json' | 'csv') {
  // an integer beyond 2^53 keeps every digit (a bare number in JSON), see utils/exportDocuments.ts
  const rows = documents.value.map(row => toExportRow(row) as Row)
  if (format === 'json') {
    downloadTextFile(`${props.collectionName}.json`, formatDocuments(rows, 'json', { pretty: true }), 'application/json')
    return
  }
  const keys = dataColumnKeys.value.filter(key => effectiveVisibility.value[key] !== false)
  downloadTextFile(`${props.collectionName}.csv`, rowsToCsv(rows, keys), 'text/csv')
}

// "Chart this filter": the distribution of one field over the documents the table currently shows (the server applies the Lucene
// filter as the first `$match`, see MongocampCollectionCharts). Only fields with something to count: text, numbers, dates, booleans.
const chartOpen = ref(false)
const chartField = ref('')
const chartFields = computed(() => filterFields.value.filter(f => f.type === 'string' || f.type === 'number' || f.type === 'date-time' || f.type === 'boolean').map(f => f.key))
const chartItems = computed(() => chartFields.value.map(key => ({ label: key, value: key })))
const chartFilter = computed(() => buildLuceneFilter(filterText.value))
const chartFilterTooLong = computed(() => isFilterTooLong(chartFilter.value))

function openChart() {
  if (!chartFields.value.includes(chartField.value)) chartField.value = chartFields.value[0] ?? ''
  chartOpen.value = true
}

const exportAllOpen = ref(false)
const exportMenuItems = computed(() => [
  { label: t('nuxtUiMongocamp.collectionData.exportJson'), icon: 'i-lucide-file-json', onSelect: () => exportPage('json') },
  { label: t('nuxtUiMongocamp.collectionData.exportCsv'), icon: 'i-lucide-file-spreadsheet', onSelect: () => exportPage('csv') },
  { label: t('nuxtUiMongocamp.exportAll.menuItem'), icon: 'i-lucide-download-cloud', onSelect: () => (exportAllOpen.value = true) },
])

// Values a text field really has, for the filter builder's suggestions. Only offered when the whole
// value set fits in one page of results: for a field with more distinct values (names, ids) an
// arbitrary hundred of them would only mislead. Cached per field until the collection changes or the
// table is reloaded; a failed lookup is cached as "no suggestions" so a dead server is not asked on every focus.
const DISTINCT_SUGGESTION_LIMIT = 100
let distinctCache = new Map<string, string[]>()

async function loadDistinctSuggestions(field: string): Promise<string[]> {
  const cached = distinctCache.get(field)
  if (cached) return cached
  const cache = distinctCache
  const collection = props.collectionName
  let suggestions: string[] = []
  try {
    const { values, truncated } = await listDistinct(collection, field, DISTINCT_SUGGESTION_LIMIT)
    if (!truncated) suggestions = [...new Set(values.map(String))].sort((a, b) => a.localeCompare(b))
  }
  catch {
    // no suggestions
  }
  // a reload or a collection change while the request ran must not be overwritten with stale values
  if (cache === distinctCache && collection === props.collectionName) cache.set(field, suggestions)
  return suggestions
}

async function init() {
  distinctCache = new Map()
  isInitializing.value = true
  // a remembered state is only trusted in its own shape: a hand-edited or stale entry must not break the table
  const rememberedSize = PAGE_SIZES.includes(persisted.value.pageSize) ? persisted.value.pageSize : PAGE_SIZES[1]!
  pagination.value.pageSize = rememberedSize
  sorting.value = (Array.isArray(persisted.value.sort) ? persisted.value.sort : [])
    .filter(e => typeof e?.id === 'string' && e.id !== '' && typeof e.desc === 'boolean')
  pagination.value.pageIndex = 1
  filterText.value = ''
  filterableColumns.value = []
  pageFilterFields.value = []
  void fieldTypes.load(true)
  query.value = { ...emptyQueryState(), sort: sorting.value.map(e => (e.desc ? `-${e.id}` : e.id)) }
  queryBar.value?.closePanel()
  columnVisibility.value = Object.fromEntries(
    (Array.isArray(persisted.value.hidden) ? persisted.value.hidden : []).filter(k => typeof k === 'string').map(k => [k, false]),
  )
  columns.value = []
  documents.value = []
  await fetchDocuments()
  isInitializing.value = false
}

// remembered as they change (not while a collection is being set up, which would overwrite the new collection's entry)
watch(() => pagination.value.pageSize, (size) => {
  if (!isInitializing.value) persisted.value = { ...persisted.value, pageSize: size }
})
watch(sorting, (sort) => {
  if (!isInitializing.value) persisted.value = { ...persisted.value, sort: sort.map(e => ({ id: e.id, desc: e.desc })) }
}, { deep: true })
watch(columnVisibility, (visibility) => {
  if (!isInitializing.value) persisted.value = { ...persisted.value, hidden: Object.keys(visibility).filter(k => visibility[k] === false) }
}, { deep: true })

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
          v-if="writable && isBucketCollection(collectionName)"
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
          v-else-if="writable"
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
        <MongocampImport
          v-if="writable && !isBucketCollection(collectionName)"
          :collection-name="collectionName"
          @imported="init"
        />
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
        <div
          class="inline-flex rounded-md border border-default p-0.5"
          role="group"
          :aria-label="t('nuxtUiMongocamp.collectionData.viewModeLabel')"
        >
          <UButton
            v-for="m in (['table', 'json'] as const)"
            :key="m"
            :label="m === 'table' ? t('nuxtUiMongocamp.collectionData.viewTable') : t('nuxtUiMongocamp.collectionData.viewJson')"
            :icon="m === 'table' ? 'i-lucide-table' : 'i-lucide-braces'"
            size="xs"
            color="neutral"
            :variant="viewMode === m ? 'subtle' : 'ghost'"
            :aria-pressed="viewMode === m"
            @click="viewMode = m"
          />
        </div>
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
        <UButton
          v-if="!isBucketCollection(collectionName)"
          icon="i-lucide-chart-column"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="chartFields.length === 0 || documents.length === 0"
          :aria-label="t('nuxtUiMongocamp.collectionData.chartTooltip')"
          @click="openChart"
        />
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
    <MongocampQueryBar
      ref="queryBar"
      v-model="query"
      :fields="filterFields"
      :columns="dataColumnKeys"
      :collection="collectionName"
      :load-distinct="loadDistinctSuggestions"
      @apply="onQueryApply"
    />

    <MongocampErrorAlert
      :error="loadError"
      :filter-rejected="filterRejected"
      @retry="fetchDocuments"
      @clear-filters="clearAllFilters"
    />

    <MongocampBulkDelete
      :selected="bulkIds"
      :selected-count="bulkCount"
      :page-count="selectablePageCount"
      :total="total"
      :all-matching="matching !== null"
      :counting="counting"
      :note="bulkNote"
      :confirm-name="matching ? collectionName : undefined"
      :deleting="bulkDeleting"
      :error="bulkError"
      @open="bulkError = ''"
      @clear="clearBulkSelection"
      @select-all="collectMatching"
      @confirm="handleBulkDelete"
    >
      <template #actions>
        <UButton
          v-if="compareRows.length === 2"
          icon="i-lucide-git-compare"
          color="neutral"
          variant="subtle"
          size="sm"
          :label="t('nuxtUiMongocamp.bulk.compareSelected')"
          data-testid="compare-selected"
          @click="openCompare"
        />
        <UButton
          v-if="editableFields.length > 0"
          icon="i-lucide-pencil"
          color="neutral"
          variant="subtle"
          size="sm"
          :label="t('nuxtUiMongocamp.bulk.editSelected')"
          @click="openBulkEdit"
        />
      </template>
    </MongocampBulkDelete>
    <MongocampBulkEdit
      v-model:open="bulkEditOpen"
      :selected="bulkCount"
      :fields="editableFields"
      :saving="bulkEditing"
      :error="bulkEditError"
      @apply="handleBulkEdit"
    />

    <pre
      v-if="viewMode === 'json'"
      class="max-h-[70vh] overflow-auto rounded-md bg-elevated p-3 text-xs whitespace-pre-wrap break-all"
      data-test="page-json"
    >{{ pageJson }}</pre>

    <UTable
      v-else
      v-model:sorting="sorting"
      v-model:row-selection="rowSelection"
      :column-visibility="effectiveVisibility"
      :get-row-id="rowId"
      :sorting-options="{ manualSorting: true }"
      :data="documents"
      :columns="columns"
      :loading="loading"
    >
      <template #empty>
        <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.documents')" />
      </template>
    </UTable>

    <MongocampExportAll
      v-model:open="exportAllOpen"
      :collection="collectionName"
      :filter="buildLuceneFilter(filterText)"
      :sort="sortingToMongoSort(sorting)"
      :projection="activeProjection"
      :total="total"
    />

    <UModal
      v-model:open="chartOpen"
      :title="t('nuxtUiMongocamp.collectionData.chartTitle')"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <div
          class="flex flex-col gap-3"
          data-test="chart-dialog"
        >
          <p class="text-sm text-dimmed">
            {{ chartFilter ? t('nuxtUiMongocamp.collectionData.chartScopeFiltered', { count: total }, total) : t('nuxtUiMongocamp.collectionData.chartScopeAll', { count: total }, total) }}
          </p>
          <UFormField :label="t('nuxtUiMongocamp.collectionData.chartField')">
            <USelect
              v-model="chartField"
              :items="chartItems"
              class="w-full"
              :aria-label="t('nuxtUiMongocamp.collectionData.chartField')"
            />
          </UFormField>
          <UAlert
            v-if="chartFilterTooLong"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :description="t('nuxtUiMongocamp.collectionData.chartTooLong')"
            data-test="chart-too-long"
          />
          <MongocampCollectionCharts
            v-else-if="chartOpen && chartField"
            :collection-name="collectionName"
            :field="chartField"
            :filter="chartFilter"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="compareOpen"
      :title="t('nuxtUiMongocamp.documentCompare.title')"
      :ui="{ content: 'sm:max-w-5xl' }"
    >
      <template #body>
        <p
          v-if="compareState === 'loading'"
          class="text-sm text-dimmed"
          role="status"
          data-test="compare-loading"
        >
          {{ t('nuxtUiMongocamp.collectionData.compareLoading') }}
        </p>
        <template v-else-if="compareRows.length === 2">
          <p
            v-if="compareState === 'untyped'"
            class="mb-2 text-sm text-warning"
            data-test="compare-untyped"
          >
            {{ t('nuxtUiMongocamp.collectionData.compareUntyped') }}
          </p>
          <MongocampDocumentCompare
            :left="typedPair?.[0] ?? compareRows[0]"
            :right="typedPair?.[1] ?? compareRows[1]"
            :left-label="String(compareRows[0]!._id ?? '')"
            :right-label="String(compareRows[1]!._id ?? '')"
          />
        </template>
      </template>
    </UModal>

    <USlideover
      v-model:open="viewOpen"
      :title="t('nuxtUiMongocamp.collectionData.viewDocumentTitle')"
      :ui="{ content: 'sm:max-w-xl' }"
    >
      <template #body>
        <MongocampDocumentView :document="viewDoc" />
      </template>
    </USlideover>

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
