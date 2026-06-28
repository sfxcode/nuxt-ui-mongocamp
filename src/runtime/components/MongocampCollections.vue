<script setup lang="ts">
import { h, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useMongocampApi } from '#imports'

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

const globalFilter = ref('')
const sorting = ref<{ id: string, desc: boolean }[]>([])

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
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 justify-end' }, [
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
      ]),
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
  </div>
</template>
