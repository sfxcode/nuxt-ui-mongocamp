<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useMongocampError } from '#imports'
import { useMongocampCollectionCopy } from '../composables/useMongocampCollectionCopy'
import { MAX_COLLECTION_NAME_LENGTH, validateTargetName } from '../utils/collectionCopy'

// Renames a collection inside the database (server 1.8.1): documents and indexes stay, the name changes. A dialog without
// trigger: the parent owns `v-model:open`. Grants are matched by NAME, so a grant for the old name stops applying and none
// exists for the new one — the dialog says so before it renames.
const props = defineProps<{
  source: string
}>()

const emit = defineEmits<{
  // after the collection was renamed, so a list can reload
  done: [payload: { source: string, target: string }]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { describeServerError } = useMongocampError()
const { renameCollection, listCollectionNames } = useMongocampCollectionCopy()

const target = ref('')
const existing = ref<string[]>([])
const renaming = ref(false)
const errorText = ref('')
let opened = 0

// the names are read fresh every time the dialog opens
watch(isOpen, async (open) => {
  if (!open) return
  const mine = ++opened
  target.value = ''
  errorText.value = ''
  renaming.value = false
  try {
    const names = await listCollectionNames()
    if (mine === opened) existing.value = names
  }
  catch {
    if (mine === opened) existing.value = []
  }
}, { immediate: true })

const problem = computed(() => (target.value === '' ? undefined : validateTargetName(target.value, props.source, existing.value)))
const problemText = computed(() => {
  const key = { 'empty': 'problemEmpty', 'too-long': 'problemTooLong', 'invalid-characters': 'problemInvalid', 'protected': 'problemProtected', 'same-as-source': 'problemSame', 'exists': 'problemExists' }[problem.value ?? 'empty']
  return problem.value ? t(`nuxtUiMongocamp.collectionCopy.${key}`, { max: MAX_COLLECTION_NAME_LENGTH }) : ''
})
const targetName = computed(() => target.value.trim())
const canRename = computed(() => targetName.value !== '' && problem.value === undefined && !renaming.value)

async function rename() {
  if (!canRename.value) return
  renaming.value = true
  errorText.value = ''
  try {
    const result = await renameCollection(props.source, targetName.value)
    if (result.refused === 'target-exists') {
      existing.value = [...existing.value, targetName.value]
      errorText.value = t('nuxtUiMongocamp.collectionRename.refusedExists', { target: targetName.value })
      return
    }
    emit('done', { source: props.source, target: result.target })
    isOpen.value = false
  }
  catch (e: unknown) {
    errorText.value = (await describeServerError(e, 'nuxtUiMongocamp.collectionRename.failedGeneric')).message
  }
  finally {
    renaming.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="t('nuxtUiMongocamp.collectionRename.title', { source })"
    :dismissible="!renaming"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('nuxtUiMongocamp.collectionRename.grantsWarning')"
          data-test="rename-grants-warning"
        />
        <UFormField
          :label="t('nuxtUiMongocamp.collectionRename.targetLabel')"
          :help="t('nuxtUiMongocamp.collectionCopy.targetHelp')"
          :error="problemText || undefined"
        >
          <UInput
            v-model="target"
            class="w-full"
            autocomplete="off"
            :disabled="renaming"
            :aria-label="t('nuxtUiMongocamp.collectionRename.targetLabel')"
            @keydown.enter.prevent="rename"
          />
        </UFormField>
        <p
          v-if="errorText"
          class="text-sm text-error"
          role="alert"
        >
          {{ errorText }}
        </p>
      </div>
    </template>
    <template #footer>
      <UButton
        :label="t('nuxtUiMongocamp.common.cancel')"
        color="neutral"
        variant="ghost"
        :disabled="renaming"
        @click="isOpen = false"
      />
      <UButton
        :label="t('nuxtUiMongocamp.collectionRename.confirm')"
        icon="i-lucide-pencil"
        :loading="renaming"
        :disabled="!canRename"
        @click="rename"
      />
    </template>
  </UModal>
</template>
