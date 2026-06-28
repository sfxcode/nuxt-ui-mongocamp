<script setup lang="ts">
import { h, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
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

const columns: TableColumn<CollectionRow>[] = [
  {
    accessorKey: 'name',
    header: 'Collection',
  },
  {
    accessorKey: 'count',
    header: 'Documents',
  },
  {
    accessorKey: 'sizekb',
    header: 'Size (KB)',
  },
  {
    accessorKey: 'indexCount',
    header: 'Indexes',
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
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">
        Collections
      </h2>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="loading"
        aria-label="Refresh"
        @click="fetchCollections"
      />
    </div>

    <UTable
      :data="collections"
      :columns="columns"
      :loading="loading"
    />
  </div>
</template>
