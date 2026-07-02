<script setup lang='ts'>
import { h, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useMongocampSystem } from '#imports'

interface DatabaseRow {
  name: string
  sizeKb: number
  empty: boolean
  collectionCount: number
}

const { getDatabaseInfos, listCollectionsByDatabase } = useMongocampSystem()

const databases = ref<DatabaseRow[]>([])
const loading = ref(false)
const sorting = ref<{ id: string, desc: boolean }[]>([])
const errorMessage = ref('')

async function fetchDatabases() {
  loading.value = true
  errorMessage.value = ''
  try {
    const infos = await getDatabaseInfos()
    const rows = await Promise.all(
      infos.map(async (info) => {
        const collections = await listCollectionsByDatabase(info.name)
        return {
          name: info.name,
          sizeKb: Math.round(info.sizeOnDisk / 1024),
          empty: info.empty,
          collectionCount: collections.length,
        }
      }),
    )
    databases.value = rows
  }
  catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load databases'
  }
  finally {
    loading.value = false
  }
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

function sortHeader(column: Column<DatabaseRow>, label: string) {
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

const columns: TableColumn<DatabaseRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => sortHeader(column, 'Database'),
  },
  {
    accessorKey: 'sizeKb',
    header: ({ column }) => sortHeader(column, 'Size (KB)'),
  },
  {
    accessorKey: 'collectionCount',
    header: 'Collections',
    cell: ({ row }) => h(UBadge, { label: String(row.original.collectionCount), color: 'primary', variant: 'subtle' }),
  },
  {
    accessorKey: 'empty',
    header: 'Empty',
    cell: ({ row }) =>
      row.original.empty
        ? h(UBadge, { label: 'Empty', color: 'neutral', variant: 'subtle' })
        : h('span', { class: 'text-dimmed' }, '—'),
  },
]

fetchDatabases()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        Databases
      </h2>
      <UTooltip text="Refresh">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          aria-label="Refresh"
          @click="fetchDatabases"
        />
      </UTooltip>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Failed to load databases"
      :description="errorMessage"
    >
      <template #actions>
        <UButton
          label="Retry"
          color="error"
          variant="subtle"
          icon="i-lucide-refresh-cw"
          @click="fetchDatabases"
        />
      </template>
    </UAlert>

    <UTable
      v-model:sorting="sorting"
      :data="databases"
      :columns="columns"
      :loading="loading"
    />
  </div>
</template>
