<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { useMongocampAggregation } from '../composables/useMongocampAggregation'
import type { DescribedAggregationError } from '../composables/useMongocampAggregation'
import type { ValueKind } from '../utils/analyzeSamples'
import type { DateUnit } from '../utils/aggregationTemplates'
import { dominantKindOfField } from '../utils/fieldDetails'
import { chartKindFor, chartRequest, chartTypeFor, DEFAULT_BUCKETS, DEFAULT_TOP, highestPoint, MAX_PERIODS, rowsToPoints } from '../utils/collectionChart'
import type { ChartKind, ChartPoint } from '../utils/collectionChart'

// How the values of one field are distributed, drawn with Nuxt UI's `UChart` (which needs `@tanstack/charts`): the most common
// values of a text or true/false field, documents per year/month/day of a date field, equal-count ranges of a number field.
// The kind comes from the server's field analysis (`fields/detail`) unless `kind` is given. The data comes from one aggregation; a text
// description (aria) and a collapsible table carry the same numbers for anyone who cannot see the chart.
const props = withDefaults(defineProps<{
  collectionName: string
  field: string
  // force a chart kind instead of detecting it from a sample
  kind?: ChartKind
  // values: how many of the most common values are shown
  top?: number
  // numbers: how many ranges
  buckets?: number
  // a Lucene filter (what a table shows): only the matching documents are charted; the kind is still detected from the whole collection
  filter?: string
}>(), {
  kind: undefined,
  top: DEFAULT_TOP,
  buckets: DEFAULT_BUCKETS,
  filter: undefined,
})

const { t } = useI18n()
const { runAggregation, listFieldDetails, describeAggregationError } = useMongocampAggregation()

type Status = 'loading' | 'ready' | 'empty' | 'unsupported' | 'unknown' | 'invalid' | 'error'
const status = ref<Status>('loading')
const current = ref<ChartKind | undefined>(undefined)
const detectedType = ref<ValueKind | undefined>(undefined)
const points = ref<ChartPoint[]>([])
const total = ref(0)
const unit = ref<DateUnit>('month')
const error = ref<DescribedAggregationError | null>(null)
// the kind found for one collection + field: a changed date unit does not sample again
let detected: { key: string, kind: ChartKind | undefined, type: ValueKind | undefined } | undefined
let run = 0
let controller: AbortController | undefined

const unitItems = computed(() => (['year', 'month', 'day'] as DateUnit[]).map(value => ({ value, label: t(`nuxtUiMongocamp.charts.unit${value.charAt(0).toUpperCase()}${value.slice(1)}`) })))

async function load() {
  controller?.abort()
  const own = new AbortController()
  controller = own
  const mine = ++run
  status.value = 'loading'
  error.value = null
  points.value = []
  try {
    let chartKind = props.kind
    if (!chartKind) {
      const key = `${props.collectionName}\u0000${props.field}`
      if (detected?.key !== key) {
        // the server's own field analysis (types of every path found in a sample of its documents), not a client-side guess
        const details = await listFieldDetails(props.collectionName)
        if (mine !== run) return
        const found = dominantKindOfField(details, props.field)
        detected = { key, kind: chartKindFor(found), type: found }
      }
      detectedType.value = detected.type
      chartKind = detected.kind
      if (!chartKind) {
        status.value = detected.type === undefined ? 'unknown' : 'unsupported'
        return
      }
    }
    current.value = chartKind
    const request = chartRequest(chartKind, props.field, { top: props.top, buckets: props.buckets, unit: unit.value })
    if (!request) {
      status.value = 'invalid'
      return
    }
    const result = await runAggregation(props.collectionName, request.pipeline, { page: 1, rowsPerPage: request.rowsPerPage }, { signal: own.signal, filter: props.filter })
    if (mine !== run) return
    points.value = rowsToPoints(chartKind, result.rows, t('nuxtUiMongocamp.charts.noneLabel'))
    total.value = result.total
    status.value = points.value.length === 0 ? 'empty' : 'ready'
  }
  catch (e) {
    if (mine !== run || own.signal.aborted) return
    error.value = await describeAggregationError(e)
    if (mine === run) status.value = 'error'
  }
}

watch(() => [props.collectionName, props.field, props.kind, props.top, props.buckets, props.filter], load, { immediate: true })
// only the date histogram changes with the unit
watch(unit, () => {
  if (current.value === 'dates') void load()
})
onBeforeUnmount(() => {
  controller?.abort()
  run++
})

const titleKey = computed(() => ({ values: 'titleValues', dates: 'titleDates', numbers: 'titleNumbers' })[current.value ?? 'values'])
const title = computed(() => t(`nuxtUiMongocamp.charts.${titleKey.value}`))
const chartType = computed(() => chartTypeFor(current.value ?? 'values', points.value.length))
const categories = computed(() => [{ key: 'count' as const, label: t('nuxtUiMongocamp.charts.seriesLabel') }])
const ariaLabel = computed(() => t('nuxtUiMongocamp.charts.ariaLabel', { title: title.value, field: props.field }))
const ariaDescription = computed(() => {
  const best = highestPoint(points.value)
  if (!best) return ''
  const common = { shown: points.value.length, label: best.label, count: best.count }
  if (current.value === 'dates') return t('nuxtUiMongocamp.charts.ariaDescriptionDates', { ...common, first: points.value[0]!.label, last: points.value.at(-1)!.label })
  return t(current.value === 'numbers' ? 'nuxtUiMongocamp.charts.ariaDescriptionNumbers' : 'nuxtUiMongocamp.charts.ariaDescriptionValues', common)
})
const note = computed(() => {
  if (current.value === 'values') return total.value > points.value.length ? t('nuxtUiMongocamp.charts.noteValues', { shown: points.value.length, total: total.value }) : t('nuxtUiMongocamp.charts.noteValuesAll', { total: total.value })
  if (current.value === 'dates') return total.value > MAX_PERIODS ? t('nuxtUiMongocamp.charts.notePeriods', { shown: points.value.length, total: total.value }) : ''
  return t('nuxtUiMongocamp.charts.noteNumbers')
})
const unsupportedType = computed(() => t(`nuxtUiMongocamp.charts.type${(detectedType.value ?? 'null').charAt(0).toUpperCase()}${(detectedType.value ?? 'null').slice(1)}`))
</script>

<template>
  <div
    class="flex flex-col gap-3"
    data-test="collection-chart"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold">
        {{ title }} <span class="font-mono font-normal text-dimmed">{{ field }}</span>
      </h3>
      <div
        v-if="current === 'dates'"
        class="flex items-center gap-2"
      >
        <span class="text-xs text-dimmed">{{ t('nuxtUiMongocamp.charts.unitLabel') }}</span>
        <USelect
          v-model="unit"
          :items="unitItems"
          size="sm"
          class="w-28"
          :aria-label="t('nuxtUiMongocamp.charts.unitLabel')"
        />
      </div>
    </div>

    <p
      v-if="status === 'loading'"
      class="text-sm text-dimmed"
      role="status"
      data-test="chart-loading"
    >
      {{ t('nuxtUiMongocamp.charts.loading') }}
    </p>

    <UAlert
      v-else-if="status === 'error' && error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('nuxtUiMongocamp.charts.failedTitle')"
      :description="error.message"
      data-test="chart-error"
    >
      <template #actions>
        <UButton
          :label="t('nuxtUiMongocamp.charts.retry')"
          color="error"
          variant="subtle"
          icon="i-lucide-refresh-cw"
          @click="load"
        />
      </template>
    </UAlert>

    <p
      v-else-if="status === 'unsupported'"
      class="text-sm text-dimmed"
      data-test="chart-unsupported"
    >
      {{ t('nuxtUiMongocamp.charts.unsupported', { type: unsupportedType }) }}
    </p>
    <p
      v-else-if="status === 'unknown'"
      class="text-sm text-dimmed"
      data-test="chart-unknown"
    >
      {{ t('nuxtUiMongocamp.charts.unknownField', { field }) }}
    </p>
    <p
      v-else-if="status === 'invalid'"
      class="text-sm text-error"
      data-test="chart-invalid"
    >
      {{ t('nuxtUiMongocamp.charts.invalidField') }}
    </p>
    <p
      v-else-if="status === 'empty'"
      class="text-sm text-dimmed"
      data-test="chart-empty"
    >
      {{ t('nuxtUiMongocamp.charts.empty', { field }) }}
    </p>

    <template v-else>
      <MongocampChart
        :type="chartType"
        :data="points"
        index="label"
        :categories="categories"
        :chart-label="ariaLabel"
        :chart-description="ariaDescription"
        :legend="false"
        :height="260"
      />
      <p
        v-if="note"
        class="text-xs text-dimmed"
        data-test="chart-note"
      >
        {{ note }}
      </p>
    </template>
  </div>
</template>
