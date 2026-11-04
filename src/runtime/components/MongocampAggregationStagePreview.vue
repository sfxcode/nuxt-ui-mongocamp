<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { useMongocampAggregation } from '../composables/useMongocampAggregation'
import type { DescribedAggregationError } from '../composables/useMongocampAggregation'
import { PREVIEW_DEBOUNCE_MS, PREVIEW_LIMIT, pipelineKey } from '../utils/aggregationPreview'
import type { RequestStage } from '../utils/aggregationPipeline'
import { formatCell, resultColumns } from '../utils/aggregationResult'

// The first few documents after one stage of the pipeline: the stages up to it, cut by a `$limit`. It runs when it appears
// and again, debounced, when the pipeline it shows changes; an older run is cancelled. Shown only while the parent keeps it
// mounted, so a closed preview makes no request.
const props = defineProps<{
  collectionName: string
  // the request pipeline to run (already ending in the preview `$limit`); `undefined` when it cannot run yet
  pipeline: RequestStage[] | undefined
  // 1-based stage number, for the title
  stageNumber: number
}>()

const { t } = useI18n()
const { runAggregation, describeAggregationError } = useMongocampAggregation()

const loading = ref(false)
const rows = ref<Record<string, unknown>[]>([])
const error = ref<DescribedAggregationError | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
let run = 0

function cancel() {
  clearTimeout(timer)
  controller?.abort()
  controller = undefined
}

async function execute(pipeline: RequestStage[]) {
  cancel()
  const mine = ++run
  const own = new AbortController()
  controller = own
  loading.value = true
  error.value = null
  try {
    const result = await runAggregation(props.collectionName, pipeline, { page: 1, rowsPerPage: PREVIEW_LIMIT }, { signal: own.signal })
    if (mine !== run) return
    rows.value = result.rows
  }
  catch (e) {
    if (mine !== run || own.signal.aborted) return
    rows.value = []
    error.value = await describeAggregationError(e)
  }
  finally {
    if (mine === run) loading.value = false
  }
}

const key = computed(() => (props.pipeline ? pipelineKey(props.pipeline) : ''))
let first = true
watch(key, () => {
  if (!props.pipeline) {
    cancel()
    run++
    loading.value = false
    rows.value = []
    error.value = null
    return
  }
  const pipeline = props.pipeline
  if (first) {
    first = false
    void execute(pipeline)
    return
  }
  // the user is still typing: wait, and drop whatever is running
  cancel()
  clearTimeout(timer)
  loading.value = true
  timer = setTimeout(() => void execute(pipeline), PREVIEW_DEBOUNCE_MS)
}, { immediate: true })

onBeforeUnmount(() => {
  cancel()
  run++
})

const columns = computed(() => resultColumns(rows.value))
</script>

<template>
  <div
    class="flex flex-col gap-1 rounded-md bg-elevated/50 p-2"
    data-test="stage-preview"
  >
    <p class="text-xs text-dimmed">
      {{ t('nuxtUiMongocamp.aggregation.previewTitle', { count: PREVIEW_LIMIT, n: stageNumber }) }}
    </p>
    <p
      v-if="!pipeline"
      class="text-sm text-dimmed"
      data-test="preview-blocked"
    >
      {{ t('nuxtUiMongocamp.aggregation.previewBlocked') }}
    </p>
    <p
      v-else-if="loading"
      class="text-sm text-dimmed"
      role="status"
      data-test="preview-loading"
    >
      {{ t('nuxtUiMongocamp.aggregation.previewLoading') }}
    </p>
    <p
      v-else-if="error"
      class="text-sm text-error"
      role="alert"
      data-test="preview-error"
    >
      {{ error.message }}
    </p>
    <p
      v-else-if="rows.length === 0"
      class="text-sm text-dimmed"
      data-test="preview-empty"
    >
      {{ t('nuxtUiMongocamp.aggregation.previewEmpty') }}
    </p>
    <div
      v-else
      class="overflow-x-auto"
    >
      <table
        class="w-full text-left font-mono text-xs"
        data-test="preview-table"
      >
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column"
              class="pr-3 font-medium"
            >
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in rows"
            :key="index"
          >
            <td
              v-for="column in columns"
              :key="column"
              class="max-w-64 truncate pr-3"
              :title="formatCell(row[column]).full"
            >
              {{ formatCell(row[column]).text }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
