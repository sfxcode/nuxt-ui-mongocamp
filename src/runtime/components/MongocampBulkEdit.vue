<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { coerceRow } from '../utils/importRows'
import type { ImportColumnType } from '../utils/importRows'
import type { BsonType } from '../utils/bsonTypes'

// What the dialog offers as the type of the new value: the import types plus the exact numeric BSON types, so editing an int
// field stays an int instead of becoming a long.
type EditType = ImportColumnType | 'int' | 'long' | 'double' | 'decimal'

const props = defineProps<{
  // how many documents are selected; the parent owns the selection and runs the update
  selected: number
  // `bson`: the field's dominant BSON type (from the server's field analysis) — preselects the value type; `mixed`: the field holds several kinds of value
  fields: { key: string, type: ImportColumnType, bson?: BsonType, mixed?: boolean }[]
  saving?: boolean
  error?: string
}>()

const emit = defineEmits<{
  // `bson`: write the value as this type (the parent wraps it); absent: plain JSON, the server picks the type
  apply: [edit: { field: string, value: unknown, bson?: BsonType }]
}>()

// The parent owns the trigger (it lives in the selection bar, which disappears while the table
// reloads and clears the selection) — this component is only the dialog, so a failed update keeps
// it open no matter what the bar does.
const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const field = ref('')
const type = ref<EditType>('string')
const text = ref('')
const booleanValue = ref('true')

// the type a field starts with: its own BSON type when known (an int stays an int), else the column type
function startType(key: string): EditType {
  const info = props.fields.find(f => f.key === key)
  switch (info?.bson) {
    case 'int': case 'long': case 'double': case 'decimal': return info.bson
    default: return info?.type ?? 'string'
  }
}

watch(isOpen, (open) => {
  if (!open) return
  field.value = props.fields[0]?.key ?? ''
  type.value = startType(field.value)
  text.value = ''
  booleanValue.value = 'true'
})

const fieldItems = computed(() => props.fields.map(f => ({ label: f.key, value: f.key })))
const typeItems = computed(() => [
  { label: t('nuxtUiMongocamp.import.typeString'), value: 'string' },
  { label: t('nuxtUiMongocamp.import.typeNumber'), value: 'number' },
  { label: t('nuxtUiMongocamp.bulk.typeInt'), value: 'int' },
  { label: t('nuxtUiMongocamp.bulk.typeLong'), value: 'long' },
  { label: t('nuxtUiMongocamp.bulk.typeDouble'), value: 'double' },
  { label: t('nuxtUiMongocamp.bulk.typeDecimal'), value: 'decimal' },
  { label: t('nuxtUiMongocamp.import.typeBoolean'), value: 'boolean' },
  { label: t('nuxtUiMongocamp.import.typeDate'), value: 'date-time' },
  { label: t('nuxtUiMongocamp.import.typeJson'), value: 'json' },
])
const booleanItems = computed(() => [
  { label: t('nuxtUiMongocamp.bulk.editTrue'), value: 'true' },
  { label: t('nuxtUiMongocamp.bulk.editFalse'), value: 'false' },
])

function onFieldChange(key: string) {
  field.value = key
  type.value = startType(key)
  text.value = ''
}

const mixedField = computed(() => props.fields.find(f => f.key === field.value)?.mixed === true)

const INT32_MIN = -(2 ** 31)
const INT32_MAX = 2 ** 31 - 1
const INTEGER_TEXT = /^-?\d+$/
const DECIMAL_TEXT = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i

// the exact numeric types are checked here and kept as typed text (a long keeps every digit); `wireValue` writes the wrapper
function parseExact(kind: 'int' | 'long' | 'double' | 'decimal', raw: string): { value?: string, error?: string } {
  const trimmed = raw.trim()
  const invalid = { error: t('nuxtUiMongocamp.import.error.invalid-number') }
  if (kind === 'long') return INTEGER_TEXT.test(trimmed) ? { value: trimmed } : invalid
  if (kind === 'int') return INTEGER_TEXT.test(trimmed) && Number(trimmed) >= INT32_MIN && Number(trimmed) <= INT32_MAX ? { value: trimmed } : invalid
  if (kind === 'decimal') return DECIMAL_TEXT.test(trimmed) ? { value: trimmed } : invalid
  return DECIMAL_TEXT.test(trimmed) && Number.isFinite(Number(trimmed)) ? { value: trimmed } : invalid
}

// the BSON type the chosen value type writes (the plain `number`, `boolean` and `json` leave the choice to the server)
const BSON_OF_EDIT_TYPE: Partial<Record<EditType, BsonType>> = { 'string': 'string', 'int': 'int', 'long': 'long', 'double': 'double', 'decimal': 'decimal', 'date-time': 'date' }

// Same conversion rules as an import: numbers must be plain numbers, dates ISO (read as UTC),
// JSON must parse. An empty text is a valid value only for a text field.
const parsed = computed<{ value?: unknown, error?: string }>(() => {
  if (type.value === 'boolean') return { value: booleanValue.value === 'true' }
  if (text.value.trim() === '' && type.value !== 'string') return { error: t('nuxtUiMongocamp.bulk.editValueRequired') }
  if (type.value === 'int' || type.value === 'long' || type.value === 'double' || type.value === 'decimal') return parseExact(type.value, text.value)
  const { row, errors } = coerceRow({ value: text.value }, { value: type.value }, { emptyCells: 'empty-string' })
  if (errors.length > 0) return { error: t(`nuxtUiMongocamp.import.error.${errors[0]!.code}`) }
  return { value: row.value }
})

const showTextError = computed(() => text.value !== '' && parsed.value.error !== undefined)
const canApply = computed(() => field.value !== '' && parsed.value.error === undefined && !props.saving)

function apply() {
  if (!canApply.value) return
  emit('apply', { field: field.value, value: parsed.value.value, bson: BSON_OF_EDIT_TYPE[type.value] })
}

// the parent runs the update; once it finishes cleanly the modal closes, on failure it stays open
// showing `error`
watch(() => props.saving, (now, before) => {
  if (before && !now && !props.error) isOpen.value = false
})
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="t('nuxtUiMongocamp.bulk.editTitle', { count: selected }, selected)"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <p class="text-sm">
          {{ t('nuxtUiMongocamp.bulk.editDescription') }}
        </p>
        <div class="flex flex-wrap items-end gap-3">
          <USelect
            :model-value="field"
            :items="fieldItems"
            class="w-48"
            :aria-label="t('nuxtUiMongocamp.bulk.editField')"
            @update:model-value="onFieldChange"
          />
          <USelect
            v-model="type"
            :items="typeItems"
            class="w-36"
            :aria-label="t('nuxtUiMongocamp.bulk.editType')"
          />
          <USelect
            v-if="type === 'boolean'"
            v-model="booleanValue"
            :items="booleanItems"
            class="w-28"
            :aria-label="t('nuxtUiMongocamp.bulk.editValue')"
          />
          <UInput
            v-else
            v-model="text"
            class="w-56"
            :color="showTextError ? 'error' : undefined"
            :aria-label="t('nuxtUiMongocamp.bulk.editValue')"
            @keydown.enter.prevent="apply"
          />
        </div>
        <p
          v-if="showTextError"
          class="text-sm text-error"
        >
          {{ parsed.error }}
        </p>
        <p
          v-if="mixedField"
          class="text-sm text-warning"
          data-test="mixed-note"
        >
          {{ t('nuxtUiMongocamp.bulk.editMixed') }}
        </p>
        <p
          v-if="field"
          class="text-sm text-dimmed"
        >
          {{ t('nuxtUiMongocamp.bulk.editSummary', { field, count: selected }, selected) }}
        </p>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="error"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        :label="t('nuxtUiMongocamp.common.cancel')"
        color="neutral"
        variant="ghost"
        :disabled="saving"
        @click="isOpen = false"
      />
      <UButton
        :label="t('nuxtUiMongocamp.bulk.confirmEdit', { count: selected })"
        :loading="saving"
        :disabled="!canApply"
        @click="apply"
      />
    </template>
  </UModal>
</template>
