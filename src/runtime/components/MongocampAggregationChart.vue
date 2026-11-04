<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { resultColumns } from '../utils/aggregationResult'
import { buildResultChart, LABEL_KEY, MAX_CHART_ROWS, MAX_SERIES, valueColumns } from '../utils/resultChart'
import type { ResultChartKind } from '../utils/resultChart'

// Charts the rows an aggregation page already holds — no request. The label and number columns are chosen
// automatically and can be changed.
const props = defineProps<{
  rows: Record<string, unknown>[]
}>()

const { t } = useI18n()

const columns = computed(() => resultColumns(props.rows))
const labelKey = ref<string | undefined>(undefined)
const valueKeys = ref<string[]>([])
const kind = ref<ResultChartKind | undefined>(undefined)

// a new result starts over with the automatic choice
watch(() => props.rows, () => {
  labelKey.value = undefined
  valueKeys.value = []
  kind.value = undefined
})

const chart = computed(() => buildResultChart(props.rows, columns.value, { labelKey: labelKey.value, valueKeys: valueKeys.value, kind: kind.value }))
const numberColumns = computed(() => valueColumns(props.rows, columns.value, chart.value?.labelKey))
const kinds = computed(() => (['bar', 'area', 'donut'] as ResultChartKind[]).map(value => ({ value, label: t(`nuxtUiMongocamp.aggregationChart.kind.${value}`) })))
const categories = computed(() => (chart.value?.valueKeys ?? []).map(key => ({ key, label: key })))
</script>

<template>
  <div
    class="flex flex-col gap-3"
    data-testid="aggregation-chart"
  >
    <UAlert
      v-if="!chart"
      color="neutral"
      variant="subtle"
      icon="i-lucide-chart-no-axes-column"
      :title="t('nuxtUiMongocamp.aggregationChart.nothing')"
      data-testid="chart-nothing"
    />
    <template v-else>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('nuxtUiMongocamp.aggregationChart.labelColumn')">
          <USelect
            :model-value="chart.labelKey"
            :items="columns"
            size="sm"
            class="w-40"
            @update:model-value="labelKey = $event; valueKeys = []"
          />
        </UFormField>
        <UFormField :label="t('nuxtUiMongocamp.aggregationChart.valueColumns', { max: MAX_SERIES })">
          <USelect
            :model-value="chart.valueKeys"
            :items="numberColumns"
            multiple
            size="sm"
            class="w-48"
            @update:model-value="valueKeys = $event"
          />
        </UFormField>
        <UFormField :label="t('nuxtUiMongocamp.aggregationChart.type')">
          <USelect
            :model-value="chart.kind"
            :items="kinds"
            size="sm"
            class="w-28"
            @update:model-value="kind = $event"
          />
        </UFormField>
      </div>
      <MongocampChart
        :type="chart.kind"
        :data="chart.data"
        :index="LABEL_KEY"
        :categories="categories"
        :index-label="chart.labelKey"
        :chart-label="t('nuxtUiMongocamp.aggregationChart.ariaLabel', { values: chart.valueKeys.join(', '), label: chart.labelKey })"
        :chart-description="t('nuxtUiMongocamp.aggregationChart.ariaDescription', { count: chart.data.length })"
      />
      <p
        v-if="chart.cut || chart.skipped"
        class="text-xs text-dimmed"
        data-testid="chart-note"
      >
        <template v-if="chart.cut">
          {{ t('nuxtUiMongocamp.aggregationChart.cut', { max: MAX_CHART_ROWS }) }}
        </template>
        <template v-if="chart.skipped">
          {{ t('nuxtUiMongocamp.aggregationChart.skipped', { count: chart.skipped }) }}
        </template>
      </p>
    </template>
  </div>
</template>
