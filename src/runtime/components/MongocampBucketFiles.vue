<script setup lang="ts">
import { computed, h, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import type { FileInformation } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n } from '#imports'
import useMongocampCollection from '../composables/useMongocampCollection'
import { useMongocampBucket } from '../composables/useMongocampBucket'
import { useMongocampFieldTypes } from '../composables/useMongocampFieldTypes'
import { useMongocampPermissions } from '../composables/useMongocampPermissions'
import MongocampCollectionCharts from './MongocampCollectionCharts.vue'
import { useMongocampQuery } from '../composables/useMongocampQuery'
import { parseMetadataJson } from '../utils/filePreview'

const props = defineProps<{
  bucketName: string
}>()

const { t } = useI18n()
const { pagination, total } = useMongocampCollection()
const {
  listFiles,
  deleteFile,
  updateFileInformation,
  downloadFile,
  downloadingFileIds,
  uploadFiles,
  uploading,
  fileActionInFlight,
} = useMongocampBucket()
const { like } = useMongocampQuery()

const fileInputRef = ref<HTMLInputElement | null>(null)

// ---- distribution of the stored files: a collapsed chart over the bucket's `<name>.files` collection --------------------
// Nothing is requested until the section is opened. Hidden when the user may not read that collection (the server's answer
// from `GET /auth/permissions`, the profile's grants until it arrives).
const filesCollection = computed(() => `${props.bucketName}.files`)
const fieldTypes = useMongocampFieldTypes(() => filesCollection.value)
const { canRead, load: loadPermissions } = useMongocampPermissions()
const showDistribution = computed(() => canRead(filesCollection.value))
const distributionOpen = ref(false)
const distributionField = ref('')
const distributionFields = computed(() => fieldTypes.filterFields()
  .filter(f => f.type === 'string' || f.type === 'number' || f.type === 'date-time' || f.type === 'boolean')
  .map(f => f.key))
const distributionItems = computed(() => distributionFields.value.map(key => ({ label: key, value: key })))

// the type of file is the useful first look; the upload date when files carry no content type
function defaultDistributionField(fields: string[]): string {
  return ['contentType', 'metadata.contentType', 'uploadDate'].find(key => fields.includes(key)) ?? fields[0] ?? ''
}

async function onDistributionToggle(event: Event) {
  distributionOpen.value = (event.target as HTMLDetailsElement).open
  if (!distributionOpen.value) return
  await fieldTypes.load()
  if (!distributionFields.value.includes(distributionField.value)) distributionField.value = defaultDistributionField(distributionFields.value)
}

void loadPermissions(filesCollection.value)
watch(filesCollection, (name) => {
  distributionField.value = ''
  void loadPermissions(name)
})

function openFilePicker() {
  fileInputRef.value?.click()
}

const uploadProgress = ref<{ done: number, total: number, current?: string } | null>(null)
const uploadResult = ref<{ uploaded: number, failed: { name: string, message: string }[] } | null>(null)
const dragging = ref(false)
let dragDepth = 0

async function handleFiles(list: File[]) {
  if (!list.length || uploading.value) return
  uploadResult.value = null
  uploadProgress.value = { done: 0, total: list.length }
  try {
    const result = await uploadFiles(props.bucketName, list, {
      onProgress: (done, total, current) => {
        uploadProgress.value = { done, total, current }
      },
    })
    uploadResult.value = { uploaded: result.uploaded.length, failed: result.failed }
    if (result.uploaded.length) await fetchFiles()
  }
  finally {
    uploadProgress.value = null
  }
}

function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const list = Array.from(input.files ?? [])
  input.value = ''
  return handleFiles(list)
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent) {
  if (!hasFiles(event)) return
  dragDepth++
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}

function onDrop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false
  return handleFiles(Array.from(event.dataTransfer?.files ?? []))
}

const previewOpen = ref(false)
const fileToPreview = ref<FileInformation | undefined>(undefined)

function openPreview(file: FileInformation) {
  fileToPreview.value = file
  previewOpen.value = true
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
    return withTooltip(t('nuxtUiMongocamp.bucketFiles.viewMetadataTooltip'), h(UButton, {
      'icon': 'i-lucide-braces',
      'color': 'neutral',
      'variant': 'ghost',
      'size': 'xs',
      'label': keys.length === 1 ? t('nuxtUiMongocamp.bucketFiles.keyCount') : t('nuxtUiMongocamp.bucketFiles.keysCount', { count: keys.length }),
      'aria-label': t('nuxtUiMongocamp.bucketFiles.viewMetadataTooltip'),
      'onClick': () => openMetadataDetail(metadata),
    }))
  }
}

const isRenameModalOpen = ref(false)
const fileToRename = ref<FileInformation | undefined>(undefined)
const renameFilename = ref('')
const renameMetadata = ref('')
const renameSaving = ref(false)

const metadataParse = computed(() => parseMetadataJson(renameMetadata.value))
const metadataError = computed(() => {
  const parsed = metadataParse.value
  if (parsed.ok) return ''
  return parsed.reason === 'invalid-json'
    ? t('nuxtUiMongocamp.bucketFiles.metadataInvalidJson')
    : t('nuxtUiMongocamp.bucketFiles.metadataNotObject')
})
const canSaveRename = computed(() => !!renameFilename.value.trim() && metadataParse.value.ok)

function openRename(file: FileInformation) {
  fileToRename.value = file
  renameFilename.value = file.filename
  renameMetadata.value = Object.keys(file.metadata ?? {}).length ? JSON.stringify(file.metadata, null, 2) : ''
  isRenameModalOpen.value = true
}

async function handleRenameSave() {
  const parsed = metadataParse.value
  if (!fileToRename.value || !parsed.ok || !renameFilename.value.trim()) return
  renameSaving.value = true
  try {
    const success = await updateFileInformation(props.bucketName, fileToRename.value.id, {
      filename: renameFilename.value.trim(),
      metadata: parsed.value,
    })
    if (success) {
      isRenameModalOpen.value = false
      await fetchFiles()
    }
  }
  finally {
    renameSaving.value = false
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
        withTooltip(t('nuxtUiMongocamp.bucketFiles.previewTooltip'), h(UButton, {
          'icon': 'i-lucide-eye',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.bucketFiles.previewTooltip'),
          'onClick': () => openPreview(file),
        })),
        withTooltip(t('nuxtUiMongocamp.bucketFiles.downloadFileTooltip'), h(UButton, {
          'icon': 'i-lucide-download',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.bucketFiles.downloadFileTooltip'),
          'loading': downloadingFileIds.value.has(file.id),
          'onClick': () => downloadFile(props.bucketName, file.id),
        })),
        withTooltip(t('nuxtUiMongocamp.bucketFiles.renameTooltip'), h(UButton, {
          'icon': 'i-lucide-pencil',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.bucketFiles.renameTooltip'),
          'loading': fileActionInFlight.value.has(file.id),
          'onClick': () => openRename(file),
        })),
        withTooltip(t('nuxtUiMongocamp.bucketFiles.deleteFileTooltip'), h(UButton, {
          'icon': 'i-lucide-trash-2',
          'color': 'error',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.bucketFiles.deleteFileTooltip'),
          'loading': fileActionInFlight.value.has(file.id),
          'onClick': () => confirmDeleteFile(file),
        })),
      ])
    },
  }
}

const columns = computed<TableColumn<FileInformation>[]>(() => [
  {
    accessorKey: 'filename',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.bucketFiles.columnFilename')),
    cell: ({ row }) => h('span', row.original.filename),
  },
  {
    accessorKey: 'length',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.bucketFiles.columnSize')),
    cell: ({ row }) => h('span', formatBytes(row.original.length)),
  },
  {
    accessorKey: 'uploadDate',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.bucketFiles.columnUploaded')),
    cell: ({ row }) => h('span', formatDate(row.original.uploadDate)),
  },
  {
    id: 'metadata',
    header: t('nuxtUiMongocamp.bucketFiles.columnMetadata'),
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
  const trimmed = term.trim()
  return trimmed ? like('filename', trimmed) : undefined
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

const loadError = ref<unknown>(null)

async function fetchFiles() {
  loading.value = true
  loadError.value = null
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
  catch (e: unknown) {
    loadError.value = e
    files.value = []
    total.value = 0
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
  <div
    class="relative flex flex-col gap-4"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      v-if="dragging"
      class="absolute inset-0 z-10 flex items-center justify-center rounded border-2 border-dashed border-primary bg-default/80 text-sm font-medium pointer-events-none"
      data-testid="drop-overlay"
    >
      {{ t('nuxtUiMongocamp.bucketFiles.dropHere') }}
    </div>
    <div class="flex items-center justify-between gap-4">
      <UInput
        v-model="filterText"
        icon="i-lucide-search"
        :placeholder="t('nuxtUiMongocamp.bucketFiles.filterPlaceholder')"
        size="sm"
        class="flex-1 max-w-xs"
        @input="onFilterInput"
      />
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-500 dark:text-gray-400 shrink-0">
          {{ t('nuxtUiMongocamp.bucketFiles.filesCount', { count: total }) }}
        </span>
        <UTooltip :text="t('nuxtUiMongocamp.bucketFiles.uploadFileTooltip')">
          <UButton
            icon="i-lucide-upload"
            color="primary"
            variant="ghost"
            size="sm"
            :loading="uploading"
            :aria-label="t('nuxtUiMongocamp.bucketFiles.uploadFileTooltip')"
            @click="openFilePicker"
          />
        </UTooltip>
        <input
          ref="fileInputRef"
          type="file"
          multiple
          class="hidden"
          @change="handleFileSelected"
        >
        <UTooltip :text="t('nuxtUiMongocamp.bucketFiles.reloadTooltip')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('nuxtUiMongocamp.bucketFiles.reloadTooltip')"
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
    <UAlert
      v-if="uploadProgress"
      color="neutral"
      variant="subtle"
      icon="i-lucide-upload"
      :title="t('nuxtUiMongocamp.bucketFiles.uploadProgress', { done: uploadProgress.done, total: uploadProgress.total })"
      :description="uploadProgress.current"
    />
    <UAlert
      v-else-if="uploadResult"
      :color="uploadResult.failed.length ? 'warning' : 'success'"
      variant="subtle"
      :icon="uploadResult.failed.length ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
      :title="t('nuxtUiMongocamp.bucketFiles.uploadSummary', { uploaded: uploadResult.uploaded, failed: uploadResult.failed.length })"
      close
      @update:open="uploadResult = null"
    >
      <template
        v-if="uploadResult.failed.length"
        #description
      >
        <ul class="list-disc pl-4 text-xs">
          <li
            v-for="item in uploadResult.failed"
            :key="item.name"
          >
            {{ item.name }}: {{ item.message }}
          </li>
        </ul>
      </template>
    </UAlert>
    <MongocampErrorAlert
      :error="loadError"
      @retry="fetchFiles"
    />

    <UTable
      v-model:sorting="sorting"
      :sorting-options="{ manualSorting: true }"
      :data="files"
      :columns="columns"
      :loading="loading"
    >
      <template #empty>
        <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.files')" />
      </template>
    </UTable>

    <UModal
      v-model:open="detailOpen"
      :title="t('nuxtUiMongocamp.bucketFiles.metadataTitle')"
    >
      <template #body>
        <pre class="text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">{{ detailContent }}</pre>
      </template>
    </UModal>

    <UModal
      v-model:open="isRenameModalOpen"
      :title="t('nuxtUiMongocamp.bucketFiles.renameTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('nuxtUiMongocamp.bucketFiles.filename')">
            <UInput
              v-model="renameFilename"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('nuxtUiMongocamp.bucketFiles.columnMetadata')"
            :help="t('nuxtUiMongocamp.bucketFiles.metadataHelp')"
            :error="metadataError || undefined"
          >
            <UTextarea
              v-model="renameMetadata"
              :rows="8"
              class="w-full font-mono"
              data-testid="metadata-json"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isRenameModalOpen = false"
        />
        <UButton
          :label="t('nuxtUiMongocamp.common.save')"
          icon="i-lucide-save"
          :disabled="!canSaveRename"
          :loading="renameSaving"
          @click="handleRenameSave"
        />
      </template>
    </UModal>

    <details
      v-if="showDistribution"
      class="text-sm"
      data-test="bucket-distribution"
      @toggle="onDistributionToggle"
    >
      <summary class="cursor-pointer text-dimmed">
        {{ t('nuxtUiMongocamp.bucketFiles.distribution') }}
      </summary>
      <div class="mt-3 flex flex-col gap-3">
        <UFormField
          v-if="distributionItems.length > 0"
          :label="t('nuxtUiMongocamp.bucketFiles.distributionField')"
        >
          <USelect
            v-model="distributionField"
            :items="distributionItems"
            class="w-full sm:w-64"
            :aria-label="t('nuxtUiMongocamp.bucketFiles.distributionField')"
          />
        </UFormField>
        <p
          v-else-if="fieldTypes.status() === 'ready' || fieldTypes.status() === 'failed'"
          class="text-dimmed"
          data-test="distribution-empty"
        >
          {{ t('nuxtUiMongocamp.bucketFiles.distributionNone') }}
        </p>
        <MongocampCollectionCharts
          v-if="distributionOpen && distributionField"
          :collection-name="filesCollection"
          :field="distributionField"
        />
      </div>
    </details>

    <MongocampFilePreview
      v-model:open="previewOpen"
      :bucket-name="bucketName"
      :file="fileToPreview"
    />

    <UModal
      v-model:open="isDeleteModalOpen"
      :title="t('nuxtUiMongocamp.bucketFiles.deleteFileTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.bucketFiles.confirmDeleteFile') }}</p>
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
          @click="handleDeleteFile"
        />
      </template>
    </UModal>
  </div>
</template>
