<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { useMongocampAggregation } from '../composables/useMongocampAggregation'
import type { AggregationResult, DescribedAggregationError } from '../composables/useMongocampAggregation'
import {
  VISUAL_STAGE_TYPES,
  buildPipeline,
  findForbidden,
  parsePipeline,
  pipelineToText,
  toVisualStages,
  validateStages,
} from '../utils/aggregationPipeline'
import type { AggregationStage, AggregationStageType, PipelineError, RequestStage } from '../utils/aggregationPipeline'
import { formatCell, resultColumns } from '../utils/aggregationResult'
import { downloadTextFile, rowsToCsv } from '../utils/exportRows'

const props = defineProps<{
  collectionName: string
}>()

const PAGE_SIZES = [10, 20, 50, 100]
// an example, not a translation: it is JSON
const JSON_PLACEHOLDER = '[ { "$match": { } }, { "$limit": 10 } ]'

// the text the user edits for one stage — kept as text so a half-typed value is not lost
interface StageDraft {
  id: string
  type: AggregationStageType
  text: string
}

const DEFAULT_TEXT: Record<AggregationStageType, string> = {
  $match: '{}',
  $group: '{ "_id": "$field", "count": { "$sum": 1 } }',
  $sort: '{ "count": -1 }',
  $project: '{}',
  $limit: '10',
}

const { t } = useI18n()
const { runAggregation, describeAggregationError } = useMongocampAggregation()

let idCounter = 0
function newId(): string {
  return `stage-${idCounter++}`
}

const mode = ref<'visual' | 'json'>('visual')
const drafts = ref<StageDraft[]>([{ id: newId(), type: '$match', text: DEFAULT_TEXT.$match }])
const rawText = ref('[]')
const newStageType = ref<AggregationStageType>('$group')
const modeError = ref('')

const rowsPerPage = ref(20)
const page = ref(1)
const running = ref(false)
const result = ref<AggregationResult | null>(null)
const runError = ref<DescribedAggregationError | null>(null)
// what the shown result was produced by — paging re-runs this, not whatever has been typed since
let lastPipeline: RequestStage[] | null = null
let runCounter = 0

// ---- the stage editor ------------------------------------------------------------------------

interface DraftState {
  stage: AggregationStage
  error?: string
}

const draftStates = computed<DraftState[]>(() => drafts.value.map((draft) => {
  const stage: AggregationStage = { id: draft.id, type: draft.type, value: undefined }
  if (draft.text.trim() === '') return { stage }
  try {
    stage.value = JSON.parse(draft.text)
  }
  catch {
    return { stage, error: t('nuxtUiMongocamp.aggregation.stageErrors.invalid-json') }
  }
  const issue = validateStages([stage])[0]
  if (issue) return { stage, error: t(`nuxtUiMongocamp.aggregation.stageErrors.${issue.code}`) }
  const forbidden = findForbidden(buildPipeline([stage]))[0]
  if (forbidden) return { stage, error: t('nuxtUiMongocamp.aggregation.stageErrors.forbidden', { operator: forbidden.operator }) }
  return { stage }
}))

function stageLabel(type: AggregationStageType): string {
  return t(`nuxtUiMongocamp.aggregation.stageTypes.${type}`)
}

const stageTypeItems = computed(() => VISUAL_STAGE_TYPES.map(type => ({ label: stageLabel(type), value: type })))

function addStage() {
  drafts.value = [...drafts.value, { id: newId(), type: newStageType.value, text: DEFAULT_TEXT[newStageType.value] }]
}

function removeStage(index: number) {
  drafts.value = drafts.value.filter((_, i) => i !== index)
}

function moveStage(index: number, offset: -1 | 1) {
  const target = index + offset
  if (target < 0 || target >= drafts.value.length) return
  const next = [...drafts.value]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  drafts.value = next
}

// ---- the pipeline that would run ---------------------------------------------------------------

function pipelineErrorText(error: PipelineError): string {
  const n = (error.stageIndex ?? 0) + 1
  return t(`nuxtUiMongocamp.aggregation.pipelineErrors.${error.code}`, { n, operator: error.operator ?? '' })
}

const pipelineState = computed<{ pipeline?: RequestStage[], error?: string }>(() => {
  if (mode.value === 'visual') {
    if (draftStates.value.some(state => state.error)) return { error: t('nuxtUiMongocamp.aggregation.fixStages') }
    return { pipeline: buildPipeline(draftStates.value.map(state => state.stage)) }
  }
  const parsed = parsePipeline(rawText.value)
  return parsed.ok ? { pipeline: parsed.pipeline } : { error: pipelineErrorText(parsed.error) }
})

const canRun = computed(() => pipelineState.value.pipeline !== undefined && !running.value)

function switchMode(next: 'visual' | 'json') {
  modeError.value = ''
  if (next === mode.value) return
  if (next === 'json') {
    if (draftStates.value.some(state => state.error)) {
      modeError.value = t('nuxtUiMongocamp.aggregation.fixStagesFirst')
      return
    }
    rawText.value = pipelineToText(buildPipeline(draftStates.value.map(state => state.stage)))
    mode.value = 'json'
    return
  }
  const parsed = parsePipeline(rawText.value)
  if (!parsed.ok) {
    modeError.value = pipelineErrorText(parsed.error)
    return
  }
  const stages = toVisualStages(parsed.pipeline, () => newId())
  if (!stages) {
    modeError.value = t('nuxtUiMongocamp.aggregation.cannotShowVisually')
    return
  }
  drafts.value = stages.map(stage => ({ id: stage.id, type: stage.type, text: JSON.stringify(stage.value, null, 2) }))
  mode.value = 'visual'
}

// ---- running and paging -----------------------------------------------------------------------

async function execute(pageNumber: number) {
  if (!lastPipeline) return
  const run = ++runCounter
  running.value = true
  runError.value = null
  try {
    const outcome = await runAggregation(props.collectionName, lastPipeline, { page: pageNumber, rowsPerPage: rowsPerPage.value })
    if (run !== runCounter) return
    result.value = outcome
    page.value = outcome.page
  }
  catch (error) {
    const described = await describeAggregationError(error)
    if (run !== runCounter) return
    result.value = null
    runError.value = described
  }
  finally {
    if (run === runCounter) running.value = false
  }
}

async function runPipeline() {
  const pipeline = pipelineState.value.pipeline
  if (!pipeline || running.value) return
  lastPipeline = pipeline
  await execute(1)
}

function onPageChange(next: number) {
  page.value = next
  void execute(next)
}

function onPageSizeChange(size: number) {
  rowsPerPage.value = size
  void execute(1)
}

// a result belongs to one collection
watch(() => props.collectionName, () => {
  runCounter++
  lastPipeline = null
  result.value = null
  runError.value = null
  running.value = false
  page.value = 1
})

// ---- results --------------------------------------------------------------------------------------

const columnKeys = computed(() => resultColumns(result.value?.rows ?? []))

const tableColumns = computed(() => columnKeys.value.map(key => ({
  id: key,
  header: key,
  // keys can contain dots, which an accessorKey would read as a path
  accessorFn: (row: Record<string, unknown>) => row[key],
  cell: ({ getValue }: { getValue: () => unknown }) => {
    const { text, full } = formatCell(getValue())
    return h('span', { title: full === text ? undefined : full, class: 'font-mono text-xs' }, text)
  },
})))

function exportPage(format: 'json' | 'csv') {
  const rows = result.value?.rows ?? []
  if (format === 'json') {
    downloadTextFile(`${props.collectionName}-aggregation.json`, JSON.stringify(rows, null, 2), 'application/json')
    return
  }
  downloadTextFile(`${props.collectionName}-aggregation.csv`, rowsToCsv(rows, columnKeys.value), 'text/csv')
}

const exportMenuItems = computed(() => [
  { label: t('nuxtUiMongocamp.aggregation.exportJson'), icon: 'i-lucide-file-json', onSelect: () => exportPage('json') },
  { label: t('nuxtUiMongocamp.aggregation.exportCsv'), icon: 'i-lucide-file-spreadsheet', onSelect: () => exportPage('csv') },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <UButton
          color="neutral"
          size="sm"
          :variant="mode === 'visual' ? 'subtle' : 'ghost'"
          :aria-pressed="mode === 'visual'"
          :label="t('nuxtUiMongocamp.aggregation.modeVisual')"
          @click="switchMode('visual')"
        />
        <UButton
          color="neutral"
          size="sm"
          :variant="mode === 'json' ? 'subtle' : 'ghost'"
          :aria-pressed="mode === 'json'"
          :label="t('nuxtUiMongocamp.aggregation.modeJson')"
          @click="switchMode('json')"
        />
      </div>
      <UButton
        icon="i-lucide-play"
        :label="t('nuxtUiMongocamp.aggregation.run')"
        :loading="running"
        :disabled="!canRun"
        @click="runPipeline"
      />
    </div>

    <UAlert
      v-if="modeError"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="modeError"
    />

    <div
      v-if="mode === 'visual'"
      class="flex flex-col gap-3"
    >
      <div
        v-for="(draft, index) in drafts"
        :key="draft.id"
        class="flex flex-col gap-2 rounded-md border border-default p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">
            {{ t('nuxtUiMongocamp.aggregation.stageTitle', { n: index + 1 }) }}
            <code class="ml-1 font-mono text-xs">{{ draft.type }}</code>
          </span>
          <div class="flex items-center">
            <UButton
              icon="i-lucide-arrow-up"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="index === 0"
              :aria-label="t('nuxtUiMongocamp.aggregation.moveUp')"
              @click="moveStage(index, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="index === drafts.length - 1"
              :aria-label="t('nuxtUiMongocamp.aggregation.moveDown')"
              @click="moveStage(index, 1)"
            />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('nuxtUiMongocamp.aggregation.removeStage')"
              @click="removeStage(index)"
            />
          </div>
        </div>
        <UTextarea
          v-model="draft.text"
          :rows="draft.type === '$limit' ? 1 : 3"
          :color="draftStates[index]?.error ? 'error' : undefined"
          class="w-full font-mono"
          :aria-label="t('nuxtUiMongocamp.aggregation.stageValue', { type: draft.type })"
        />
        <p
          v-if="draftStates[index]?.error"
          class="text-sm text-error"
        >
          {{ draftStates[index]?.error }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-model="newStageType"
          :items="stageTypeItems"
          size="sm"
          class="w-72"
          :aria-label="t('nuxtUiMongocamp.aggregation.newStageType')"
        />
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          :label="t('nuxtUiMongocamp.aggregation.addStage')"
          @click="addStage"
        />
      </div>
    </div>

    <div
      v-else
      class="flex flex-col gap-2"
    >
      <UTextarea
        v-model="rawText"
        :rows="12"
        :color="pipelineState.error ? 'error' : undefined"
        class="w-full font-mono"
        :placeholder="JSON_PLACEHOLDER"
        :aria-label="t('nuxtUiMongocamp.aggregation.jsonLabel')"
      />
      <p
        v-if="pipelineState.error"
        class="text-sm text-error"
      >
        {{ pipelineState.error }}
      </p>
    </div>

    <UAlert
      v-if="runError"
      :color="runError.kind === 'retryable' ? 'warning' : 'error'"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('nuxtUiMongocamp.aggregation.runFailedTitle')"
      :description="runError.message"
    >
      <template #actions>
        <UButton
          v-if="runError.kind === 'unauthorized'"
          :label="t('nuxtUiMongocamp.errors.loginAgain')"
          to="/"
          color="error"
          variant="subtle"
          icon="i-lucide-log-in"
        />
        <UButton
          v-else-if="runError.kind !== 'forbidden'"
          :label="t('nuxtUiMongocamp.common.retry')"
          :color="runError.kind === 'retryable' ? 'warning' : 'error'"
          variant="subtle"
          icon="i-lucide-refresh-cw"
          @click="execute(page)"
        />
      </template>
    </UAlert>

    <template v-if="result">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm text-dimmed">
          {{ t('nuxtUiMongocamp.aggregation.resultsCount', { count: result.total }, result.total) }}
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <UDropdownMenu :items="exportMenuItems">
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="result.rows.length === 0"
              :aria-label="t('nuxtUiMongocamp.aggregation.exportTooltip')"
            />
          </UDropdownMenu>
          <USelect
            :model-value="rowsPerPage"
            :items="PAGE_SIZES"
            size="sm"
            class="w-20"
            :aria-label="t('nuxtUiMongocamp.aggregation.pageSize')"
            @update:model-value="onPageSizeChange"
          />
          <UPagination
            :page="page"
            :total="result.total"
            :items-per-page="rowsPerPage"
            @update:page="onPageChange"
          />
        </div>
      </div>

      <UTable
        :data="result.rows"
        :columns="tableColumns"
        :loading="running"
      >
        <template #empty>
          <MongocampEmptyState :title="t('nuxtUiMongocamp.aggregation.noResults')" />
        </template>
      </UTable>
      <p class="text-xs text-dimmed">
        {{ t('nuxtUiMongocamp.aggregation.precisionNote') }}
      </p>
    </template>
  </div>
</template>
