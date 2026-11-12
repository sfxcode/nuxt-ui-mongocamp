<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '#imports'
import { shortenLabel } from '../utils/chartData'

// Nuxt UI's `UChart` with what every chart of this module needs, so no chart repeats it:
// - the accessible text: an `aria-label`, an `aria-description` and a collapsible table with the same numbers, so nothing
//   depends on seeing the chart. Colour never carries meaning alone: bars are labelled on the axis, donut slices in the table.
const props = withDefaults(defineProps<{
  type?: 'bar' | 'area' | 'line' | 'donut'
  // one object per bar / point / slice
  data: Record<string, unknown>[]
  // the key of the label (the x axis; the slice name of a donut)
  index: string
  // the numeric keys drawn (several = several series; a donut uses the first)
  categories: { key: string, label: string }[]
  // the chart's accessible name and description (they become `aria-label` / `aria-description` of the chart)
  chartLabel: string
  chartDescription?: string
  // header of the label column in the data table
  indexLabel?: string
  // how a number is shown on the axis, in the tooltip and in the table (default: the app locale's number format)
  format?: (value: number) => string
  height?: number
  // the collapsible data table (default on); switch it off where a list next to the chart already shows the numbers
  showTable?: boolean
  legend?: boolean
  // shown instead of the chart when there is no data
  emptyText?: string
}>(), {
  type: 'bar',
  chartDescription: undefined,
  indexLabel: undefined,
  format: undefined,
  height: 260,
  showTable: true,
  legend: undefined,
  emptyText: undefined,
})

const { t } = useI18n()

// The chart library is a separate chunk (`LazyUChart`) and is only fetched once the chart is actually on screen — a chart in a
// closed <details> or below the fold costs nothing. Without IntersectionObserver (tests, very old browsers) it renders at once.
const root = ref<HTMLElement | null>(null)
const visible = ref(typeof IntersectionObserver === 'undefined')
let observer: IntersectionObserver | undefined
onMounted(() => {
  if (visible.value || !root.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) {
      visible.value = true
      observer?.disconnect()
    }
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

// six series colours from the theme (`--ui-chart-1…6`, the first is the primary colour; unocss-nuxt-ui >= 1.3.0 defines them)
const COLORS = Array.from({ length: 6 }, (_, i) => `var(--ui-chart-${i + 1})`)

// Axis labels are cut to 18 characters: a long name makes the axis drop its neighbours' labels (a bar without a name).
// Two names that would collapse into one keep their full text — a category must stay unique. The data table below uses the real names.
const AXIS_LABEL_MAX = 18
const chartData = computed(() => {
  if (props.type === 'donut') return props.data
  const names = props.data.map(row => String(row[props.index] ?? ''))
  const short = names.map(name => shortenLabel(name, AXIS_LABEL_MAX))
  const counts = new Map<string, number>()
  for (const name of short) counts.set(name, (counts.get(name) ?? 0) + 1)
  return props.data.map((row, i) => ({ ...row, [props.index]: counts.get(short[i]!)! > 1 ? names[i] : short[i] }))
})

const columns = computed(() => (props.type === 'donut' ? props.categories.slice(0, 1) : props.categories))
const show = (value: unknown): string => (typeof value === 'number' && props.format ? props.format(value) : String(value ?? ''))
</script>

<template>
  <div
    ref="root"
    class="flex flex-col gap-2"
  >
    <p
      v-if="data.length === 0 && emptyText"
      class="text-sm text-dimmed"
      data-test="chart-empty-text"
    >
      {{ emptyText }}
    </p>
    <template v-else-if="data.length > 0">
      <LazyUChart
        v-if="visible"
        :type="type"
        :data="chartData"
        :index="index"
        :categories="categories"
        :colors="COLORS"
        :aria-label="chartLabel"
        :aria-description="chartDescription"
        :format="format"
        :legend="legend ?? (type === 'donut' || categories.length > 1)"
        :height="height"
        :points="false"
      />
      <div
        v-else
        :style="{ height: `${height}px` }"
        aria-hidden="true"
      />
      <details
        v-if="showTable"
        class="text-sm"
      >
        <summary class="cursor-pointer text-dimmed">
          {{ t('nuxtUiMongocamp.charts.showData') }}
        </summary>
        <table
          class="mt-2 w-full text-left text-xs"
          data-test="chart-table"
        >
          <thead>
            <tr>
              <th class="pr-3 font-medium">
                {{ indexLabel ?? t('nuxtUiMongocamp.charts.columnValue') }}
              </th>
              <th
                v-for="column in columns"
                :key="column.key"
                class="pr-3 font-medium"
              >
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in data"
              :key="rowIndex"
            >
              <td class="pr-3 font-mono">
                {{ String(row[index] ?? '') }}
              </td>
              <td
                v-for="column in columns"
                :key="column.key"
                class="pr-3"
              >
                {{ show(row[column.key]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </div>
</template>
