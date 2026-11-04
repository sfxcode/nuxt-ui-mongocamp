<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '#imports'

// Nuxt UI's `UChart` with what every chart of this module needs, so no chart repeats it:
// - series colours with a fallback: Nuxt UI's stylesheet defines `--ui-chart-1…6`, an app that gets the theme another way
//   (the UnoCSS preset, see canstand/unocss-nuxt-ui#2) does not, and the bars would have no colour;
// - `ui.base = 'opacity-100'`: UChart hides itself with the Tailwind-v4-only variant `in-data-measured:opacity-100`, which the
//   UnoCSS preset never generates, so it would stay invisible (`opacity-100` wins over `opacity-0` when the classes merge);
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

// six series colours; the first is the theme's primary colour
const FALLBACK_COLORS = ['var(--ui-primary, #16a34a)', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4']
const COLORS = FALLBACK_COLORS.map((fallback, i) => `var(--ui-chart-${i + 1}, ${fallback})`)
const CHART_UI = { base: 'opacity-100' }

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
        :data="data"
        :index="index"
        :categories="categories"
        :colors="COLORS"
        :ui="CHART_UI"
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
