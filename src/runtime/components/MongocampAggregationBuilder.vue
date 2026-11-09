<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { useMongocampAggregation } from '../composables/useMongocampAggregation'
import { useMongocampSavedPipelines } from '../composables/useMongocampSavedPipelines'
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
import { previewPipeline } from '../utils/aggregationPreview'
import { DEFAULT_TOP, MAX_TOP, templateStages, TEMPLATES, validateTemplateInput } from '../utils/aggregationTemplates'
import type { DateUnit, TemplateKey } from '../utils/aggregationTemplates'
import type { SavedPipelineEntry } from '../utils/savedPipelines'
import { formatCell, resultColumns } from '../utils/aggregationResult'
import { downloadTextFile, rowsToCsv } from '../utils/exportRows'

const props = defineProps<{
  collectionName: string
  // a Lucene filter (what a table shows): the server applies it as the first `$match` of every run — previews, the result page
  filter?: string
}>()

// the filter the runs use; the chip's remove button clears it without touching the prop
const appliedFilter = ref<string | undefined>(props.filter)
watch(() => props.filter, (next) => {
  appliedFilter.value = next
})

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
  $unwind: '"$field"',
  $addFields: '{ "newField": "$field" }',
  $count: '"count"',
  $bucketAuto: '{ "groupBy": "$field", "buckets": 5 }',
}

const { t } = useI18n()
const { runAggregation, describeAggregationError, listFieldNames } = useMongocampAggregation()
const { saved: savedPipelines, save: savePipeline, remove: removeSavedPipeline } = useMongocampSavedPipelines(() => props.collectionName)

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
// the page of rows is shown as a table or charted (no extra request)
const resultView = ref<'table' | 'chart'>('table')
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

// ---- previews: the first documents after one stage -----------------------------------------------------------------

const openPreviews = ref<Set<string>>(new Set())

function togglePreview(id: string) {
  const next = new Set(openPreviews.value)
  if (!next.delete(id)) next.add(id)
  openPreviews.value = next
}

// the stages up to this one, cut by a small limit; `undefined` while one of them has an error
function previewFor(index: number): RequestStage[] | undefined {
  if (draftStates.value.slice(0, index + 1).some(state => state.error)) return undefined
  return previewPipeline(draftStates.value.map(state => state.stage), index)
}

// ---- field names for the templates ------------------------------------------------------------------

const fieldNames = ref<string[]>([])
watch(() => props.collectionName, async (name) => {
  fieldNames.value = []
  try {
    const names = await listFieldNames(name)
    if (name === props.collectionName) fieldNames.value = names
  }
  catch {
    // suggestions only: the field can be typed
  }
}, { immediate: true })

// ---- templates ------------------------------------------------------------------------------------------

const templateKey = ref<TemplateKey>('count-by-field')
const templateField = ref('')
const templateValueField = ref('')
const templateTop = ref(DEFAULT_TOP)
const templateUnit = ref<DateUnit>('month')
const templateProblem = ref('')
const TEMPLATE_LABEL_KEYS: Record<TemplateKey, string> = {
  'count-by-field': 'templateCountByField',
  'top-values': 'templateTopValues',
  'date-histogram': 'templateDateHistogram',
  'sum-avg-by-group': 'templateSumAvg',
}
const templateItems = computed(() => TEMPLATES.map(info => ({ value: info.key, label: t(`nuxtUiMongocamp.aggregation.${TEMPLATE_LABEL_KEYS[info.key]}`) })))
const templateInfo = computed(() => TEMPLATES.find(info => info.key === templateKey.value)!)
const unitItems = computed(() => [{ value: 'year', label: t('nuxtUiMongocamp.aggregation.unitYear') }, { value: 'month', label: t('nuxtUiMongocamp.aggregation.unitMonth') }, { value: 'day', label: t('nuxtUiMongocamp.aggregation.unitDay') }])
const templateFieldLabel = computed(() => t(templateKey.value === 'date-histogram' ? 'nuxtUiMongocamp.aggregation.templateFieldDate' : templateInfo.value.needsValueField ? 'nuxtUiMongocamp.aggregation.templateFieldGroup' : 'nuxtUiMongocamp.aggregation.templateField'))

// A template's stages go after the stages already there; an editor that still holds only the untouched first stage is replaced.
function isUntouched(): boolean {
  return drafts.value.length === 1 && drafts.value[0]!.type === '$match' && drafts.value[0]!.text.trim() === DEFAULT_TEXT.$match
}

function addTemplate() {
  const input = { field: templateField.value, valueField: templateValueField.value, top: templateInfo.value.needsTop ? Number(templateTop.value) : undefined, unit: templateUnit.value }
  const problem = validateTemplateInput(templateKey.value, input)
  if (problem) {
    templateProblem.value = t({ 'field': 'nuxtUiMongocamp.aggregation.templateProblemField', 'value-field': 'nuxtUiMongocamp.aggregation.templateProblemValue', 'top': 'nuxtUiMongocamp.aggregation.templateProblemTop' }[problem])
    return
  }
  templateProblem.value = ''
  const added: StageDraft[] = templateStages(templateKey.value, input).map(stage => ({ id: newId(), type: stage.type, text: JSON.stringify(stage.value, null, 2) }))
  drafts.value = [...(isUntouched() ? [] : drafts.value), ...added]
}

// ---- saved pipelines --------------------------------------------------------------------------------------

const saveName = ref('')
const saveError = ref('')

function saveCurrent() {
  saveError.value = ''
  const pipeline = pipelineState.value.pipeline
  if (!pipeline || pipeline.length === 0) {
    saveError.value = t('nuxtUiMongocamp.aggregation.saveFailedPipeline')
    return
  }
  const result = savePipeline(saveName.value, pipeline)
  if (result.ok) {
    saveName.value = ''
    return
  }
  saveError.value = t({ 'invalid-name': 'nuxtUiMongocamp.aggregation.saveFailedName', 'invalid-pipeline': 'nuxtUiMongocamp.aggregation.saveFailedPipeline', 'limit': 'nuxtUiMongocamp.aggregation.saveFailedLimit', 'too-large': 'nuxtUiMongocamp.aggregation.saveFailedSize' }[result.reason])
}

function applySaved(entry: SavedPipelineEntry) {
  modeError.value = ''
  openPreviews.value = new Set()
  const stages = toVisualStages(entry.pipeline, () => newId())
  if (stages) {
    drafts.value = stages.map(stage => ({ id: stage.id, type: stage.type, text: JSON.stringify(stage.value, null, 2) }))
    mode.value = 'visual'
    return
  }
  // a stage the editor has no form for: the JSON tab shows it
  rawText.value = pipelineToText(entry.pipeline)
  mode.value = 'json'
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
    const outcome = await runAggregation(props.collectionName, lastPipeline, { page: pageNumber, rowsPerPage: rowsPerPage.value }, { filter: appliedFilter.value })
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
    <div
      v-if="appliedFilter"
      class="flex flex-wrap items-center gap-2 text-sm"
      data-test="applied-filter"
    >
      <span class="text-dimmed">{{ t('nuxtUiMongocamp.aggregation.appliesTo') }}</span>
      <UBadge
        :label="appliedFilter"
        color="neutral"
        variant="subtle"
        class="font-mono"
      />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="t('nuxtUiMongocamp.aggregation.removeFilter')"
        @click="appliedFilter = undefined"
      />
    </div>
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

    <div class="flex flex-wrap items-center gap-2">
      <UPopover
        v-if="mode === 'visual'"
        :content="{ align: 'start' }"
      >
        <UButton
          icon="i-lucide-wand-sparkles"
          color="neutral"
          variant="soft"
          size="sm"
          :label="t('nuxtUiMongocamp.aggregation.templatesButton')"
        />
        <template #content>
          <form
            class="flex w-80 flex-col gap-3 p-3"
            data-test="templates-panel"
            @submit.prevent="addTemplate"
          >
            <USelect
              v-model="templateKey"
              :items="templateItems"
              :aria-label="t('nuxtUiMongocamp.aggregation.templateLabel')"
            />
            <UFormField :label="templateFieldLabel">
              <UInput
                v-model="templateField"
                class="w-full"
                list="aggregation-fields"
                :aria-label="templateFieldLabel"
              />
            </UFormField>
            <UFormField
              v-if="templateInfo.needsValueField"
              :label="t('nuxtUiMongocamp.aggregation.templateValueField')"
            >
              <UInput
                v-model="templateValueField"
                class="w-full"
                list="aggregation-fields"
                :aria-label="t('nuxtUiMongocamp.aggregation.templateValueField')"
              />
            </UFormField>
            <UFormField
              v-if="templateInfo.needsTop"
              :label="t('nuxtUiMongocamp.aggregation.templateTop')"
            >
              <UInput
                v-model.number="templateTop"
                type="number"
                :min="1"
                :max="MAX_TOP"
                class="w-full"
                :aria-label="t('nuxtUiMongocamp.aggregation.templateTop')"
              />
            </UFormField>
            <UFormField
              v-if="templateInfo.needsUnit"
              :label="t('nuxtUiMongocamp.aggregation.templateUnit')"
            >
              <USelect
                v-model="templateUnit"
                :items="unitItems"
                class="w-full"
                :aria-label="t('nuxtUiMongocamp.aggregation.templateUnit')"
              />
            </UFormField>
            <datalist id="aggregation-fields">
              <option
                v-for="name in fieldNames"
                :key="name"
                :value="name"
              />
            </datalist>
            <p
              v-if="templateProblem"
              class="text-sm text-error"
              role="alert"
            >
              {{ templateProblem }}
            </p>
            <p class="text-xs text-dimmed">
              {{ t('nuxtUiMongocamp.aggregation.templatesHelp') }}
            </p>
            <UButton
              type="submit"
              icon="i-lucide-plus"
              :label="t('nuxtUiMongocamp.aggregation.addTemplate')"
            />
          </form>
        </template>
      </UPopover>

      <UPopover :content="{ align: 'start' }">
        <UButton
          icon="i-lucide-bookmark"
          color="neutral"
          variant="soft"
          size="sm"
          :label="t('nuxtUiMongocamp.aggregation.savedButton')"
        />
        <template #content>
          <div
            class="flex w-96 max-w-[90vw] flex-col gap-2 p-3"
            data-test="saved-panel"
          >
            <h3 class="text-sm font-semibold">
              {{ t('nuxtUiMongocamp.aggregation.savedTitle') }}
            </h3>
            <p
              v-if="savedPipelines.length === 0"
              class="text-sm text-dimmed"
            >
              {{ t('nuxtUiMongocamp.aggregation.savedEmpty') }}
            </p>
            <div
              v-for="entry in savedPipelines"
              :key="entry.name"
              class="flex items-center gap-1"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                class="min-w-0 flex-1 justify-start"
                :label="entry.name"
                @click="applySaved(entry)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="t('nuxtUiMongocamp.aggregation.deleteSaved', { name: entry.name })"
                @click="removeSavedPipeline(entry.name)"
              />
            </div>
            <form
              class="mt-1 flex items-center gap-1"
              @submit.prevent="saveCurrent"
            >
              <UInput
                v-model="saveName"
                size="sm"
                class="min-w-0 flex-1"
                maxlength="80"
                :placeholder="t('nuxtUiMongocamp.aggregation.saveNamePlaceholder')"
                :aria-label="t('nuxtUiMongocamp.aggregation.saveName')"
              />
              <UButton
                type="submit"
                icon="i-lucide-save"
                size="sm"
                :label="t('nuxtUiMongocamp.aggregation.save')"
                :disabled="saveName.trim() === ''"
              />
            </form>
            <p
              v-if="saveError"
              class="text-xs text-error"
              role="alert"
            >
              {{ saveError }}
            </p>
            <p class="text-xs text-dimmed">
              {{ t('nuxtUiMongocamp.aggregation.savedNote') }}
            </p>
          </div>
        </template>
      </UPopover>
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
          :rows="['$limit', '$count', '$unwind'].includes(draft.type) ? 1 : 3"
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
        <div class="flex flex-col gap-2">
          <UButton
            :icon="openPreviews.has(draft.id) ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            size="xs"
            class="self-start"
            :aria-pressed="openPreviews.has(draft.id)"
            :label="openPreviews.has(draft.id) ? t('nuxtUiMongocamp.aggregation.previewHide') : t('nuxtUiMongocamp.aggregation.previewShow')"
            @click="togglePreview(draft.id)"
          />
          <MongocampAggregationStagePreview
            v-if="openPreviews.has(draft.id)"
            :collection-name="collectionName"
            :pipeline="previewFor(index)"
            :stage-number="index + 1"
            :filter="appliedFilter"
          />
        </div>
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
          <UFieldGroup size="sm">
            <UButton
              icon="i-lucide-table"
              color="neutral"
              :variant="resultView === 'table' ? 'subtle' : 'ghost'"
              :label="t('nuxtUiMongocamp.aggregationChart.viewTable')"
              data-testid="view-table"
              @click="resultView = 'table'"
            />
            <UButton
              icon="i-lucide-chart-column"
              color="neutral"
              :variant="resultView === 'chart' ? 'subtle' : 'ghost'"
              :label="t('nuxtUiMongocamp.aggregationChart.viewChart')"
              :disabled="result.rows.length === 0"
              data-testid="view-chart"
              @click="resultView = 'chart'"
            />
          </UFieldGroup>
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

      <MongocampAggregationChart
        v-if="resultView === 'chart'"
        :rows="result.rows"
      />
      <UTable
        v-else
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
