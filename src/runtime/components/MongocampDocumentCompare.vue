<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import { compareDocuments, compareText } from '../utils/documentCompare'
import type { CompareStatus } from '../utils/documentCompare'

const props = withDefaults(defineProps<{
  left: unknown
  right: unknown
  leftLabel?: string
  rightLabel?: string
}>(), {
  leftLabel: undefined,
  rightLabel: undefined,
})

// hide the paths both documents agree on
const onlyDifferences = defineModel<boolean>('onlyDifferences', { default: false })

const { t } = useI18n()

const result = computed(() => compareDocuments(props.left, props.right))
const visibleRows = computed(() => onlyDifferences.value ? result.value.rows.filter(r => r.status !== 'same') : result.value.rows)
const identical = computed(() => result.value.rows.every(r => r.status === 'same'))

// a label as well as a colour, so the status never depends on colour alone
const STATUS: Record<CompareStatus, { color: 'neutral' | 'warning' | 'success' | 'error', icon: string, row: string }> = {
  same: { color: 'neutral', icon: 'i-lucide-equal', row: '' },
  changed: { color: 'warning', icon: 'i-lucide-pencil', row: 'bg-warning/10' },
  added: { color: 'success', icon: 'i-lucide-plus', row: 'bg-success/10' },
  removed: { color: 'error', icon: 'i-lucide-minus', row: 'bg-error/10' },
}
const statusLabel = (status: CompareStatus) => t(`nuxtUiMongocamp.documentCompare.status.${status}`)
</script>

<template>
  <div
    class="flex flex-col gap-3"
    data-testid="document-compare"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div
        class="flex flex-wrap gap-2"
        data-testid="compare-summary"
      >
        <UBadge
          v-for="status in (['changed', 'added', 'removed', 'same'] as CompareStatus[])"
          :key="status"
          :color="STATUS[status].color"
          variant="subtle"
          :icon="STATUS[status].icon"
          :label="`${result.counts[status]} ${statusLabel(status)}`"
        />
      </div>
      <USwitch
        v-model="onlyDifferences"
        :label="t('nuxtUiMongocamp.documentCompare.onlyDifferences')"
        data-testid="only-differences"
      />
    </div>

    <UAlert
      v-if="result.truncated"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('nuxtUiMongocamp.documentCompare.truncated')"
    />

    <p
      v-if="identical"
      class="text-sm text-dimmed"
      data-testid="compare-identical"
    >
      {{ t('nuxtUiMongocamp.documentCompare.identical') }}
    </p>

    <div class="overflow-auto max-h-[65vh] rounded border border-default">
      <table class="w-full text-xs">
        <thead class="sticky top-0 bg-elevated text-left">
          <tr>
            <th class="p-2 font-medium">
              {{ t('nuxtUiMongocamp.documentCompare.path') }}
            </th>
            <th class="p-2 font-medium">
              {{ leftLabel ?? t('nuxtUiMongocamp.documentCompare.left') }}
            </th>
            <th class="p-2 font-medium">
              {{ rightLabel ?? t('nuxtUiMongocamp.documentCompare.right') }}
            </th>
            <th class="p-2 font-medium">
              {{ t('nuxtUiMongocamp.documentCompare.state') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="row.path"
            :class="STATUS[row.status].row"
            :data-path="row.path"
            :data-status="row.status"
          >
            <td class="p-2 font-mono align-top break-all">
              {{ row.path || t('nuxtUiMongocamp.documentCompare.root') }}
            </td>
            <td class="p-2 font-mono align-top break-all">
              <template v-if="row.status === 'added'">
                <span class="text-dimmed">—</span>
              </template>
              <template v-else>
                {{ compareText(row.left) }}
                <UBadge
                  v-if="row.typeDiffers"
                  :label="row.leftType"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </template>
            </td>
            <td class="p-2 font-mono align-top break-all">
              <template v-if="row.status === 'removed'">
                <span class="text-dimmed">—</span>
              </template>
              <template v-else>
                {{ compareText(row.right) }}
                <UBadge
                  v-if="row.typeDiffers"
                  :label="row.rightType"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </template>
            </td>
            <td class="p-2 align-top">
              <UBadge
                :color="STATUS[row.status].color"
                variant="subtle"
                :label="statusLabel(row.status)"
              />
            </td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td
              colspan="4"
              class="p-3 text-center text-dimmed"
            >
              {{ t('nuxtUiMongocamp.documentCompare.nothing') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
