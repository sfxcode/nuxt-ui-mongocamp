<script setup lang="ts">
import { computed, h, ref, resolveComponent, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { IndexInfo } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n, useMongocampError, useToast } from '#imports'
import { useMongocampIndex } from '../composables/useMongocampIndex'
import { useMongocampCollectionStats } from '../composables/useMongocampCollectionStats'
import type { CollectionStorage, IndexUsage } from '../composables/useMongocampCollectionStats'
import { readServerError } from '../utils/serverError'
import {
  buildIndexRequest, canDropIndex, classifyIndexError, describeKey, formatBytes, indexKeys, isExpiringIndex, isTextIndex, isUnusedIndex,
  MAX_INDEX_FIELDS, validateIndexForm,
} from '../utils/indexForm'
import type { IndexForm, IndexFormProblem, IndexKind } from '../utils/indexForm'
import { shortenLabel } from '../utils/chartData'
import MongocampConfirmByName from './MongocampConfirmByName.vue'

// The indexes of one collection with their size and how often each was used, plus creating (standard, unique, text,
// expiring; compound for standard and unique) and dropping them. Usage comes from `$indexStats`: the counter starts
// with the database server, so "never used" is a hint. The `_id_` index is never offered for dropping.
const props = withDefaults(defineProps<{
  collectionName: string
  // hides create and drop (read-only view); the server still decides what is allowed
  canManage?: boolean
  // field names offered while typing a field of a new index
  fields?: string[]
}>(), {
  canManage: true,
  fields: () => [],
})

const emit = defineEmits<{
  // after an index was created or dropped, so a parent can refresh its own numbers
  changed: []
}>()

const { t } = useI18n()
const toast = useToast()
const { describeServerError } = useMongocampError()
const { listIndexDetails, createOrderedIndex, createExpiringIndex, deleteIndex } = useMongocampIndex()
const { getStorage, getIndexUsage } = useMongocampCollectionStats()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UTooltip = resolveComponent('UTooltip')

const indexes = ref<IndexInfo[]>([])
const storage = ref<CollectionStorage | null>(null)
const usage = ref<Map<string, IndexUsage>>(new Map())
const usageFailed = ref(false)
const loading = ref(false)
const loadError = ref<unknown>(null)
let run = 0

// The list is what matters: sizes and usage are extras that may fail on their own (a missing grant, a slow server)
// without hiding the indexes.
async function load() {
  if (!props.collectionName) return
  const mine = ++run
  loading.value = true
  loadError.value = null
  try {
    const [list, size, uses] = await Promise.allSettled([listIndexDetails(props.collectionName), getStorage(props.collectionName), getIndexUsage(props.collectionName)])
    if (mine !== run) return
    if (list.status === 'rejected') {
      loadError.value = list.reason
      indexes.value = []
      return
    }
    indexes.value = list.value
    storage.value = size.status === 'fulfilled' ? size.value : null
    usageFailed.value = uses.status === 'rejected'
    usage.value = new Map(uses.status === 'fulfilled' ? uses.value.map(u => [u.name, u]) : [])
  }
  finally {
    if (mine === run) loading.value = false
  }
}

watch(() => props.collectionName, load, { immediate: true })
defineExpose({ refresh: load })

interface Row {
  name: string
  keys: string
  unique: boolean
  text: boolean
  sparse: boolean
  hidden: boolean
  // only that there is a partial filter: the server lists its content garbled
  partial: boolean
  collation: boolean
  language: string | undefined
  expireAfterSeconds: number | undefined
  size: number | undefined
  ops: number | undefined
  since: string | null | undefined
}

const rows = computed<Row[]>(() =>
  indexes.value.map(idx => ({
    name: idx.name,
    keys: indexKeys(idx).map(describeKey).join(', '),
    unique: idx.unique,
    text: isTextIndex(idx),
    sparse: idx.sparse,
    hidden: idx.hidden,
    partial: idx.partialFilterExpression != null,
    collation: idx.collation != null,
    language: idx.defaultLanguage ?? undefined,
    expireAfterSeconds: isExpiringIndex(idx) ? idx.expireAfterSeconds : undefined,
    size: storage.value?.indexSizes[idx.name],
    ops: usage.value.get(idx.name)?.ops,
    since: usage.value.get(idx.name)?.since,
  })),
)

// one bar per index, biggest / most used first; indexes without a number are left out
const sizeChart = computed(() => rows.value
  .filter(r => typeof r.size === 'number')
  .map(r => ({ name: shortenLabel(r.name), size: r.size as number }))
  .sort((a, b) => b.size - a.size))
const usageChart = computed(() => rows.value
  .filter(r => typeof r.ops === 'number')
  .map(r => ({ name: shortenLabel(r.name), ops: r.ops as number }))
  .sort((a, b) => b.ops - a.ops))

function withTooltip(text: string, node: ReturnType<typeof h>) {
  return h(UTooltip, { text }, { default: () => node })
}

function dateText(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : undefined
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—'
}

const columns = computed<TableColumn<Row>[]>(() => [
  { accessorKey: 'name', header: t('nuxtUiMongocamp.collectionInfos.columnIndex') },
  {
    accessorKey: 'keys',
    header: t('nuxtUiMongocamp.collectionInfos.columnKeys'),
    cell: ({ row }) => h('span', { class: 'font-mono text-xs' }, row.original.keys),
  },
  {
    id: 'flags',
    header: t('nuxtUiMongocamp.collectionInfos.columnType'),
    cell: ({ row }) => {
      const flags: Array<{ label: string, color: 'warning' | 'info' | 'secondary' }> = []
      if (row.original.unique) flags.push({ label: 'unique', color: 'warning' })
      if (row.original.text) flags.push({ label: 'text', color: 'info' })
      if (row.original.expireAfterSeconds !== undefined) flags.push({ label: `expire ${row.original.expireAfterSeconds}s`, color: 'secondary' })
      if (row.original.sparse) flags.push({ label: 'sparse', color: 'secondary' })
      if (row.original.partial) flags.push({ label: 'partial', color: 'secondary' })
      if (row.original.hidden) flags.push({ label: 'hidden', color: 'warning' })
      if (row.original.collation) flags.push({ label: 'collation', color: 'secondary' })
      if (row.original.text && row.original.language) flags.push({ label: row.original.language, color: 'info' })
      const badges = flags.map(flag => h(UBadge, { label: flag.label, color: flag.color, variant: 'subtle', size: 'sm' }))
      // a plain index has none of the special flags — say so instead of leaving the cell blank
      if (badges.length === 0) badges.push(h(UBadge, { label: t('nuxtUiMongocamp.collectionInfos.typeStandard'), color: 'neutral', variant: 'subtle', size: 'sm' }))
      return h('div', { class: 'flex flex-wrap gap-1' }, badges)
    },
  },
  {
    accessorKey: 'size',
    header: t('nuxtUiMongocamp.indexes.columnSize'),
    cell: ({ row }) => h('span', row.original.size === undefined ? '—' : formatBytes(row.original.size)),
  },
  {
    id: 'usage',
    header: t('nuxtUiMongocamp.indexes.columnUsage'),
    cell: ({ row }) => {
      const { name, ops, since } = row.original
      if (ops === undefined) return h('span', { class: 'text-dimmed', title: usageFailed.value ? t('nuxtUiMongocamp.indexes.usageUnavailable') : undefined }, '—')
      if (isUnusedIndex(name, ops)) {
        return withTooltip(t('nuxtUiMongocamp.indexes.neverUsedHint'), h(UBadge, {
          label: t('nuxtUiMongocamp.indexes.neverUsed', { date: dateText(since) }),
          color: 'warning',
          variant: 'subtle',
          size: 'sm',
        }))
      }
      return h('span', { class: 'text-sm' }, [
        t('nuxtUiMongocamp.indexes.usageOps', { count: ops }),
        h('span', { class: 'text-dimmed' }, ` ${t('nuxtUiMongocamp.indexes.usageSince', { date: dateText(since) })}`),
      ])
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      if (!props.canManage) return null
      if (!canDropIndex(row.original.name)) {
        return h('div', { class: 'flex justify-end' }, withTooltip(t('nuxtUiMongocamp.indexes.protectedHint'), h('span', { class: 'text-dimmed text-xs' }, '—')))
      }
      return h('div', { class: 'flex justify-end' }, withTooltip(t('nuxtUiMongocamp.collectionInfos.deleteIndexTooltip'), h(UButton, {
        'icon': 'i-lucide-trash-2',
        'color': 'error',
        'variant': 'ghost',
        'size': 'sm',
        'aria-label': t('nuxtUiMongocamp.collectionInfos.deleteIndexTooltip'),
        'onClick': () => askDrop(row.original.name),
      })))
    },
  },
])

// ---- create
const createOpen = ref(false)
const attempted = ref(false)
const createError = ref('')
const creating = ref(false)
const form = ref<IndexForm>(blankForm())

function blankForm(): IndexForm {
  return { kind: 'standard', fields: [{ field: '', descending: false }], name: '', expireAfter: '3600s', sparse: false, hidden: false, partialFilter: '' }
}

// a JSON example belongs here, not in a locale string (vue-i18n reads braces as placeholders)
const PARTIAL_PLACEHOLDER = '{ "status": "active" }'

const kindItems = computed(() => (['standard', 'unique', 'text', 'expiring'] as IndexKind[]).map(kind => ({
  value: kind,
  label: t(`nuxtUiMongocamp.indexes.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`),
})))
// an expiring index has one field; a text index may span several (no direction), the others are compound
const singleField = computed(() => form.value.kind === 'expiring')
const textKind = computed(() => form.value.kind === 'text')
const takesOptions = computed(() => form.value.kind !== 'expiring')
const shownFields = computed(() => (singleField.value ? form.value.fields.slice(0, 1) : form.value.fields))
const problems = computed(() => validateIndexForm(form.value))
const problemText = (problem: IndexFormProblem) => {
  const key = { 'no-field': 'problemNoField', 'empty-field': 'problemEmptyField', 'duplicate-field': 'problemDuplicateField', 'too-many-fields': 'problemTooManyFields', 'bad-duration': 'problemBadDuration', 'bad-name': 'problemBadName', 'bad-partial-filter': 'problemPartialJson', 'sparse-and-partial': 'problemSparsePartial' }[problem]
  return t(`nuxtUiMongocamp.indexes.${key}`, { max: MAX_INDEX_FIELDS })
}

function openCreate() {
  form.value = blankForm()
  attempted.value = false
  createError.value = ''
  createOpen.value = true
}

function addField() {
  if (form.value.fields.length < MAX_INDEX_FIELDS) form.value.fields.push({ field: '', descending: false })
}

function removeField(index: number) {
  if (form.value.fields.length > 1) form.value.fields.splice(index, 1)
}

async function describeCreateError(error: unknown): Promise<string> {
  const server = await readServerError(error)
  const raw = `${server.message ?? ''} ${error instanceof Error ? error.message : ''}`
  const kind = classifyIndexError(raw)
  if (kind === 'duplicate-values') return t('nuxtUiMongocamp.indexes.errorDuplicate')
  if (kind === 'conflict') return t('nuxtUiMongocamp.indexes.errorConflict')
  if (kind === 'empty-keys') return t('nuxtUiMongocamp.indexes.errorEmptyKeys')
  return (await describeServerError(error, 'nuxtUiMongocamp.collectionInfos.errorCreateIndex')).message
}

async function submitCreate() {
  attempted.value = true
  createError.value = ''
  if (problems.value.length > 0) return
  const request = buildIndexRequest(form.value)
  creating.value = true
  try {
    const result = request.call === 'createOrderedIndex'
      ? await createOrderedIndex(props.collectionName, request.keys, request.options)
      : await createExpiringIndex(props.collectionName, request.field, request.duration)
    createOpen.value = false
    toast.add({ title: t('nuxtUiMongocamp.indexes.created', { name: result.name }), color: 'success' })
    await load()
    emit('changed')
  }
  catch (e: unknown) {
    createError.value = await describeCreateError(e)
  }
  finally {
    creating.value = false
  }
}

// ---- drop (typed confirmation; `_id_` is never offered and refused here as well)
const dropOpen = ref(false)
const dropName = ref('')

function askDrop(name: string) {
  if (!canDropIndex(name)) return
  dropName.value = name
  dropOpen.value = true
}

async function runDrop() {
  if (!canDropIndex(dropName.value)) return
  await deleteIndex(props.collectionName, dropName.value)
  toast.add({ title: t('nuxtUiMongocamp.indexes.dropped', { name: dropName.value }), color: 'success' })
  await load()
  emit('changed')
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-list-tree"
            class="size-4 text-(--ui-primary)"
          />
          <span class="font-semibold">{{ t('nuxtUiMongocamp.collectionInfos.indexes') }}</span>
          <UBadge
            :label="t('nuxtUiMongocamp.collectionInfos.indexesCount', { count: rows.length })"
            variant="subtle"
            color="neutral"
            size="sm"
          />
        </div>
        <UButton
          v-if="canManage"
          icon="i-lucide-plus"
          :label="t('nuxtUiMongocamp.collectionInfos.createIndex')"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="openCreate"
        />
      </div>
    </template>

    <MongocampErrorAlert
      :error="loadError"
      @retry="load"
    />
    <p
      v-if="usageFailed && !loadError"
      class="mb-2 text-xs text-dimmed"
    >
      {{ t('nuxtUiMongocamp.indexes.usageUnavailable') }}
    </p>
    <UTable
      :data="rows"
      :columns="columns"
      :loading="loading"
    />

    <!-- secondary: collapsed, built from the sizes and usage already loaded -->
    <details
      v-if="sizeChart.length > 1 || usageChart.length > 1"
      class="mt-3 text-sm"
      data-testid="index-charts"
    >
      <summary class="cursor-pointer text-dimmed">
        {{ t('nuxtUiMongocamp.indexes.chartsSummary') }}
      </summary>
      <div class="mt-2 grid gap-4 md:grid-cols-2">
        <div v-if="sizeChart.length > 1">
          <h4 class="mb-1 text-xs font-medium">
            {{ t('nuxtUiMongocamp.indexes.chartSize') }}
          </h4>
          <MongocampChart
            :data="sizeChart"
            index="name"
            :categories="[{ key: 'size', label: t('nuxtUiMongocamp.indexes.chartSize') }]"
            :format="formatBytes"
            :height="200"
            :chart-label="t('nuxtUiMongocamp.indexes.chartSize')"
            :chart-description="t('nuxtUiMongocamp.indexes.chartSizeDescription', { count: sizeChart.length })"
          />
        </div>
        <div v-if="usageChart.length > 1">
          <h4 class="mb-1 text-xs font-medium">
            {{ t('nuxtUiMongocamp.indexes.chartUsage') }}
          </h4>
          <MongocampChart
            :data="usageChart"
            index="name"
            :categories="[{ key: 'ops', label: t('nuxtUiMongocamp.indexes.chartUsage') }]"
            :height="200"
            :chart-label="t('nuxtUiMongocamp.indexes.chartUsage')"
            :chart-description="t('nuxtUiMongocamp.indexes.chartUsageDescription', { count: usageChart.length })"
          />
        </div>
      </div>
    </details>

    <UModal
      v-model:open="createOpen"
      :title="t('nuxtUiMongocamp.collectionInfos.createIndexTitle')"
    >
      <template #body>
        <form
          class="flex flex-col gap-4"
          @submit.prevent="submitCreate"
        >
          <UFormField :label="t('nuxtUiMongocamp.indexes.kindLabel')">
            <USelect
              v-model="form.kind"
              :items="kindItems"
              class="w-full"
              :aria-label="t('nuxtUiMongocamp.indexes.kindLabel')"
            />
          </UFormField>

          <div class="flex flex-col gap-2">
            <div
              v-for="(row, index) in shownFields"
              :key="index"
              class="flex items-center gap-1"
            >
              <UInput
                v-model="row.field"
                class="min-w-0 flex-1"
                :list="`index-fields-${collectionName}`"
                :placeholder="t('nuxtUiMongocamp.indexes.fieldPlaceholder')"
                :aria-label="t('nuxtUiMongocamp.indexes.fieldLabel', { position: index + 1 })"
              />
              <UButton
                v-if="!singleField && !textKind"
                :icon="row.descending ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
                color="neutral"
                variant="ghost"
                :label="row.descending ? t('nuxtUiMongocamp.indexes.directionDesc') : t('nuxtUiMongocamp.indexes.directionAsc')"
                :aria-label="t('nuxtUiMongocamp.indexes.directionLabel', { position: index + 1 })"
                @click="row.descending = !row.descending"
              />
              <UButton
                v-if="!singleField && form.fields.length > 1"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                :aria-label="t('nuxtUiMongocamp.indexes.removeField', { position: index + 1 })"
                @click="removeField(index)"
              />
            </div>
            <datalist :id="`index-fields-${collectionName}`">
              <option
                v-for="field in fields"
                :key="field"
                :value="field"
              />
            </datalist>
            <UButton
              v-if="!singleField"
              icon="i-lucide-plus"
              color="neutral"
              variant="soft"
              size="sm"
              class="self-start"
              :label="t('nuxtUiMongocamp.indexes.addField')"
              :disabled="form.fields.length >= MAX_INDEX_FIELDS"
              @click="addField"
            />
            <p
              v-if="!singleField && !textKind && form.fields.length > 1"
              class="text-xs text-dimmed"
            >
              {{ t('nuxtUiMongocamp.indexes.compoundNote') }}
            </p>
            <p
              v-if="form.kind === 'text'"
              class="text-xs text-dimmed"
            >
              {{ t('nuxtUiMongocamp.indexes.textNote') }}
            </p>
          </div>

          <UFormField
            v-if="form.kind === 'expiring'"
            :label="t('nuxtUiMongocamp.indexes.expireLabel')"
            :help="t('nuxtUiMongocamp.indexes.expireHelp')"
          >
            <UInput
              v-model="form.expireAfter"
              class="w-full"
              :aria-label="t('nuxtUiMongocamp.indexes.expireLabel')"
            />
          </UFormField>

          <UFormField
            v-if="takesOptions"
            :label="t('nuxtUiMongocamp.indexes.nameLabel')"
          >
            <UInput
              v-model="form.name"
              class="w-full"
              :aria-label="t('nuxtUiMongocamp.indexes.nameLabel')"
            />
          </UFormField>

          <template v-if="takesOptions">
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              <UCheckbox
                v-model="form.sparse"
                :label="t('nuxtUiMongocamp.indexes.sparseLabel')"
                :description="t('nuxtUiMongocamp.indexes.sparseHelp')"
              />
              <UCheckbox
                v-model="form.hidden"
                :label="t('nuxtUiMongocamp.indexes.hiddenLabel')"
                :description="t('nuxtUiMongocamp.indexes.hiddenHelp')"
              />
            </div>
            <UFormField
              :label="t('nuxtUiMongocamp.indexes.partialLabel')"
              :help="t('nuxtUiMongocamp.indexes.partialHelp')"
            >
              <UTextarea
                v-model="form.partialFilter"
                class="w-full font-mono"
                :rows="2"
                :placeholder="PARTIAL_PLACEHOLDER"
                :aria-label="t('nuxtUiMongocamp.indexes.partialLabel')"
              />
            </UFormField>
          </template>

          <ul
            v-if="attempted && problems.length > 0"
            class="list-disc pl-5 text-sm text-error"
            role="alert"
          >
            <li
              v-for="problem in problems"
              :key="problem"
            >
              {{ problemText(problem) }}
            </li>
          </ul>
          <p
            v-if="createError"
            class="text-sm text-error"
            role="alert"
          >
            {{ createError }}
          </p>

          <div class="flex justify-end">
            <UButton
              type="submit"
              icon="i-lucide-plus"
              :label="t('nuxtUiMongocamp.indexes.create')"
              :loading="creating"
            />
          </div>
        </form>
      </template>
    </UModal>

    <MongocampConfirmByName
      v-if="dropName"
      v-model:open="dropOpen"
      :name="dropName"
      :title="t('nuxtUiMongocamp.indexes.dropTitle')"
      :description="t('nuxtUiMongocamp.indexes.dropDescription', { name: dropName })"
      :confirm-label="t('nuxtUiMongocamp.indexes.dropConfirm')"
      :on-confirm="runDrop"
    />
  </UCard>
</template>
