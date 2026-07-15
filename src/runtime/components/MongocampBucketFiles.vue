<script setup lang="ts">
import { h, reactive, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { FileInformation } from '@sfxcode/nuxt-mongocamp-server'
import useMongocampCollection from '../composables/useMongocampCollection'
import { useMongocampBucket } from '../composables/useMongocampBucket'
import { useMongocampQuery } from '../composables/useMongocampQuery'

const props = defineProps<{
  bucketName: string
}>()

const { pagination, total } = useMongocampCollection()
const {
  listFiles,
  deleteFile,
  updateFileInformation,
  downloadFile,
  downloadingFileIds,
  uploadFile,
  uploading,
  fileActionInFlight,
} = useMongocampBucket()
const { like } = useMongocampQuery()

const fileInputRef = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInputRef.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const success = await uploadFile(props.bucketName, file)
  if (success) await fetchFiles()
}

const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

type SortEntry = { id: string, desc: boolean }

function sortHeader(column: Column<FileInformation>, label: string) {
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

function sortingToMongoSort(s: SortEntry[]): string[] {
  return s.map(col => (col.desc ? `-${col.id}` : col.id))
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

function formatBytes(length: number): string {
  if (!length) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(length) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = length / 1024 ** exponent
  return `${exponent === 0 ? value : value.toFixed(1)} ${BYTE_UNITS[exponent]}`
}

function formatDate(value: Date | string): string {
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return String(value)
  }
}

const detailOpen = ref(false)
const detailContent = ref('')

function openMetadataDetail(metadata: Record<string, string>) {
  detailContent.value = JSON.stringify(metadata, null, 2)
  detailOpen.value = true
}

function makeMetadataCell() {
  return ({ row }: { row: { original: FileInformation } }) => {
    const metadata = row.original.metadata ?? {}
    const keys = Object.keys(metadata)
    if (keys.length === 0) return h('span', { class: 'text-dimmed' }, '—')
    return withTooltip('View metadata', h(UButton, {
      'icon': 'i-lucide-braces',
      'color': 'neutral',
      'variant': 'ghost',
      'size': 'xs',
      'label': `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`,
      'aria-label': 'View metadata',
      'onClick': () => openMetadataDetail(metadata),
    }))
  }
}

type MetadataEntry = { key: string, value: string }

const isRenameModalOpen = ref(false)
const fileToRename = ref<FileInformation | undefined>(undefined)
const renameData = ref<{ filename: string, metadata: MetadataEntry[] }>({ filename: '', metadata: [] })
const renameSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'filename',
    label: 'Filename',
    validation: 'required',
  },
  {
    $formkit: 'nuxtUIRepeater',
    name: 'metadata',
    label: 'Metadata',
    children: [
      { $formkit: 'nuxtUIInput', name: 'key', label: 'Key' },
      { $formkit: 'nuxtUIInput', name: 'value', label: 'Value' },
    ],
  },
])

function openRename(file: FileInformation) {
  fileToRename.value = file
  renameData.value = {
    filename: file.filename,
    metadata: Object.entries(file.metadata ?? {}).map(([key, value]) => ({ key, value })),
  }
  isRenameModalOpen.value = true
}

async function handleRenameSave() {
  if (!fileToRename.value) return
  const metadata: Record<string, string> = {}
  for (const entry of renameData.value.metadata) {
    if (entry.key) metadata[entry.key] = entry.value
  }
  const success = await updateFileInformation(props.bucketName, fileToRename.value.id, {
    filename: renameData.value.filename,
    metadata,
  })
  if (success) {
    isRenameModalOpen.value = false
    await fetchFiles()
  }
}

const isDeleteModalOpen = ref(false)
const fileToDelete = ref<FileInformation | undefined>(undefined)

function confirmDeleteFile(file: FileInformation) {
  fileToDelete.value = file
  isDeleteModalOpen.value = true
}

async function handleDeleteFile() {
  if (!fileToDelete.value) return
  const success = await deleteFile(props.bucketName, fileToDelete.value.id)
  if (success) {
    isDeleteModalOpen.value = false
    await fetchFiles()
  }
}

function makeActionsColumn(): TableColumn<FileInformation> {
  return {
    id: 'actions',
    header: '',
    cell: ({ row }: { row: { original: FileInformation } }) => {
      const file = row.original
      return h('div', { class: 'flex gap-1 justify-end' }, [
        withTooltip('Download file', h(UButton, {
          'icon': 'i-lucide-download',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Download file',
          'loading': downloadingFileIds.value.has(file.id),
          'onClick': () => downloadFile(props.bucketName, file.id),
        })),
        withTooltip('Rename / edit metadata', h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Rename / edit metadata',
          'loading': fileActionInFlight.value.has(file.id),
          'onClick': () => openRename(file),
        })),
        withTooltip('Delete file', h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Delete file',
          'loading': fileActionInFlight.value.has(file.id),
          'onClick': () => confirmDeleteFile(file),
        })),
      ])
    },
  }
}

const columns = ref<TableColumn<FileInformation>[]>([
  {
    accessorKey: 'filename',
    header: ({ column }) => sortHeader(column, 'Filename'),
    cell: ({ row }) => h('span', row.original.filename),
  },
  {
    accessorKey: 'length',
    header: ({ column }) => sortHeader(column, 'Size'),
    cell: ({ row }) => h('span', formatBytes(row.original.length)),
  },
  {
    accessorKey: 'uploadDate',
    header: ({ column }) => sortHeader(column, 'Uploaded'),
    cell: ({ row }) => h('span', formatDate(row.original.uploadDate)),
  },
  {
    id: 'metadata',
    header: 'Metadata',
    cell: makeMetadataCell(),
  },
  makeActionsColumn(),
])

const files = ref<FileInformation[]>([])
const loading = ref(false)
const filterText = ref('')
const sorting = ref<SortEntry[]>([])
const isInitializing = ref(false)
let filterTimer: ReturnType<typeof setTimeout> | undefined

function buildLuceneFilter(term: string): string | undefined {
  const t = term.trim()
  return t ? like('filename', t) : undefined
}

function onFilterInput() {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    pagination.value.pageIndex = 1
    fetchFiles()
  }, 300)
}

watch(sorting, () => {
  if (isInitializing.value) return
  pagination.value.pageIndex = 1
  fetchFiles()
})

async function fetchFiles() {
  loading.value = true
  try {
    const result = await listFiles(props.bucketName, {
      rowsPerPage: pagination.value.pageSize,
      page: pagination.value.pageIndex,
      sort: sorting.value.length ? sortingToMongoSort(sorting.value).join(',') : undefined,
      filter: buildLuceneFilter(filterText.value),
    })
    total.value = result.total
    files.value = result.files
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
  files.value = []
  await fetchFiles()
  isInitializing.value = false
}

watch(() => props.bucketName, init, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <UInput
        v-model="filterText"
        icon="i-lucide-search"
        placeholder="Filter by filename..."
        size="sm"
        class="flex-1 max-w-xs"
        @input="onFilterInput"
      />
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500 dark:text-gray-400 shrink-0">
          {{ total }} files
        </span>
        <UTooltip text="Upload file">
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
          @update:page="fetchFiles"
        />
      </div>
    </div>
    <UTable
      v-model:sorting="sorting"
      :sorting-options="{ manualSorting: true }"
      :data="files"
      :columns="columns"
      :loading="loading"
    />

    <UModal
      v-model:open="detailOpen"
      title="Metadata"
    >
      <template #body>
        <pre class="text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">{{ detailContent }}</pre>
      </template>
    </UModal>

    <UModal
      v-model:open="isRenameModalOpen"
      title="Rename / edit metadata"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <FUDataEdit
          :data="renameData"
          :schema="renameSchema"
          submit-label="Save"
          submit-icon="i-lucide-save"
          @data-saved="handleRenameSave"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteModalOpen"
      title="Delete File"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>Are you sure you want to delete this file? This action cannot be undone.</p>
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
          @click="handleDeleteFile"
        />
      </template>
    </UModal>
  </div>
</template>
