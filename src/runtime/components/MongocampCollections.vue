<script setup lang="ts">
import { formatBytes } from '../utils/formatBytes'
import { shortenLabel, topNWithOther } from '../utils/chartData'
import { computed, h, ref, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Column } from '@tanstack/vue-table'
import { useI18n, useMongocampClientApi, useMongocampBucket, useMongocampRoles, useToast } from '#imports'
import useMongocampAdmin from '../composables/useMongocampAdmin'
import { isProtectedCollection } from '../utils/collectionProtection'

const props = withDefaults(defineProps<{
  infoPath?: string
  dataPath?: string
  bucketFilesPath?: string
  // set to false to hide clear/drop for ordinary collections even for an admin
  canManage?: boolean
  // hide the component's own heading, e.g. when the page around it already shows a title
  hideHeading?: boolean
}>(), {
  canManage: true,
  hideHeading: false,
})

const emit = defineEmits<{
  // a collection was cleared or dropped (or a bucket was) and the list has been refreshed
  changed: []
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
const { clearCollection, deleteCollection } = useMongocampAdmin()
const { isAdmin } = useMongocampRoles()
const toast = useToast()

// Clear/drop are irreversible and, in server-proxy mode, run with the api key's power — admins only.
const canClearOrDrop = computed(() => props.canManage && isAdmin.value)

const collections = ref<CollectionRow[]>([])

// biggest ten by the chosen measure, the rest summed into one "other" bar
const chartMetric = ref<'storage' | 'documents'>('storage')
const chartMetrics = computed(() => [
  { value: 'storage', label: t('nuxtUiMongocamp.collections.chartStorage') },
  { value: 'documents', label: t('nuxtUiMongocamp.collections.chartDocuments') },
])
const chartMetricLabel = computed(() => chartMetrics.value.find(m => m.value === chartMetric.value)!.label)
const chartRows = computed(() => topNWithOther(
  collections.value.map(c => ({ label: shortenLabel(c.name), value: chartMetric.value === 'storage' ? c.sizekb * 1024 : c.count })),
  10,
  t('nuxtUiMongocamp.collections.chartOther'),
).map(item => ({ name: item.label, value: item.value })))
const loading = ref(false)

const loadError = ref<unknown>(null)

async function fetchCollections() {
  loading.value = true
  loadError.value = null
  try {
    // two requests in all — the numbers of every collection come in one answer (server 1.7.0), not one request each
    const [names, infos] = await Promise.all([collectionApi.listCollections(), collectionApi.listCollectionInformation({})])
    const byName = new Map(infos.map(info => [info.name, info]))
    const rows = names
      .filter(name => !name.startsWith('mc'))
      .flatMap((name) => {
        const info = byName.get(name)
        return info ? [{ name, count: info.count, sizekb: Math.round(info.storageSize / 1024), indexCount: info.nindexes }] : []
      })
    collections.value = rows
  }
  catch (e: unknown) {
    loadError.value = e
    collections.value = []
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

type PendingKind = 'clear' | 'drop' | 'clearBucket' | 'deleteBucket'

// One confirmation drives all four destructive actions; `name` is what the user has to type.
const pending = ref<{ kind: PendingKind, name: string } | null>(null)
const isConfirmOpen = ref(false)

function askToConfirm(kind: PendingKind, name: string) {
  pending.value = { kind, name }
  isConfirmOpen.value = true
}

const confirmTexts = computed(() => {
  const name = pending.value?.name ?? ''
  switch (pending.value?.kind) {
    case 'clear':
      return { title: t('nuxtUiMongocamp.collections.clearTitle'), description: t('nuxtUiMongocamp.collections.confirmClear', { name }), label: t('nuxtUiMongocamp.collections.clearTitle'), color: 'warning' as const, icon: 'i-lucide-eraser' }
    case 'drop':
      return { title: t('nuxtUiMongocamp.collections.dropTitle'), description: t('nuxtUiMongocamp.collections.confirmDrop', { name }), label: t('nuxtUiMongocamp.collections.dropTitle'), color: 'error' as const, icon: 'i-lucide-trash-2' }
    case 'clearBucket':
      return { title: t('nuxtUiMongocamp.collections.clearBucketTitle'), description: t('nuxtUiMongocamp.collections.confirmClearBucket', { bucketName: name }), label: t('nuxtUiMongocamp.collections.clearBucketTitle'), color: 'warning' as const, icon: 'i-lucide-eraser' }
    default:
      return { title: t('nuxtUiMongocamp.collections.deleteBucketTitle'), description: t('nuxtUiMongocamp.collections.confirmDeleteBucket', { bucketName: name }), label: t('nuxtUiMongocamp.collections.deleteBucketTitle'), color: 'error' as const, icon: 'i-lucide-trash-2' }
  }
})

// The bucket composable reports failure as `false` (and toasts); the modal needs a rejection to stay open.
async function runBucketAction(action: (bucketName: string) => Promise<boolean>, bucketName: string) {
  if (!await action(bucketName)) throw new Error(t('nuxtUiMongocamp.collections.bucketActionFailed', { bucketName }))
}

async function runPending() {
  const action = pending.value
  if (!action) return
  switch (action.kind) {
    case 'clear':
      await clearCollection(action.name)
      toast.add({ title: t('nuxtUiMongocamp.collections.clearedTitle'), description: t('nuxtUiMongocamp.collections.clearedDescription', { name: action.name }), color: 'success' })
      break
    case 'drop':
      await deleteCollection(action.name)
      toast.add({ title: t('nuxtUiMongocamp.collections.droppedTitle'), description: t('nuxtUiMongocamp.collections.droppedDescription', { name: action.name }), color: 'success' })
      break
    case 'clearBucket':
      await runBucketAction(clearBucket, action.name)
      break
    case 'deleteBucket':
      await runBucketAction(deleteBucket, action.name)
      break
  }
  await fetchCollections()
  emit('changed')
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

const columns = computed<TableColumn<CollectionRow>[]>(() => [
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
            'onClick': () => askToConfirm('clearBucket', bucketName),
          })),
          withTooltip(t('nuxtUiMongocamp.collections.deleteBucketTooltip'), h(UButton, {
            'icon': 'i-lucide-trash-2',
            'color': 'error',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.deleteBucketTooltip'),
            'loading': bucketActionInFlight.value.has(bucketName),
            'onClick': () => askToConfirm('deleteBucket', bucketName),
          })),
        )
      }
      else if (canClearOrDrop.value && !isProtectedCollection(row.original.name)) {
        const name = row.original.name
        buttons.push(
          withTooltip(t('nuxtUiMongocamp.collections.copyTooltip'), h(UButton, {
            'icon': 'i-lucide-copy',
            'color': 'neutral',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.copyTooltip'),
            'onClick': () => openCopy(name),
          })),
          withTooltip(t('nuxtUiMongocamp.collections.renameTooltip'), h(UButton, {
            'icon': 'i-lucide-pencil',
            'color': 'neutral',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.renameTooltip'),
            'onClick': () => openRename(name),
          })),
          withTooltip(t('nuxtUiMongocamp.collections.clearTooltip'), h(UButton, {
            'icon': 'i-lucide-eraser',
            'color': 'warning',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.clearTooltip'),
            'onClick': () => askToConfirm('clear', name),
          })),
          withTooltip(t('nuxtUiMongocamp.collections.dropTooltip'), h(UButton, {
            'icon': 'i-lucide-trash-2',
            'color': 'error',
            'variant': 'ghost',
            'size': 'sm',
            'aria-label': t('nuxtUiMongocamp.collections.dropTooltip'),
            'onClick': () => askToConfirm('drop', name),
          })),
        )
      }
      return h('div', { class: 'flex gap-1 justify-end' }, buttons)
    },
  },
])

// Copy writes a whole new collection, so it is offered to the same people as clear/drop
const copySource = ref('')
const isCopyOpen = ref(false)

function openCopy(name: string) {
  copySource.value = name
  isCopyOpen.value = true
}

// Rename is offered to the same people (it breaks the grants of the old name)
const renameSource = ref('')
const isRenameOpen = ref(false)

async function onRenamed() {
  await fetchCollections()
  emit('changed')
}

function openRename(name: string) {
  renameSource.value = name
  isRenameOpen.value = true
}

fetchCollections()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <h2
        v-if="!hideHeading"
        class="text-xl font-semibold"
      >
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

    <MongocampErrorAlert
      :error="loadError"
      @retry="fetchCollections"
    />

    <!-- secondary: collapsed, built from the numbers the table already holds -->
    <details
      v-if="chartRows.length > 1"
      class="text-sm"
      data-testid="collections-chart"
    >
      <summary class="cursor-pointer text-dimmed">
        {{ t('nuxtUiMongocamp.collections.chartSummary') }}
      </summary>
      <div class="mt-2 flex flex-col gap-2">
        <USelect
          v-model="chartMetric"
          :items="chartMetrics"
          size="sm"
          class="w-44"
          :aria-label="t('nuxtUiMongocamp.collections.chartMetric')"
        />
        <MongocampChart
          :data="chartRows"
          index="name"
          :categories="[{ key: 'value', label: chartMetricLabel }]"
          :format="chartMetric === 'storage' ? formatBytes : undefined"
          :chart-label="t('nuxtUiMongocamp.collections.chartLabel', { metric: chartMetricLabel })"
          :chart-description="t('nuxtUiMongocamp.collections.chartDescription', { count: chartRows.length })"
        />
      </div>
    </details>

    <UTable
      v-model:global-filter="globalFilter"
      v-model:sorting="sorting"
      :data="collections"
      :columns="columns"
      :loading="loading"
    >
      <template #empty>
        <MongocampEmptyState :title="t('nuxtUiMongocamp.empty.collections')" />
      </template>
    </UTable>

    <MongocampCollectionCopy
      v-if="copySource"
      v-model:open="isCopyOpen"
      :source="copySource"
      @done="fetchCollections"
    />

    <MongocampCollectionRename
      v-if="renameSource"
      v-model:open="isRenameOpen"
      :source="renameSource"
      @done="onRenamed"
    />

    <MongocampConfirmByName
      v-if="pending"
      v-model:open="isConfirmOpen"
      :name="pending.name"
      :title="confirmTexts.title"
      :description="confirmTexts.description"
      :confirm-label="confirmTexts.label"
      :confirm-color="confirmTexts.color"
      :confirm-icon="confirmTexts.icon"
      :on-confirm="runPending"
    />
  </div>
</template>
