<script setup lang="ts">
import { h, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useI18n, useMongocampClientApi, useMongocampBucket } from '#imports'

const props = defineProps<{
  infoPath?: string
  dataPath?: string
  bucketFilesPath?: string
}>()

interface CollectionRow {
  name: string
  count: number
  sizekb: number
  indexCount: number
}

const { t } = useI18n()
const { collectionApi } = useMongocampClientApi()
const { isBucketCollection, bucketNameFor, bucketActionInFlight, clearBucket, deleteBucket } = useMongocampBucket()

const collections = ref<CollectionRow[]>([])
const loading = ref(false)

async function fetchCollections() {
  loading.value = true
  try {
    const names = await collectionApi.listCollections()
    const rows = await Promise.all(
      names
        .filter(name => !name.startsWith('mc'))
        .map(async (name) => {
          const info = await collectionApi.getCollectionInformation({ collectionName: name })
          return {
            name,
            count: info.count,
            sizekb: Math.round(info.storageSize / 1024),
            indexCount: info.nindexes,
          }
        }),
    )
    collections.value = rows
  }
  finally {
    loading.value = false
  }
}

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UTooltip = resolveComponent('UTooltip')

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

const globalFilter = ref('')
const sorting = ref<{ id: string, desc: boolean }[]>([])

const isClearBucketModalOpen = ref(false)
const bucketToClear = ref<string | undefined>(undefined)

function confirmClearBucket(bucketName: string) {
  bucketToClear.value = bucketName
  isClearBucketModalOpen.value = true
}

async function handleClearBucket() {
  if (!bucketToClear.value) return
  const success = await clearBucket(bucketToClear.value)
  isClearBucketModalOpen.value = false
  if (success) await fetchCollections()
}

const isDeleteBucketModalOpen = ref(false)
const bucketToDelete = ref<string | undefined>(undefined)

function confirmDeleteBucket(bucketName: string) {
  bucketToDelete.value = bucketName
  isDeleteBucketModalOpen.value = true
}

async function handleDeleteBucket() {
  if (!bucketToDelete.value) return
  const success = await deleteBucket(bucketToDelete.value)
  isDeleteBucketModalOpen.value = false
  if (success) await fetchCollections()
}

function sortHeader<T>(column: Column<T>, label: string) {
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

const columns: TableColumn<CollectionRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.collections.columnCollection')),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', row.original.name),
        isBucketCollection(row.original.name)
          ? h(UBadge, { label: t('nuxtUiMongocamp.collections.bucketBadge'), color: 'neutral', variant: 'subtle', size: 'sm' })
          : null,
      ]),
  },
  {
    accessorKey: 'count',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.collections.columnDocuments')),
  },
  {
    accessorKey: 'sizekb',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.collections.columnSize')),
  },
  {
    accessorKey: 'indexCount',
    header: ({ column }) => sortHeader(column, t('nuxtUiMongocamp.collections.columnIndexes')),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const buttons = [
        withTooltip(t('nuxtUiMongocamp.collections.infoTooltip'), h(UButton, {
          'icon': 'i-lucide-info',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.collections.infoTooltip'),
          'to': `${props.infoPath ?? '/secured/admin/collections'}/${row.original.name}`,
        })),
        withTooltip(t('nuxtUiMongocamp.collections.dataTooltip'), h(UButton, {
          'icon': 'i-lucide-table',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': t('nuxtUiMongocamp.collections.dataTooltip'),
          'to': `${props.dataPath ?? '/secured/admin/collections'}/${row.original.name}/data`,
        })),
      ]
      if (isBucketCollection(row.original.name)) {
        const bucketName = bucketNameFor(row.original.name)
        buttons.push(
          withTooltip(t('nuxtUiMongocamp.collections.browseFilesTooltip'), h(UButton, {
            'icon': 'i-lucide-folder-open',
            'color': 'neutral',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.browseFilesTooltip'),
            'to': `${props.bucketFilesPath ?? '/secured/admin/buckets'}/${bucketName}`,
          })),
          withTooltip(t('nuxtUiMongocamp.collections.clearBucketTooltip'), h(UButton, {
            'icon': 'i-lucide-eraser',
            'color': 'warning',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.clearBucketTooltip'),
            'loading': bucketActionInFlight.value.has(bucketName),
            'onClick': () => confirmClearBucket(bucketName),
          })),
          withTooltip(t('nuxtUiMongocamp.collections.deleteBucketTooltip'), h(UButton, {
            'icon': 'i-lucide-trash-2',
            'color': 'error',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.deleteBucketTooltip'),
            'loading': bucketActionInFlight.value.has(bucketName),
            'onClick': () => confirmDeleteBucket(bucketName),
          })),
        )
      }
      return h('div', { class: 'flex gap-1 justify-end' }, buttons)
    },
  },
]

fetchCollections()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        {{ t('nuxtUiMongocamp.collections.heading') }}
      </h2>
      <div class="flex flex-1 items-center gap-2">
        <UInput
          v-model="globalFilter"
          icon="i-lucide-search"
          :placeholder="t('nuxtUiMongocamp.collections.filterPlaceholder')"
          size="sm"
          class="flex-1 max-w-xs"
        />
        <UTooltip :text="t('nuxtUiMongocamp.common.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('nuxtUiMongocamp.common.refresh')"
            @click="fetchCollections"
          />
        </UTooltip>
      </div>
    </div>

    <UTable
      v-model:global-filter="globalFilter"
      v-model:sorting="sorting"
      :data="collections"
      :columns="columns"
      :loading="loading"
    />

    <UModal
      v-model:open="isClearBucketModalOpen"
      :title="t('nuxtUiMongocamp.collections.clearBucketTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.collections.confirmClearBucket', { bucketName: bucketToClear }) }}</p>
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isClearBucketModalOpen = false"
        />
        <UButton
          :label="t('nuxtUiMongocamp.collections.clearBucketTitle')"
          color="warning"
          icon="i-lucide-eraser"
          @click="handleClearBucket"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteBucketModalOpen"
      :title="t('nuxtUiMongocamp.collections.deleteBucketTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.collections.confirmDeleteBucket', { bucketName: bucketToDelete }) }}</p>
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isDeleteBucketModalOpen = false"
        />
        <UButton
          :label="t('nuxtUiMongocamp.collections.deleteBucketTitle')"
          color="error"
          icon="i-lucide-trash-2"
          @click="handleDeleteBucket"
        />
      </template>
    </UModal>
  </div>
</template>
