<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'

const PREVIEW_LIMIT = 5

const props = defineProps<{
  // display names of the selected rows; the parent owns the selection itself
  selected: string[]
  deleting?: boolean
  error?: string
  // "select all matching" (optional, off without `total`): the rows selectable on this page and how many documents match
  // in all. When the whole page is selected and more match, the bar offers to select them all.
  pageCount?: number
  total?: number
  // the selection is every matching document (collected by the parent), not the rows on screen
  allMatching?: boolean
  // the matching documents are being counted (one quick request)
  counting?: boolean
  // how many documents the selection stands for when `selected` does not list them (all matching: the filter is the selection)
  selectedCount?: number
  // an honest remark about the selection (a refusal, or a count that differs from the list's)
  note?: string
  // when set, the delete must be confirmed by typing this text (the collection name for "all matching")
  confirmName?: string
}>()

const emit = defineEmits<{ confirm: [], clear: [], open: [], selectAll: [] }>()

const { t } = useI18n()
const isOpen = ref(false)

const typed = ref('')
const confirmed = computed(() => !props.confirmName || typed.value.trim() === props.confirmName)
const count = computed(() => props.selectedCount ?? props.selected.length)
const offerSelectAll = computed(() =>
  !props.allMatching && !props.counting && props.total !== undefined && props.pageCount !== undefined
  && props.pageCount > 0 && props.selected.length === props.pageCount && props.total > props.pageCount,
)

function openModal() {
  emit('open')
  typed.value = ''
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
    v-if="count > 0 || counting || note"
    class="flex flex-col gap-1"
  >
    <div
      v-if="count > 0"
      class="flex flex-wrap items-center gap-3 rounded-md border border-default bg-elevated/50 px-3 py-2"
    >
      <span class="text-sm font-medium">
        {{ allMatching ? t('nuxtUiMongocamp.bulk.allMatchingSelected', { count }) : t('nuxtUiMongocamp.bulk.selectedCount', { count }) }}
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
    <div
      v-if="offerSelectAll"
      class="flex flex-wrap items-center gap-2 px-3 text-sm"
      data-test="select-all-banner"
    >
      <span>{{ t('nuxtUiMongocamp.bulk.pageSelected', { count: pageCount }) }}</span>
      <UButton
        color="primary"
        variant="link"
        size="sm"
        class="p-0"
        :label="t('nuxtUiMongocamp.bulk.selectAllMatching', { total })"
        @click="emit('selectAll')"
      />
    </div>
    <div
      v-if="counting"
      class="flex items-center gap-2 px-3 text-sm"
      role="status"
      data-test="counting"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-4 animate-spin"
      />
      <span>{{ t('nuxtUiMongocamp.bulk.counting') }}</span>
    </div>
    <p
      v-if="note"
      class="px-3 text-sm text-warning"
      role="status"
      data-test="bulk-note"
    >
      {{ note }}
    </p>
  </div>

  <UModal
    v-model:open="isOpen"
    :title="t('nuxtUiMongocamp.bulk.deleteTitle', { count }, count)"
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
      <UFormField
        v-if="confirmName"
        class="mt-3"
        :label="t('nuxtUiMongocamp.bulk.typeToConfirmLabel')"
        :help="t('nuxtUiMongocamp.bulk.typeToConfirm', { name: confirmName })"
      >
        <UInput
          v-model="typed"
          class="w-full"
          autocomplete="off"
          :disabled="deleting"
          :aria-label="t('nuxtUiMongocamp.bulk.typeToConfirmLabel')"
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
        :disabled="deleting"
        @click="isOpen = false"
      />
      <UButton
        :label="t('nuxtUiMongocamp.bulk.confirmDelete', { count })"
        color="error"
        :loading="deleting"
        :disabled="!confirmed"
        @click="emit('confirm')"
      />
    </template>
  </UModal>
</template>
