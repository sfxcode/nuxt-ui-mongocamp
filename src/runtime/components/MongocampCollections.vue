<script setup lang="ts">
import { h, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useMongocampApi, useMongocampBucket } from '#imports'

const props = defineProps<{
  infoPath?: string
  dataPath?: string
}>()

interface CollectionRow {
  name: string
  count: number
  sizekb: number
  indexCount: number
}

const { collectionApi } = useMongocampApi()
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
    header: ({ column }) => sortHeader(column, 'Collection'),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', row.original.name),
        isBucketCollection(row.original.name)
          ? h(UBadge, { label: 'bucket', color: 'neutral', variant: 'subtle', size: 'sm' })
          : null,
      ]),
  },
  {
    accessorKey: 'count',
    header: ({ column }) => sortHeader(column, 'Documents'),
  },
  {
    accessorKey: 'sizekb',
    header: ({ column }) => sortHeader(column, 'Size (KB)'),
  },
  {
    accessorKey: 'indexCount',
    header: ({ column }) => sortHeader(column, 'Indexes'),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const buttons = [
        h(UButton, {
          'icon': 'i-lucide-info',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Collection info',
          'to': `${props.infoPath ?? '/secured/admin/collections'}/${row.original.name}`,
        }),
        h(UButton, {
          'icon': 'i-lucide-table',
          'color': 'neutral',
          'variant': 'ghost',
          'size': 'sm',
          'aria-label': 'Collection data',
          'to': `${props.dataPath ?? '/secured/admin/collections'}/${row.original.name}/data`,
        }),
      ]
      if (isBucketCollection(row.original.name)) {
        const bucketName = bucketNameFor(row.original.name)
        buttons.push(
          h(UButton, {
            'icon': 'i-lucide-eraser',
            'color': 'warning',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': 'Clear bucket',
            'loading': bucketActionInFlight.value.has(bucketName),
            'onClick': () => confirmClearBucket(bucketName),
          }),
          h(UButton, {
            'icon': 'i-lucide-trash-2',
            'color': 'error',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': 'Delete bucket',
            'loading': bucketActionInFlight.value.has(bucketName),
            'onClick': () => confirmDeleteBucket(bucketName),
          }),
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
        Collections
      </h2>
      <div class="flex flex-1 items-center gap-2">
        <UInput
          v-model="globalFilter"
          icon="i-lucide-search"
          placeholder="Filter collections..."
          size="sm"
          class="flex-1 max-w-xs"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          aria-label="Refresh"
          @click="fetchCollections"
        />
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
      title="Clear Bucket"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>Are you sure you want to delete every file in the "{{ bucketToClear }}" bucket? The bucket itself is kept, but all files in it are permanently removed. This action cannot be undone.</p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="isClearBucketModalOpen = false"
        />
        <UButton
          label="Clear Bucket"
          color="warning"
          icon="i-lucide-eraser"
          @click="handleClearBucket"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="isDeleteBucketModalOpen"
      title="Delete Bucket"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>Are you sure you want to delete the "{{ bucketToDelete }}" bucket? This permanently removes both the "{{ bucketToDelete }}.files" and "{{ bucketToDelete }}.chunks" collections. This action cannot be undone.</p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="isDeleteBucketModalOpen = false"
        />
        <UButton
          label="Delete Bucket"
          color="error"
          icon="i-lucide-trash-2"
          @click="handleDeleteBucket"
        />
      </template>
    </UModal>
  </div>
</template>
