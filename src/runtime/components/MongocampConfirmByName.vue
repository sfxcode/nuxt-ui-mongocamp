<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useMongocampError } from '#imports'

const props = withDefaults(defineProps<{
  // the exact text the user has to type, e.g. the collection name
  name: string
  title: string
  description: string
  confirmLabel: string
  confirmColor?: 'error' | 'warning'
  confirmIcon?: string
  onConfirm: () => Promise<void>
}>(), {
  confirmColor: 'error',
  confirmIcon: 'i-lucide-trash-2',
})

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { describeError } = useMongocampError()

const typed = ref('')
const busy = ref(false)
const error = ref('')

// Surrounding whitespace from a copy/paste is forgiven; case is not.
const matches = computed(() => props.name !== '' && typed.value.trim() === props.name)

// Every opening starts from a blank field and no stale error.
watch(open, (isOpen) => {
  if (!isOpen) return
  typed.value = ''
  error.value = ''
})

function close() {
  open.value = false
}

// A failed action keeps the modal open with the reason so the user can retry or cancel.
async function handleConfirm() {
  if (!matches.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await props.onConfirm()
    close()
  }
  catch (e: unknown) {
    error.value = describeError(e).message
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :dismissible="!busy"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <p>{{ description }}</p>
      <UFormField
        class="mt-4"
        :label="t('nuxtUiMongocamp.confirmByName.prompt', { name })"
      >
        <UInput
          v-model="typed"
          class="w-full"
          autocomplete="off"
          :disabled="busy"
          :aria-label="t('nuxtUiMongocamp.confirmByName.prompt', { name })"
          @keydown.enter.prevent="handleConfirm"
        />
      </UFormField>
      <UAlert
        v-if="error"
        class="mt-3"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="error"
      />
    </template>
    <template #footer>
      <UButton
        :label="t('nuxtUiMongocamp.common.cancel')"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        @click="close"
      />
      <UButton
        :label="confirmLabel"
        :color="confirmColor"
        :icon="confirmIcon"
        :disabled="!matches"
        :loading="busy"
        @click="handleConfirm"
      />
    </template>
  </UModal>
</template>
