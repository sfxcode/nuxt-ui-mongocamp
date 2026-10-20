<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useMongocampError } from '#imports'
import { useMongocampImport } from '../composables/useMongocampImport'
import { DEFAULT_IMPORT_LIMITS } from '../utils/importRows'
import type { ImportColumnType, ImportError } from '../utils/importRows'
import { detectImportFormat, prepareImport } from '../utils/importPipeline'
import type { ImportFormat } from '../utils/importPipeline'

const props = defineProps<{
  collectionName: string
}>()

const emit = defineEmits<{
  // rows inserted by one run; the parent reloads its list
  imported: [count: number]
}>()

const PREVIEW_ROWS = 5
const ERROR_LIMIT = 10

type Step = 'select' | 'preview' | 'importing' | 'done'

interface FailedRange {
  start: number
  count: number
  from: number
  to: number
  reason: string
  mayBePartial: boolean
}

const { t } = useI18n()
const { describeError } = useMongocampError()
const { importRows } = useMongocampImport()

const isOpen = ref(false)
const step = ref<Step>('select')
const fileInputRef = ref<HTMLInputElement | null>(null)
const readError = ref('')

const fileName = ref('')
const fileText = ref('')
const format = ref<ImportFormat>('json')
const delimiter = ref(',')
// null = use the types inferred from the data; set as soon as the user changes one
const userColumnTypes = ref<Record<string, ImportColumnType> | null>(null)
const emptyAsText = ref(false)
const stampMetadata = ref(true)

const progress = ref({ done: 0, total: 0 })
const attemptRows = ref<Record<string, unknown>[]>([])
const attemptSources = ref<number[]>([])
const failures = ref<FailedRange[]>([])
const totalInserted = ref(0)
const skipped = ref(0)
let controller: AbortController | null = null

const prepared = computed(() => {
  if (!fileText.value) return null
  return prepareImport({
    format: format.value,
    text: fileText.value,
    delimiter: delimiter.value,
    columnTypes: format.value === 'csv' ? (userColumnTypes.value ?? undefined) : undefined,
    emptyCells: emptyAsText.value ? 'empty-string' : 'omit',
  })
})

const columnTypes = computed(() => userColumnTypes.value ?? prepared.value?.columnTypes ?? {})

const formatItems = computed(() => [
  { label: t('nuxtUiMongocamp.import.formatJson'), value: 'json' },
  { label: t('nuxtUiMongocamp.import.formatCsv'), value: 'csv' },
])
const delimiterItems = computed(() => [
  { label: t('nuxtUiMongocamp.import.delimiterComma'), value: ',' },
  { label: t('nuxtUiMongocamp.import.delimiterSemicolon'), value: ';' },
  { label: t('nuxtUiMongocamp.import.delimiterTab'), value: '\t' },
])
const typeItems = computed(() => [
  { label: t('nuxtUiMongocamp.import.typeString'), value: 'string' },
  { label: t('nuxtUiMongocamp.import.typeNumber'), value: 'number' },
  { label: t('nuxtUiMongocamp.import.typeBoolean'), value: 'boolean' },
  { label: t('nuxtUiMongocamp.import.typeDate'), value: 'date-time' },
  { label: t('nuxtUiMongocamp.import.typeJson'), value: 'json' },
])

const readyCount = computed(() => prepared.value?.rows.length ?? 0)
const rowErrors = computed(() => (prepared.value?.errors ?? []).filter(e => e.rowIndex >= 0 && e.code !== 'too-many-rows'))
const fileErrors = computed(() => (prepared.value?.errors ?? []).filter(e => e.rowIndex < 0 && e.code !== 'too-many-rows'))
const visibleErrors = computed(() => [...rowErrors.value].sort((a, b) => a.rowIndex - b.rowIndex).slice(0, ERROR_LIMIT))
const hiddenErrorCount = computed(() => Math.max(0, rowErrors.value.length - ERROR_LIMIT))

const previewColumns = computed(() => (prepared.value?.columns ?? []).map(column => ({
  id: column,
  header: column,
  accessorFn: (row: Record<string, string>) => row[column],
})))
const previewRows = computed(() => (prepared.value?.rows ?? []).slice(0, PREVIEW_ROWS).map((row) => {
  const shown: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) shown[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  return shown
}))

function errorText(error: ImportError): string {
  const message = t(`nuxtUiMongocamp.import.error.${error.code}`)
  if (error.rowIndex < 0) return message
  const where = error.column
    ? t('nuxtUiMongocamp.import.errorRowColumn', { row: error.rowIndex + 1, column: error.column })
    : t('nuxtUiMongocamp.import.errorRow', { row: error.rowIndex + 1 })
  return `${where}: ${message}`
}

function resetState() {
  controller?.abort()
  controller = null
  step.value = 'select'
  readError.value = ''
  fileName.value = ''
  fileText.value = ''
  format.value = 'json'
  delimiter.value = ','
  userColumnTypes.value = null
  emptyAsText.value = false
  stampMetadata.value = true
  progress.value = { done: 0, total: 0 }
  attemptRows.value = []
  attemptSources.value = []
  failures.value = []
  totalInserted.value = 0
  skipped.value = 0
}

function openModal() {
  isOpen.value = true
}

watch(isOpen, (open) => {
  if (!open) resetState()
})

function openFilePicker() {
  fileInputRef.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  readError.value = ''
  try {
    const text = await file.text()
    fileName.value = file.name
    fileText.value = text
    format.value = detectImportFormat(file.name, text)
    delimiter.value = file.name.toLowerCase().endsWith('.tsv') ? '\t' : ','
    userColumnTypes.value = null
    step.value = 'preview'
  }
  catch {
    readError.value = t('nuxtUiMongocamp.import.readError')
  }
}

function backToSelect() {
  fileName.value = ''
  fileText.value = ''
  userColumnTypes.value = null
  step.value = 'select'
}

function onFormatChange(value: string) {
  format.value = value as ImportFormat
  userColumnTypes.value = null
}

function onDelimiterChange(value: string) {
  delimiter.value = value
  userColumnTypes.value = null
}

function setColumnType(column: string, type: string) {
  userColumnTypes.value = { ...columnTypes.value, [column]: type as ImportColumnType }
}

// The server explains a rejected batch in the response body ({ msg }); the generated client only
// keeps the Response, so read it best-effort and fall back to the generic description.
async function failureReason(error: unknown): Promise<string> {
  const response = (error as { response?: Response } | null)?.response
  if (response) {
    try {
      const body = await response.clone().json() as { msg?: unknown }
      if (typeof body?.msg === 'string' && body.msg) return body.msg
    }
    catch {
      // body already consumed or not JSON — use the generic message
    }
  }
  return describeError(error).message
}

async function runImport(rows: Record<string, unknown>[], sources: number[]) {
  attemptRows.value = rows
  attemptSources.value = sources
  progress.value = { done: 0, total: rows.length }
  failures.value = []
  skipped.value = 0
  step.value = 'importing'
  const run = new AbortController()
  controller = run

  const result = await importRows(props.collectionName, rows, {
    signal: run.signal,
    stampMetadata: stampMetadata.value,
    onProgress: (p) => {
      progress.value = p
    },
  })
  if (controller === run) controller = null
  // the dialog was closed while the import ran: nothing left to show
  if (!isOpen.value) return

  totalInserted.value += result.inserted
  skipped.value = result.skipped
  failures.value = await Promise.all(result.failedBatches.map(async batch => ({
    start: batch.start,
    count: batch.count,
    from: sources[batch.start]! + 1,
    to: sources[batch.start + batch.count - 1]! + 1,
    reason: await failureReason(batch.error),
    mayBePartial: batch.mayBePartial,
  })))
  step.value = 'done'
  if (result.inserted > 0) emit('imported', result.inserted)
}

async function startImport() {
  if (!prepared.value || prepared.value.rows.length === 0) return
  await runImport(prepared.value.rows, prepared.value.sourceIndexes)
}

async function retryFailed() {
  const rows: Record<string, unknown>[] = []
  const sources: number[] = []
  for (const range of failures.value) {
    rows.push(...attemptRows.value.slice(range.start, range.start + range.count))
    sources.push(...attemptSources.value.slice(range.start, range.start + range.count))
  }
  if (rows.length > 0) await runImport(rows, sources)
}

function stopImport() {
  controller?.abort()
}

const anyMayBePartial = computed(() => failures.value.some(f => f.mayBePartial))
const progressPercent = computed(() => (progress.value.total === 0 ? 0 : Math.round((progress.value.done / progress.value.total) * 100)))
const limitsText = computed(() => ({ maxRows: DEFAULT_IMPORT_LIMITS.maxRows, maxMb: DEFAULT_IMPORT_LIMITS.maxBytes / (1024 * 1024) }))
</script>

<template>
  <UTooltip :text="t('nuxtUiMongocamp.import.trigger')">
    <UButton
      icon="i-lucide-file-up"
      color="neutral"
      variant="ghost"
      size="sm"
      :aria-label="t('nuxtUiMongocamp.import.trigger')"
      @click="openModal"
    />
  </UTooltip>

  <UModal
    v-model:open="isOpen"
    :title="t('nuxtUiMongocamp.import.title')"
    :dismissible="step !== 'importing'"
    :ui="{ footer: 'justify-end', content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div
        v-if="step === 'select'"
        class="flex flex-col items-start gap-3"
      >
        <p class="font-medium">
          {{ t('nuxtUiMongocamp.import.chooseFile') }}
        </p>
        <p class="text-sm text-dimmed">
          {{ t('nuxtUiMongocamp.import.hint', limitsText) }}
        </p>
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          accept=".json,.csv,.tsv,.txt,application/json,text/csv"
          data-testid="import-file-input"
          @change="handleFileSelected"
        >
        <UButton
          icon="i-lucide-folder-open"
          :label="t('nuxtUiMongocamp.import.chooseButton')"
          @click="openFilePicker"
        />
        <UAlert
          v-if="readError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="readError"
        />
      </div>

      <div
        v-else-if="step === 'preview' && prepared"
        class="flex flex-col gap-4"
      >
        <div class="flex flex-wrap items-end gap-3">
          <span class="text-sm font-medium break-all">{{ fileName }}</span>
          <USelect
            :model-value="format"
            :items="formatItems"
            size="sm"
            class="w-28"
            :aria-label="t('nuxtUiMongocamp.import.format')"
            @update:model-value="onFormatChange"
          />
          <USelect
            v-if="format === 'csv'"
            :model-value="delimiter"
            :items="delimiterItems"
            size="sm"
            class="w-40"
            :aria-label="t('nuxtUiMongocamp.import.delimiter')"
            @update:model-value="onDelimiterChange"
          />
        </div>

        <UAlert
          v-for="error in fileErrors"
          :key="error.code"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="errorText(error)"
        />

        <template v-if="fileErrors.length === 0">
          <p class="text-sm font-medium">
            {{ t('nuxtUiMongocamp.import.summary', { ready: readyCount, total: prepared.sourceRowCount }) }}
          </p>
          <UAlert
            v-if="prepared.truncated"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :description="t('nuxtUiMongocamp.import.truncated', { maxRows: limitsText.maxRows })"
          />

          <div
            v-if="format === 'csv' && prepared.columns.length > 0"
            class="flex flex-col gap-2"
          >
            <p class="text-sm font-medium">
              {{ t('nuxtUiMongocamp.import.columnTypes') }}
            </p>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div
                v-for="column in prepared.columns"
                :key="column"
                class="flex items-center gap-2"
              >
                <span class="w-32 truncate text-sm">{{ column }}</span>
                <USelect
                  :model-value="columnTypes[column]"
                  :items="typeItems"
                  size="sm"
                  class="w-32"
                  :aria-label="column"
                  @update:model-value="setColumnType(column, $event)"
                />
              </div>
            </div>
            <USwitch
              v-model="emptyAsText"
              :label="t('nuxtUiMongocamp.import.emptyAsText')"
            />
          </div>

          <UAlert
            v-if="rowErrors.length > 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('nuxtUiMongocamp.import.problems', { count: rowErrors.length }, rowErrors.length)"
          >
            <template #description>
              <ul class="list-disc pl-5 text-sm">
                <li
                  v-for="error in visibleErrors"
                  :key="`${error.rowIndex}-${error.column ?? ''}-${error.code}`"
                >
                  {{ errorText(error) }}
                </li>
              </ul>
              <p
                v-if="hiddenErrorCount > 0"
                class="mt-1 text-sm"
              >
                {{ t('nuxtUiMongocamp.import.moreErrors', { count: hiddenErrorCount }) }}
              </p>
            </template>
          </UAlert>

          <div v-if="previewRows.length > 0">
            <p class="mb-1 text-sm font-medium">
              {{ t('nuxtUiMongocamp.import.previewTitle', { count: previewRows.length }) }}
            </p>
            <UTable
              :data="previewRows"
              :columns="previewColumns"
              class="max-h-64"
            />
          </div>

          <USwitch
            v-model="stampMetadata"
            :label="t('nuxtUiMongocamp.import.stampMetadata')"
          />
        </template>
      </div>

      <div
        v-else-if="step === 'importing'"
        class="flex flex-col gap-3"
      >
        <p class="text-sm">
          {{ t('nuxtUiMongocamp.import.importing', progress) }}
        </p>
        <UProgress
          :model-value="progressPercent"
          :aria-label="t('nuxtUiMongocamp.import.importing', progress)"
        />
      </div>

      <div
        v-else-if="step === 'done'"
        class="flex flex-col gap-3"
      >
        <UAlert
          :color="totalInserted > 0 ? 'success' : 'neutral'"
          variant="subtle"
          :icon="totalInserted > 0 ? 'i-lucide-circle-check' : 'i-lucide-info'"
          :title="t('nuxtUiMongocamp.import.result', { count: totalInserted }, totalInserted)"
        />
        <UAlert
          v-if="skipped > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('nuxtUiMongocamp.import.aborted', { count: skipped })"
        />
        <UAlert
          v-if="failures.length > 0"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        >
          <template #description>
            <ul class="list-disc pl-5 text-sm">
              <li
                v-for="failure in failures"
                :key="failure.start"
              >
                {{ t('nuxtUiMongocamp.import.failedBatch', { from: failure.from, to: failure.to, reason: failure.reason }) }}
              </li>
            </ul>
            <p
              v-if="anyMayBePartial"
              class="mt-2 text-sm"
            >
              {{ t('nuxtUiMongocamp.import.maybePartial') }}
            </p>
          </template>
        </UAlert>
      </div>
    </template>

    <template #footer>
      <template v-if="step === 'preview'">
        <UButton
          :label="t('nuxtUiMongocamp.import.back')"
          color="neutral"
          variant="ghost"
          @click="backToSelect"
        />
        <UButton
          :label="t('nuxtUiMongocamp.import.importButton', { count: readyCount }, readyCount)"
          :disabled="readyCount === 0"
          @click="startImport"
        />
      </template>
      <template v-else-if="step === 'importing'">
        <UButton
          :label="t('nuxtUiMongocamp.import.stop')"
          color="neutral"
          variant="subtle"
          @click="stopImport"
        />
      </template>
      <template v-else-if="step === 'done'">
        <UButton
          v-if="failures.length > 0"
          :label="t('nuxtUiMongocamp.import.retryFailed')"
          color="neutral"
          variant="subtle"
          @click="retryFailed"
        />
        <UButton
          :label="t('nuxtUiMongocamp.import.close')"
          @click="isOpen = false"
        />
      </template>
      <template v-else>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="isOpen = false"
        />
      </template>
    </template>
  </UModal>
</template>
