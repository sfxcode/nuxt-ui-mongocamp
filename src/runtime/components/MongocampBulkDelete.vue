<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'

const PREVIEW_LIMIT = 5

const props = defineProps<{
  // display names of the selected rows; the parent owns the selection itself
  selected: string[]
  deleting?: boolean
  error?: string
}>()

const emit = defineEmits<{ confirm: [], clear: [], open: [] }>()

const { t } = useI18n()
const isOpen = ref(false)

function openModal() {
  emit('open')
  isOpen.value = true
}

const preview = computed(() => props.selected.slice(0, PREVIEW_LIMIT))
const hiddenCount = computed(() => Math.max(0, props.selected.length - PREVIEW_LIMIT))

// the parent runs the deletion; once it finishes cleanly the modal closes, on failure it stays open
// showing `error` so the user sees what is left
watch(() => props.deleting, (now, before) => {
  if (before && !now && !props.error) isOpen.value = false
})
</script>

<template>
  <div
    v-if="selected.length > 0"
    class="flex items-center gap-3 rounded-md border border-default bg-elevated/50 px-3 py-2"
  >
    <span class="text-sm font-medium">
      {{ t('nuxtUiMongocamp.bulk.selectedCount', { count: selected.length }) }}
    </span>
    <UButton
      icon="i-lucide-trash-2"
      color="error"
      variant="subtle"
      size="sm"
      :label="t('nuxtUiMongocamp.bulk.deleteSelected')"
      @click="openModal"
    />
    <slot name="actions" />
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      :label="t('nuxtUiMongocamp.bulk.clearSelection')"
      @click="emit('clear')"
    />
  </div>

  <UModal
    v-model:open="isOpen"
    :title="t('nuxtUiMongocamp.bulk.deleteTitle', { count: selected.length }, selected.length)"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <p>{{ t('nuxtUiMongocamp.bulk.deleteDescription') }}</p>
      <ul class="mt-3 list-disc pl-5 text-sm">
        <li
          v-for="name in preview"
          :key="name"
          class="break-all"
        >
          {{ name }}
        </li>
      </ul>
      <p
        v-if="hiddenCount > 0"
        class="mt-1 pl-5 text-sm text-dimmed"
      >
        {{ t('nuxtUiMongocamp.bulk.moreItems', { count: hiddenCount }) }}
      </p>
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
        :disabled="deleting"
        @click="isOpen = false"
      />
      <UButton
        :label="t('nuxtUiMongocamp.bulk.confirmDelete', { count: selected.length })"
        color="error"
        :loading="deleting"
        @click="emit('confirm')"
      />
    </template>
  </UModal>
</template>
