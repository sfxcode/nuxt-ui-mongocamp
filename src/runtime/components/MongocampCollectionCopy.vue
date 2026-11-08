<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useMongocampError } from '#imports'
import { useMongocampCollectionCopy } from '../composables/useMongocampCollectionCopy'
import type { CopyResult } from '../composables/useMongocampCollectionCopy'
import { backupName, canCopyCollection, MAX_COLLECTION_NAME_LENGTH, validateTargetName } from '../utils/collectionCopy'

// Copies the documents of one collection into a NEW collection, **inside the database** (server 1.8.1, one request: no cap,
// nothing is held in the browser). A dialog without trigger: the parent owns `v-model:open`. Grants, the schema and bucket
// files are never copied; indexes only when asked for (the server recreates them from the real index specifications).
const props = defineProps<{
  source: string
  // copy only the documents this Lucene filter matches
  filter?: string
}>()

const emit = defineEmits<{
  // after the new collection exists, so a list can reload
  done: [payload: { target: string, copied: number }]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { describeServerError } = useMongocampError()
const { copyCollection, backupCollection, listCollectionNames, countDocuments } = useMongocampCollectionCopy()

type Step = 'form' | 'running' | 'done'
const step = ref<Step>('form')
const target = ref('')
const existing = ref<string[]>([])
const sourceCount = ref<number | undefined>(undefined)
const countFailed = ref(false)
const result = ref<CopyResult | null>(null)
const errorText = ref('')
// the same indexes on the new collection (a backup usually wants them); off = documents only
const withIndexes = ref(true)
let opened = 0

// Everything is read fresh every time the dialog opens: the list of names and the count change.
watch(isOpen, async (open) => {
  if (!open) return
  const mine = ++opened
  step.value = 'form'
  target.value = ''
  result.value = null
  errorText.value = ''
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
const targetName = computed(() => target.value.trim())
const canStart = computed(() => targetName.value !== '' && problem.value === undefined)
// a quick backup needs no name from the user
const canBackup = computed(() => canCopyCollection(props.source))
const backupPreview = computed(() => backupName(props.source, existing.value))

async function reasonOf(error: unknown): Promise<string> {
  return (await describeServerError(error, 'nuxtUiMongocamp.collectionCopy.failedGeneric')).message
}

// `quick`: the name is chosen by `backupCollection` (source name + timestamp) instead of typed
async function start(quick = false) {
  if (quick ? !canBackup.value : !canStart.value) return
  errorText.value = ''
  step.value = 'running'
  try {
    const common = { source: props.source, filter: props.filter, withIndexes: withIndexes.value }
    const outcome = quick
      ? await backupCollection({ ...common, onTarget: (name) => { target.value = name } })
      : await copyCollection({ ...common, target: targetName.value })
    result.value = outcome
    if (outcome.refused === 'target-exists') {
      existing.value = [...existing.value, outcome.target]
      step.value = 'form'
      errorText.value = t('nuxtUiMongocamp.collectionCopy.refusedExists', { target: outcome.target })
      return
    }
    step.value = 'done'
    // also when the dialog was closed meanwhile: the collection exists, a list must show it
    emit('done', { target: outcome.target, copied: outcome.count })
  }
  catch (e: unknown) {
    errorText.value = await reasonOf(e)
    step.value = 'form'
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="filter ? t('nuxtUiMongocamp.collectionCopy.titleFiltered', { source }) : t('nuxtUiMongocamp.collectionCopy.title', { source })"
    :dismissible="step !== 'running'"
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
          v-if="sourceCount !== undefined"
          class="text-sm"
          data-test="copy-count"
        >
          {{ t(filter ? 'nuxtUiMongocamp.collectionCopy.countFiltered' : 'nuxtUiMongocamp.collectionCopy.count', { count: sourceCount }, sourceCount) }}
        </p>
        <p
          v-else-if="!countFailed"
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
        <UProgress />
        <span class="text-sm text-dimmed">{{ t('nuxtUiMongocamp.collectionCopy.running', { source, count: sourceCount ?? 0 }, sourceCount ?? 0) }}</span>
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
        data-test="copy-result"
      >
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="t('nuxtUiMongocamp.collectionCopy.doneTitle', { count: result?.count ?? 0, target: result?.target ?? targetName }, result?.count ?? 0)"
        />
        <p
          v-if="withIndexes"
          class="text-sm"
          data-test="copy-indexes"
        >
          {{ (result?.indexes ?? 0) > 0 ? t('nuxtUiMongocamp.collectionCopy.indexesCopied', { count: result?.indexes ?? 0 }) : t('nuxtUiMongocamp.collectionCopy.indexesNone') }}
        </p>
      </div>
    </template>

    <template #footer>
      <template v-if="step === 'running'" />
      <template v-else-if="step === 'done'">
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
