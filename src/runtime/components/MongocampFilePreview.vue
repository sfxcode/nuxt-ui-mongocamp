<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { FileInformation } from '@sfxcode/nuxt-mongocamp-server'
import { useI18n } from '#imports'
import { useMongocampBucket } from '../composables/useMongocampBucket'
import { useMongocampError } from '../composables/useMongocampError'
import { canPreview, clipText, PREVIEW_LIMITS, prettyJson, previewKind } from '../utils/filePreview'
import { formatBytes } from '../utils/formatBytes'

const props = defineProps<{
  bucketName: string
  file?: FileInformation
}>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { fetchFileBlob, downloadFile, downloadingFileIds } = useMongocampBucket()
const { describeError } = useMongocampError()

const loading = ref(false)
const error = ref('')
const objectUrl = ref('')
const text = ref('')
const clipped = ref(false)
let generation = 0

const kind = computed(() => props.file ? previewKind(props.file.filename) : 'other')
const tooLarge = computed(() => !!props.file && kind.value !== 'other' && !canPreview(kind.value, props.file.length))
const limitLabel = computed(() => kind.value === 'other' ? '' : formatBytes(PREVIEW_LIMITS[kind.value]))

function release() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
  text.value = ''
  clipped.value = false
  error.value = ''
}

async function load() {
  const current = ++generation
  release()
  const file = props.file
  if (!open.value || !file || kind.value === 'other' || tooLarge.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const blob = await fetchFileBlob(props.bucketName, file.id)
    if (current !== generation) return
    if (kind.value === 'image' || kind.value === 'pdf') {
      objectUrl.value = URL.createObjectURL(blob)
    }
    else {
      const raw = await blob.text()
      if (current !== generation) return
      const result = clipText(kind.value === 'json' ? prettyJson(raw) : raw)
      text.value = result.text
      clipped.value = result.clipped
    }
  }
  catch (e) {
    if (current === generation) error.value = describeError(e).message
  }
  finally {
    if (current === generation) loading.value = false
  }
}

watch([open, () => props.file?.id, () => props.bucketName], load, { immediate: true })

onBeforeUnmount(() => {
  generation++
  release()
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="file?.filename ?? t('nuxtUiMongocamp.filePreview.title')"
    :description="file ? formatBytes(file.length) : undefined"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div
        v-if="file"
        class="flex flex-col gap-4"
        data-testid="file-preview"
      >
        <div
          v-if="loading"
          class="flex items-center gap-2 text-sm text-dimmed"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="animate-spin"
          />
          {{ t('nuxtUiMongocamp.filePreview.loading') }}
        </div>

        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('nuxtUiMongocamp.filePreview.failed')"
          :description="error"
        />

        <UAlert
          v-else-if="kind === 'other'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-file"
          :title="t('nuxtUiMongocamp.filePreview.noPreview')"
        />

        <UAlert
          v-else-if="tooLarge"
          color="neutral"
          variant="subtle"
          icon="i-lucide-file-warning"
          :title="t('nuxtUiMongocamp.filePreview.tooLarge', { max: limitLabel })"
        />

        <img
          v-else-if="kind === 'image' && objectUrl"
          :src="objectUrl"
          :alt="file.filename"
          class="max-w-full max-h-[70vh] object-contain mx-auto rounded"
        >

        <iframe
          v-else-if="kind === 'pdf' && objectUrl"
          :src="objectUrl"
          :title="file.filename"
          sandbox=""
          class="w-full h-[70vh] rounded border border-default"
        />

        <template v-else-if="text">
          <pre class="text-xs overflow-auto max-h-[70vh] whitespace-pre-wrap break-all rounded bg-elevated p-3">{{ text }}</pre>
          <p
            v-if="clipped"
            class="text-xs text-dimmed"
          >
            {{ t('nuxtUiMongocamp.filePreview.clipped') }}
          </p>
        </template>

        <div class="flex justify-end">
          <UButton
            icon="i-lucide-download"
            color="neutral"
            variant="subtle"
            :label="t('nuxtUiMongocamp.filePreview.download')"
            :loading="downloadingFileIds.has(file.id)"
            @click="downloadFile(bucketName, file.id)"
          />
        </div>

        <div v-if="Object.keys(file.metadata ?? {}).length">
          <h4 class="text-sm font-medium mb-1">
            {{ t('nuxtUiMongocamp.bucketFiles.columnMetadata') }}
          </h4>
          <pre class="text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all rounded bg-elevated p-3">{{ JSON.stringify(file.metadata, null, 2) }}</pre>
        </div>
      </div>
    </template>
  </USlideover>
</template>
