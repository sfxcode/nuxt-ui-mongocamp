<script setup lang="ts">
import { computed, h, ref, resolveComponent, watch } from 'vue'
import { useMongocampApi, useMongocampSchema, useToast } from '#imports'
import type { TableColumn } from '@nuxt/ui'
import type { CollectionStatus } from '@sfxcode/nuxt-mongocamp-server'
import type { ColumnDefinition } from '../composables/useMongocampSchema'

const props = withDefaults(defineProps<{
  collectionName: string
  sampleSize?: number
}>(), {
  sampleSize: 500,
})

const { collectionApi, documentApi } = useMongocampApi()
const { schemaFromSamples, schemaToTsInterface } = useMongocampSchema()

const UBadge = resolveComponent('UBadge')
const UIcon = resolveComponent('UIcon')

const info = ref<CollectionStatus | null>(null)
const columnDefinitions = ref<ColumnDefinition[]>([])
const loading = ref(false)

async function fetchInfo() {
  if (!props.collectionName) return
  loading.value = true
  try {
    info.value = await collectionApi.getCollectionInformation({ collectionName: props.collectionName })
    const samples = await documentApi.listDocuments({
      collectionName: props.collectionName,
      rowsPerPage: props.sampleSize,
      page: 1,
    })
    columnDefinitions.value = schemaFromSamples(samples as Array<Record<string, unknown>>)
  }
  finally {
    loading.value = false
  }
}

watch(() => [props.collectionName, props.sampleSize], fetchInfo, { immediate: true })

const TYPE_COLORS: Record<string, string> = {
  'string': 'neutral',
  'number': 'warning',
  'integer': 'warning',
  'date-time': 'info',
  'boolean': 'success',
  'object': 'secondary',
  'array': 'primary',
}

interface SchemaRow {
  field: string
  type: string
  required: boolean
}

const schemaRows = computed<SchemaRow[]>(() =>
  columnDefinitions.value.map(col => ({
    field: col.columnKey,
    type: col.columnType,
    required: col.required,
  })),
)

const schemaTitle = computed(() => props.collectionName)

const tsInterface = computed(() => schemaToTsInterface(columnDefinitions.value, props.collectionName))

const toast = useToast()

async function copySchemaAsTs() {
  await navigator.clipboard.writeText(tsInterface.value)
  toast.add({ title: 'Copied to clipboard', description: 'TypeScript interface copied.', color: 'success' })
}

const schemaTableColumns: TableColumn<SchemaRow>[] = [
  {
    accessorKey: 'field',
    header: 'Field',
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) =>
      h(UBadge, {
        label: row.original.type,
        color: TYPE_COLORS[row.original.type] ?? 'neutral',
        variant: 'subtle',
      }),
  },
  {
    accessorKey: 'required',
    header: 'In all samples',
    cell: ({ row }) =>
      row.original.required
        ? h(UIcon, { name: 'i-lucide-check', class: 'size-4 text-success' })
        : h('span', { class: 'text-dimmed' }, '—'),
  },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <USkeleton
      v-if="loading"
      class="h-32 w-full"
    />
    <div
      v-else-if="info"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Documents
        </div>
        <div class="text-2xl font-semibold">
          {{ info.count }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Data Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.size / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Storage Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.storageSize / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Avg Doc Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.avgObjSize) }} B
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Indexes
        </div>
        <div class="text-2xl font-semibold">
          {{ info.nindexes }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Index Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.totalIndexSize / 1024) }} KB
        </div>
      </UCard>
    </div>
    <UCard v-if="info && info.indexSizes && Object.keys(info.indexSizes).length">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-list-tree"
            class="size-4 text-(--ui-primary)"
          />
          <span class="font-semibold">Index Sizes</span>
        </div>
      </template>
      <UTable
        :data="Object.entries(info.indexSizes).map(([name, size]) => ({ name, sizeKb: Math.round(size / 1024) }))"
        :columns="[{ accessorKey: 'name', header: 'Index' }, { accessorKey: 'sizeKb', header: 'Size (KB)' }]"
      />
    </UCard>

    <UCard v-if="schemaRows.length">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-braces"
              class="size-4 text-(--ui-primary)"
            />
            <span class="font-semibold">{{ schemaTitle }}</span>
            <UBadge
              :label="`${schemaRows.length} fields`"
              variant="subtle"
              color="neutral"
              size="sm"
            />
          </div>
          <UButton
            icon="i-lucide-copy"
            label="Copy as TS Interface"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="copySchemaAsTs"
          />
        </div>
      </template>
      <UTable
        :data="schemaRows"
        :columns="schemaTableColumns"
      />
    </UCard>
  </div>
</template>

<style scoped>
</style>
