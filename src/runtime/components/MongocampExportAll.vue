<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useMongocampError } from '#imports'
import { useMongocampExportAll } from '../composables/useMongocampExportAll'
import type { ExportResult } from '../composables/useMongocampExportAll'
import { DEFAULT_EXPORT_MAX_ROWS } from '../utils/exportDocuments'
import type { ExportFormat } from '../utils/exportDocuments'

// Exports every document of a collection — or every one a filter matches — as JSON, NDJSON or CSV, not only the page on
// screen. A dialog without trigger: the parent owns `v-model:open`. Reading shows progress and can be cancelled (then
// nothing is downloaded); a file cut at the cap says so.
const props = defineProps<{
  collection: string
  // Lucene filter, sort and fields of the list the user is looking at
  filter?: string
  sort?: string[]
  projection?: string[]
  // how many documents match, when the parent knows (shown before the export starts)
  total?: number
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { describeServerError } = useMongocampError()
const { exportCollection } = useMongocampExportAll()

type Step = 'form' | 'running' | 'done'
const step = ref<Step>('form')
const format = ref<ExportFormat>('json')
const progress = ref({ loaded: 0, target: 0 })
const result = ref<ExportResult | null>(null)
const cancelled = ref(false)
const errorText = ref('')
let controller: AbortController | undefined

watch(isOpen, (open) => {
  if (!open) {
    controller?.abort()
    return
  }
  step.value = 'form'
  result.value = null
  cancelled.value = false
  errorText.value = ''
})

const formatItems = computed(() => [
  { label: t('nuxtUiMongocamp.exportAll.formatJson'), value: 'json' },
  { label: t('nuxtUiMongocamp.exportAll.formatNdjson'), value: 'ndjson' },
  { label: t('nuxtUiMongocamp.exportAll.formatCsv'), value: 'csv' },
])
const percent = computed(() => (progress.value.target === 0 ? 0 : Math.round((progress.value.loaded / progress.value.target) * 100)))

async function start() {
  errorText.value = ''
  cancelled.value = false
  result.value = null
  step.value = 'running'
  progress.value = { loaded: 0, target: props.total ?? 0 }
  const run = new AbortController()
  controller = run
  try {
    result.value = await exportCollection({
      collection: props.collection,
      format: format.value,
      filter: props.filter,
      sort: props.sort?.length ? props.sort : undefined,
      projection: props.projection?.length ? props.projection : undefined,
      signal: run.signal,
      onProgress: (p) => {
        progress.value = { loaded: p.loaded, target: p.target ?? p.total ?? p.loaded }
      },
    })
    step.value = 'done'
  }
  catch (e: unknown) {
    if (!isOpen.value) return
    if ((e as { name?: string } | null)?.name === 'AbortError') cancelled.value = true
    else errorText.value = (await describeServerError(e, 'nuxtUiMongocamp.exportAll.failed')).message
    step.value = 'done'
  }
  finally {
    if (controller === run) controller = undefined
  }
}

function cancel() {
  controller?.abort()
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="t('nuxtUiMongocamp.exportAll.title')"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div
        v-if="step === 'form'"
        class="flex flex-col gap-4"
      >
        <p class="text-sm text-dimmed">
          {{ t('nuxtUiMongocamp.exportAll.intro') }}
        </p>
        <p
          class="text-sm"
          data-test="export-scope"
        >
          {{ filter ? t('nuxtUiMongocamp.exportAll.scopeFiltered', { collection }) : t('nuxtUiMongocamp.exportAll.scopeAll', { collection }) }}
          <template v-if="total !== undefined">
            ({{ t('nuxtUiMongocamp.exportAll.count', { count: total }, total) }})
          </template>
        </p>
        <UFormField :label="t('nuxtUiMongocamp.exportAll.formatLabel')">
          <USelect
            v-model="format"
            :items="formatItems"
            class="w-full"
            :aria-label="t('nuxtUiMongocamp.exportAll.formatLabel')"
          />
        </UFormField>
        <p class="text-xs text-dimmed">
          {{ t('nuxtUiMongocamp.exportAll.cap', { cap: DEFAULT_EXPORT_MAX_ROWS }) }}
        </p>
      </div>

      <div
        v-else-if="step === 'running'"
        class="flex flex-col gap-2"
        role="status"
        data-test="export-progress"
      >
        <UProgress
          :model-value="percent"
          :max="100"
        />
        <span class="text-sm text-dimmed">{{ t('nuxtUiMongocamp.exportAll.reading', { done: progress.loaded, total: progress.target }) }}</span>
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
        data-test="export-result"
      >
        <p
          v-if="cancelled"
          class="text-sm"
        >
          {{ t('nuxtUiMongocamp.exportAll.cancelled') }}
        </p>
        <p
          v-else-if="errorText"
          class="text-sm text-error"
          role="alert"
        >
          {{ errorText }}
        </p>
        <template v-else-if="result">
          <UAlert
            v-if="result.truncated"
            color="warning"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('nuxtUiMongocamp.exportAll.truncated', { count: result.rowCount, total: result.total ?? result.rowCount })"
          />
          <UAlert
            v-else
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="t('nuxtUiMongocamp.exportAll.done', { count: result.rowCount, file: result.filename }, result.rowCount)"
          />
          <p
            v-if="result.truncated"
            class="text-sm text-dimmed"
          >
            {{ t('nuxtUiMongocamp.exportAll.done', { count: result.rowCount, file: result.filename }, result.rowCount) }}
          </p>
          <p
            v-if="result.totalChanged"
            class="text-sm text-warning"
          >
            {{ t('nuxtUiMongocamp.exportAll.changed') }}
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <UButton
        v-if="step === 'running'"
        :label="t('nuxtUiMongocamp.exportAll.stop')"
        color="neutral"
        variant="soft"
        @click="cancel"
      />
      <template v-else-if="step === 'done'">
        <UButton
          :label="t('nuxtUiMongocamp.exportAll.close')"
          color="neutral"
          variant="ghost"
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
        <UButton
          :label="t('nuxtUiMongocamp.exportAll.start')"
          icon="i-lucide-download"
          @click="start"
        />
      </template>
    </template>
  </UModal>
</template>
