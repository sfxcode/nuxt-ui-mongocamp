<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useMongocampError } from '#imports'
import { useMongocampCollectionCopy } from '../composables/useMongocampCollectionCopy'
import type { CopyProgress, CopyResult, IndexCopyResult } from '../composables/useMongocampCollectionCopy'
import type { IndexCopySkipReason } from '../utils/indexCopy'
import { backupName, canCopyCollection, MAX_COLLECTION_NAME_LENGTH, MAX_COPY_DOCUMENTS, validateTargetName } from '../utils/collectionCopy'
import type { BatchInsertFailure } from '../utils/batchInsert'

// Copies the documents of one collection into a NEW collection (the server blocks `$out` / `$merge`, so this is the only
// way). A dialog without trigger: the parent owns `v-model:open`. Grants, the schema and bucket files are never copied,
// indexes only when asked for; the copy is neither atomic nor a snapshot.
const props = defineProps<{
  source: string
  // copy only the documents this Lucene filter matches
  filter?: string
}>()

const emit = defineEmits<{
  // after documents were written (also a partial copy), so a list can reload
  done: [payload: { target: string, copied: number }]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { describeServerError } = useMongocampError()
const { copyCollection, copyIndexes, backupCollection, retryBatches, listCollectionNames, countDocuments, collectionCount } = useMongocampCollectionCopy()

type Step = 'form' | 'running' | 'done'
const step = ref<Step>('form')
const target = ref('')
const existing = ref<string[]>([])
const sourceCount = ref<number | undefined>(undefined)
const countFailed = ref(false)
const progress = ref<CopyProgress>({ phase: 'reading', done: 0, total: 0 })
const result = ref<CopyResult | null>(null)
const failures = ref<Array<{ from: number, to: number, reason: string, mayBePartial: boolean, batch: BatchInsertFailure }>>([])
const totalInserted = ref(0)
const aborted = ref(false)
const skipped = ref(0)
const finalCount = ref<number | undefined>(undefined)
const errorText = ref('')
// the same indexes on the new collection (a backup usually wants them); off = documents only
const withIndexes = ref(true)
const indexResult = ref<IndexCopyResult | null>(null)
const indexesError = ref(false)
const indexFailureReasons = ref<Record<string, string>>({})
let controller: AbortController | undefined
let opened = 0

// Everything is read fresh every time the dialog opens: the list of names and the count change.
watch(isOpen, async (open) => {
  if (!open) {
    controller?.abort()
    return
  }
  const mine = ++opened
  step.value = 'form'
  target.value = ''
  result.value = null
  failures.value = []
  totalInserted.value = 0
  aborted.value = false
  skipped.value = 0
  finalCount.value = undefined
  errorText.value = ''
  indexResult.value = null
  indexesError.value = false
  indexFailureReasons.value = {}
  sourceCount.value = undefined
  countFailed.value = false
  const [names, count] = await Promise.allSettled([listCollectionNames(), countDocuments(props.source, props.filter)])
  if (mine !== opened) return
  existing.value = names.status === 'fulfilled' ? names.value : []
  if (count.status === 'fulfilled') sourceCount.value = count.value
  else countFailed.value = true
}, { immediate: true })

const problem = computed(() => (target.value === '' ? undefined : validateTargetName(target.value, props.source, existing.value)))
const problemText = computed(() => {
  const key = { 'empty': 'problemEmpty', 'too-long': 'problemTooLong', 'invalid-characters': 'problemInvalid', 'protected': 'problemProtected', 'same-as-source': 'problemSame', 'exists': 'problemExists' }[problem.value ?? 'empty']
  return problem.value ? t(`nuxtUiMongocamp.collectionCopy.${key}`, { max: MAX_COLLECTION_NAME_LENGTH }) : ''
})
const tooMany = computed(() => sourceCount.value !== undefined && sourceCount.value > MAX_COPY_DOCUMENTS)
const canStart = computed(() => target.value.trim() !== '' && problem.value === undefined && sourceCount.value !== undefined && !tooMany.value)
const targetName = computed(() => target.value.trim())
// a quick backup needs no name from the user: only the count and the cap matter
const canBackup = computed(() => canCopyCollection(props.source) && sourceCount.value !== undefined && !tooMany.value)
const backupPreview = computed(() => backupName(props.source, existing.value))
const percent = computed(() => (progress.value.total === 0 ? 0 : Math.round((progress.value.done / progress.value.total) * 100)))

async function reasonOf(error: unknown): Promise<string> {
  return (await describeServerError(error, 'nuxtUiMongocamp.collectionCopy.failedGeneric')).message
}

const SKIP_KEYS: Record<IndexCopySkipReason, string> = {
  'multi-field-text': 'skipMultiText',
  'custom-weights': 'skipWeights',
  'unsupported-key': 'skipKeyType',
  'unknown-key-order': 'skipOrder',
}
const skipText = (reason: IndexCopySkipReason) => t(`nuxtUiMongocamp.collectionCopy.${SKIP_KEYS[reason]}`)

async function applyIndexes(indexes: IndexCopyResult | undefined, failedToList: unknown) {
  indexResult.value = indexes ?? null
  indexesError.value = failedToList !== undefined
  indexFailureReasons.value = Object.fromEntries(await Promise.all((indexes?.failed ?? []).map(async f => [f.name, await reasonOf(f.error)] as const)))
}

async function describeFailures(failed: BatchInsertFailure[]) {
  failures.value = await Promise.all(failed.map(async batch => ({
    from: batch.start + 1,
    to: batch.start + batch.count,
    reason: await reasonOf(batch.error),
    mayBePartial: batch.mayBePartial,
    batch,
  })))
}

async function finish(copied: number) {
  step.value = 'done'
  if (copied > 0) {
    emit('done', { target: targetName.value, copied })
    // the new collection is counted by the server, not trusted from what was sent
    try {
      finalCount.value = await collectionCount(targetName.value)
    }
    catch {
      finalCount.value = undefined
    }
  }
}

// `quick`: the name is chosen by `backupCollection` (source name + timestamp) instead of typed
async function start(quick = false) {
  if (quick ? !canBackup.value : !canStart.value) return
  errorText.value = ''
  step.value = 'running'
  progress.value = { phase: 'reading', done: 0, total: sourceCount.value ?? 0 }
  const run = new AbortController()
  controller = run
  try {
    const common = {
      source: props.source,
      filter: props.filter,
      copyIndexes: withIndexes.value,
      signal: run.signal,
      onProgress: (p: CopyProgress) => {
        progress.value = p
      },
    }
    const outcome = quick
      ? await backupCollection({ ...common, onTarget: (name) => { target.value = name } })
      : await copyCollection({ ...common, target: targetName.value })
    if (!isOpen.value) return
    result.value = outcome
    if (outcome.refused === 'target-exists') {
      existing.value = [...existing.value, targetName.value]
      step.value = 'form'
      errorText.value = t('nuxtUiMongocamp.collectionCopy.refusedExists', { target: targetName.value })
      return
    }
    if (outcome.refused === 'too-many-documents') {
      sourceCount.value = outcome.sourceTotal
      step.value = 'form'
      return
    }
    totalInserted.value = outcome.inserted
    aborted.value = outcome.aborted
    skipped.value = outcome.skipped
    await applyIndexes(outcome.indexes, outcome.indexesError)
    await describeFailures(outcome.failedBatches)
    await finish(outcome.inserted)
  }
  catch (e: unknown) {
    if (!isOpen.value) return
    // stopped while reading: nothing was written
    if ((e as { name?: string } | null)?.name === 'AbortError') {
      step.value = 'form'
      return
    }
    errorText.value = await reasonOf(e)
    step.value = 'form'
  }
  finally {
    if (controller === run) controller = undefined
  }
}

async function retry() {
  if (!result.value) return
  const rows = result.value.rows
  const failed = failures.value.map(f => f.batch)
  step.value = 'running'
  progress.value = { phase: 'writing', done: 0, total: failed.reduce((sum, f) => sum + f.count, 0) }
  const run = new AbortController()
  controller = run
  try {
    const again = await retryBatches(targetName.value, rows, failed, { signal: run.signal, onProgress: (p) => {
      progress.value = p
    } })
    if (!isOpen.value) return
    totalInserted.value += again.inserted
    skipped.value = again.skipped
    aborted.value = again.aborted
    // positions in the retry run refer to the failed rows in order; map them back to the original row numbers
    const originals = failed.flatMap(f => Array.from({ length: f.count }, (_, i) => f.start + i))
    failures.value = await Promise.all(again.failedBatches.map(async batch => ({
      from: originals[batch.start]! + 1,
      to: originals[batch.start + batch.count - 1]! + 1,
      reason: await reasonOf(batch.error),
      mayBePartial: batch.mayBePartial,
      batch: { ...batch, start: originals[batch.start]! },
    })))
    // the indexes wait for a copy that is complete
    if (withIndexes.value && failures.value.length === 0 && !aborted.value && !indexResult.value) {
      try {
        await applyIndexes(await copyIndexes(props.source, targetName.value), undefined)
      }
      catch (e: unknown) {
        await applyIndexes(undefined, e)
      }
    }
    await finish(totalInserted.value)
  }
  finally {
    if (controller === run) controller = undefined
  }
}

function stop() {
  controller?.abort()
}

const anyMayBePartial = computed(() => failures.value.some(f => f.mayBePartial))
const failedCount = computed(() => failures.value.reduce((sum, f) => sum + (f.to - f.from + 1), 0))
const complete = computed(() => step.value === 'done' && failures.value.length === 0 && !aborted.value && totalInserted.value > 0)
const indexesPending = computed(() => withIndexes.value && failures.value.length > 0 && !indexResult.value && !indexesError.value)
const sourceTotal = computed(() => result.value?.sourceTotal ?? sourceCount.value ?? 0)
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="filter ? t('nuxtUiMongocamp.collectionCopy.titleFiltered', { source }) : t('nuxtUiMongocamp.collectionCopy.title', { source })"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div
        v-if="step === 'form'"
        class="flex flex-col gap-4"
      >
        <p class="text-sm text-dimmed">
          {{ t('nuxtUiMongocamp.collectionCopy.intro') }}
        </p>
        <UFormField
          :label="t('nuxtUiMongocamp.collectionCopy.targetLabel')"
          :help="t('nuxtUiMongocamp.collectionCopy.targetHelp')"
          :error="problemText || undefined"
        >
          <UInput
            v-model="target"
            class="w-full"
            autocomplete="off"
            :placeholder="t('nuxtUiMongocamp.collectionCopy.targetPlaceholder')"
            :aria-label="t('nuxtUiMongocamp.collectionCopy.targetLabel')"
            @keydown.enter.prevent="start()"
          />
        </UFormField>
        <p
          v-if="sourceCount !== undefined && !tooMany"
          class="text-sm"
          data-test="copy-count"
        >
          {{ t(filter ? 'nuxtUiMongocamp.collectionCopy.countFiltered' : 'nuxtUiMongocamp.collectionCopy.count', { count: sourceCount }, sourceCount) }}
        </p>
        <p
          v-else-if="!tooMany && !countFailed"
          class="text-sm text-dimmed"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.countLoading') }}
        </p>
        <p
          v-if="countFailed"
          class="text-sm text-error"
          role="alert"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.countFailed') }}
        </p>
        <p
          v-if="tooMany"
          class="text-sm text-error"
          role="alert"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.tooMany', { count: sourceCount, cap: MAX_COPY_DOCUMENTS }) }}
        </p>
        <UCheckbox
          v-model="withIndexes"
          :label="t('nuxtUiMongocamp.collectionCopy.withIndexes')"
          :description="t('nuxtUiMongocamp.collectionCopy.withIndexesHelp')"
        />
        <p
          v-if="errorText"
          class="text-sm text-error"
          role="alert"
        >
          {{ errorText }}
        </p>
      </div>

      <div
        v-else-if="step === 'running'"
        class="flex flex-col gap-2"
        role="status"
        data-test="copy-progress"
      >
        <UProgress
          :model-value="percent"
          :max="100"
        />
        <span class="text-sm text-dimmed">{{ t(`nuxtUiMongocamp.collectionCopy.${progress.phase}`, { done: progress.done, total: progress.total }) }}</span>
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
        data-test="copy-result"
      >
        <UAlert
          v-if="complete"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="t('nuxtUiMongocamp.collectionCopy.doneTitle', { count: totalInserted, target: targetName }, totalInserted)"
        />
        <UAlert
          v-else-if="aborted"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('nuxtUiMongocamp.collectionCopy.stopped', { done: totalInserted, total: sourceTotal, skipped, target: targetName })"
        />
        <UAlert
          v-else-if="failures.length > 0"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('nuxtUiMongocamp.collectionCopy.failedTitle', { failed: failedCount, total: sourceTotal })"
        >
          <template #description>
            <p
              v-for="failure in failures"
              :key="failure.from"
              class="text-sm"
            >
              {{ t('nuxtUiMongocamp.collectionCopy.failedRange', { from: failure.from, to: failure.to, reason: failure.reason }) }}
            </p>
            <p class="mt-1 text-sm">
              {{ t('nuxtUiMongocamp.collectionCopy.incomplete', { target: targetName }) }}
            </p>
            <p
              v-if="anyMayBePartial"
              class="mt-1 text-sm"
            >
              {{ t('nuxtUiMongocamp.collectionCopy.maybePartial') }}
            </p>
          </template>
        </UAlert>
        <p
          v-else
          class="text-sm"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.doneTitle', { count: 0, target: targetName }, 0) }}
        </p>
        <div
          v-if="indexResult"
          class="flex flex-col gap-1 text-sm"
          data-test="copy-indexes"
        >
          <p v-if="indexResult.copied.length > 0 || (indexResult.skipped.length === 0 && indexResult.failed.length === 0)">
            {{ indexResult.copied.length > 0 ? t('nuxtUiMongocamp.collectionCopy.indexesCopied', { count: indexResult.copied.length }) : t('nuxtUiMongocamp.collectionCopy.indexesNone') }}
          </p>
          <p
            v-for="item in indexResult.skipped"
            :key="`s-${item.name}`"
            class="text-warning"
          >
            {{ t('nuxtUiMongocamp.collectionCopy.indexSkipped', { name: item.name, reason: skipText(item.reason) }) }}
          </p>
          <p
            v-for="item in indexResult.failed"
            :key="`f-${item.name}`"
            class="text-error"
          >
            {{ t('nuxtUiMongocamp.collectionCopy.indexFailed', { name: item.name, reason: indexFailureReasons[item.name] ?? '' }) }}
          </p>
        </div>
        <p
          v-else-if="indexesError"
          class="text-sm text-error"
          role="alert"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.indexesError') }}
        </p>
        <p
          v-else-if="indexesPending"
          class="text-sm text-dimmed"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.indexesPending') }}
        </p>
        <p
          v-if="finalCount !== undefined && finalCount === totalInserted"
          class="text-sm text-dimmed"
          data-test="copy-verified"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.verified', { count: finalCount }) }}
        </p>
        <p
          v-else-if="finalCount !== undefined"
          class="text-sm text-warning"
          role="alert"
          data-test="copy-mismatch"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.verifyMismatch', { actual: finalCount, expected: totalInserted }) }}
        </p>
        <p
          v-if="result?.totalChanged"
          class="text-sm text-warning"
        >
          {{ t('nuxtUiMongocamp.collectionCopy.changed') }}
        </p>
      </div>
    </template>

    <template #footer>
      <template v-if="step === 'running'">
        <UButton
          :label="t('nuxtUiMongocamp.collectionCopy.stop')"
          color="neutral"
          variant="soft"
          @click="stop"
        />
      </template>
      <template v-else-if="step === 'done'">
        <UButton
          v-if="failures.length > 0 && !aborted"
          :label="t('nuxtUiMongocamp.collectionCopy.retry')"
          icon="i-lucide-rotate-cw"
          @click="retry"
        />
        <UButton
          :label="t('nuxtUiMongocamp.collectionCopy.close')"
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
          :label="t('nuxtUiMongocamp.collectionCopy.quickBackup')"
          icon="i-lucide-archive"
          color="neutral"
          variant="soft"
          :disabled="!canBackup"
          :title="t('nuxtUiMongocamp.collectionCopy.quickBackupHint', { name: backupPreview })"
          data-test="quick-backup"
          @click="start(true)"
        />
        <UButton
          :label="t('nuxtUiMongocamp.collectionCopy.start')"
          icon="i-lucide-copy"
          :disabled="!canStart"
          @click="start()"
        />
      </template>
    </template>
  </UModal>
</template>
