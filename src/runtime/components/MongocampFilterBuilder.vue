<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import {
  buildFilterQuery,
  countActiveConditions,
  operatorLabelKey,
  operatorsFor,
  valueCountFor,
} from '../utils/filterBuilder'
import type { FilterCondition, FilterFieldType, FilterGroup, FilterOperator } from '../utils/filterBuilder'

const props = defineProps<{
  // the fields a condition can target, with the type that decides which operators it offers
  fields: { key: string, type: FilterFieldType }[]
}>()

// the draft being edited — the parent owns it so it survives the panel being hidden and shown
const model = defineModel<FilterGroup>({ required: true })

// `apply` carries the finished Lucene string ('' = no filter), so a parent never has to know the rules
const emit = defineEmits<{ apply: [query: string] }>()

const { t } = useI18n()

let idCounter = 0
function newId(): string {
  return `filter-${Date.now()}-${idCounter++}`
}

const fieldTypes = computed<Record<string, FilterFieldType>>(() =>
  Object.fromEntries(props.fields.map(f => [f.key, f.type])),
)

const fieldItems = computed(() => props.fields.map(f => ({ label: f.key, value: f.key })))

function typeOf(field: string): FilterFieldType {
  return fieldTypes.value[field] ?? 'string'
}

function operatorItems(type: FilterFieldType) {
  return operatorsFor(type).map(operator => ({ label: t(operatorLabelKey(operator, type)), value: operator }))
}

const matchItems = computed(() => [
  { label: t('nuxtUiMongocamp.filterBuilder.matchAll'), value: 'all' },
  { label: t('nuxtUiMongocamp.filterBuilder.matchAny'), value: 'any' },
])

const query = computed(() => buildFilterQuery(model.value, fieldTypes.value))
const ignoredCount = computed(() => model.value.conditions.length - countActiveConditions(model.value, fieldTypes.value))

function setConditions(conditions: FilterCondition[]) {
  model.value = { ...model.value, conditions }
}

function updateCondition(index: number, patch: Partial<FilterCondition>) {
  setConditions(model.value.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)))
}

function addCondition() {
  const field = props.fields[0]
  if (!field) return
  setConditions([...model.value.conditions, { id: newId(), field: field.key, operator: operatorsFor(field.type)[0]! }])
}

function removeCondition(index: number) {
  setConditions(model.value.conditions.filter((_, i) => i !== index))
}

// a different field can be a different type, so its old operator and values may no longer make sense
function changeField(index: number, field: string) {
  const operators = operatorsFor(typeOf(field))
  const current = model.value.conditions[index]!
  updateCondition(index, {
    field,
    operator: operators.includes(current.operator) ? current.operator : operators[0]!,
    value: '',
    value2: '',
  })
}

function setMatch(match: 'all' | 'any') {
  model.value = { ...model.value, match }
}

function apply() {
  emit('apply', query.value)
}

function clearAll() {
  setConditions([])
  emit('apply', '')
}
</script>

<template>
  <div class="flex flex-col gap-3 rounded-md border border-default p-3">
    <p
      v-if="fields.length === 0"
      class="text-sm text-dimmed"
    >
      {{ t('nuxtUiMongocamp.filterBuilder.noFields') }}
    </p>

    <template v-else>
      <div
        v-if="model.conditions.length > 1"
        class="flex items-center gap-2 text-sm"
      >
        <span>{{ t('nuxtUiMongocamp.filterBuilder.matchLabel') }}</span>
        <USelect
          :model-value="model.match"
          :items="matchItems"
          size="sm"
          class="w-44"
          :aria-label="t('nuxtUiMongocamp.filterBuilder.matchLabel')"
          @update:model-value="(value: string) => setMatch(value as 'all' | 'any')"
        />
      </div>

      <p
        v-if="model.conditions.length === 0"
        class="text-sm text-dimmed"
      >
        {{ t('nuxtUiMongocamp.filterBuilder.noConditions') }}
      </p>

      <div
        v-for="(condition, index) in model.conditions"
        :key="condition.id"
        class="flex flex-wrap items-center gap-2"
      >
        <USelect
          :model-value="condition.field"
          :items="fieldItems"
          size="sm"
          class="w-44"
          :aria-label="t('nuxtUiMongocamp.filterBuilder.field')"
          @update:model-value="(value: string) => changeField(index, value)"
        />
        <USelect
          :model-value="condition.operator"
          :items="operatorItems(typeOf(condition.field))"
          size="sm"
          class="w-44"
          :aria-label="t('nuxtUiMongocamp.filterBuilder.operator')"
          @update:model-value="(value: string) => updateCondition(index, { operator: value as FilterOperator })"
        />
        <template v-if="valueCountFor(condition.operator) > 0">
          <UInput
            :model-value="condition.value ?? ''"
            :type="typeOf(condition.field) === 'date-time' ? 'date' : 'text'"
            :inputmode="typeOf(condition.field) === 'number' ? 'decimal' : undefined"
            :placeholder="condition.operator === 'oneOf' ? t('nuxtUiMongocamp.filterBuilder.listPlaceholder') : undefined"
            size="sm"
            class="w-48"
            :aria-label="t('nuxtUiMongocamp.filterBuilder.value')"
            @update:model-value="(value: string | number | undefined) => updateCondition(index, { value: String(value ?? '') })"
          />
          <template v-if="valueCountFor(condition.operator) === 2">
            <span class="text-sm text-dimmed">{{ t('nuxtUiMongocamp.filterBuilder.and') }}</span>
            <UInput
              :model-value="condition.value2 ?? ''"
              :type="typeOf(condition.field) === 'date-time' ? 'date' : 'text'"
              :inputmode="typeOf(condition.field) === 'number' ? 'decimal' : undefined"
              size="sm"
              class="w-48"
              :aria-label="t('nuxtUiMongocamp.filterBuilder.valueTo')"
              @update:model-value="(value: string | number | undefined) => updateCondition(index, { value2: String(value ?? '') })"
            />
          </template>
        </template>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('nuxtUiMongocamp.filterBuilder.remove')"
          @click="removeCondition(index)"
        />
      </div>

      <p
        v-if="ignoredCount > 0"
        class="text-xs text-warning"
      >
        {{ t('nuxtUiMongocamp.filterBuilder.ignoredRows', { count: ignoredCount }, ignoredCount) }}
      </p>

      <div
        v-if="query"
        class="flex items-baseline gap-2 text-xs"
      >
        <span class="shrink-0 text-dimmed">{{ t('nuxtUiMongocamp.filterBuilder.query') }}</span>
        <code class="break-all font-mono">{{ query }}</code>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          :label="t('nuxtUiMongocamp.filterBuilder.addCondition')"
          @click="addCondition"
        />
        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :label="t('nuxtUiMongocamp.filterBuilder.clearAll')"
            @click="clearAll"
          />
          <UButton
            size="sm"
            :label="t('nuxtUiMongocamp.filterBuilder.apply')"
            @click="apply"
          />
        </div>
      </div>
    </template>
  </div>
</template>
