<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'
import MongocampFilterBuilder from './MongocampFilterBuilder.vue'
import { useMongocampSavedQueries } from '../composables/useMongocampSavedQueries'
import { buildCondition, buildFilterQuery, conditionValueText, countActiveConditions, operatorLabelKey } from '../utils/filterBuilder'
import type { FilterFieldType, FilterGroup } from '../utils/filterBuilder'
import {
  addSort, describeQuery, emptyGroup, fromSavedQuery, isEmptyQuery, MAX_SORT_ENTRIES, parseSortEntry, removeSort,
  setSortField, toggleProjectionField, toggleSortDirection, toSavedQuery, usableProjection,
} from '../utils/queryState'
import type { QueryState } from '../utils/queryState'
import type { SavedQuery } from '../utils/savedQueries'

// One bar for the query of a document list: the visual filter, a sort, the fields to load (a projection) and a menu with
// the recent and the saved queries of the collection. It edits `v-model` (the APPLIED query) and emits `apply` with the
// new state whenever the user changes it — the parent fetches. Saved queries and history live in this browser only.
const props = defineProps<{
  // the fields a filter condition can target (key + type), as MongocampFilterBuilder takes them
  fields: { key: string, type: FilterFieldType }[]
  // the field names a sort and a projection can use; `_id` may be in it (sortable, never part of a projection)
  columns: string[]
  // history and saved queries are kept per collection
  collection: string
  loadDistinct?: (field: string) => Promise<string[]>
}>()

const model = defineModel<QueryState>({ required: true })
const emit = defineEmits<{ apply: [state: QueryState] }>()

const { t } = useI18n()
const { saved, recent, save, remove, record, clearRecent } = useMongocampSavedQueries(() => props.collection)

const fieldTypes = computed<Record<string, FilterFieldType>>(() => Object.fromEntries(props.fields.map(f => [f.key, f.type])))
const projectable = computed(() => props.columns.filter(c => c !== '_id'))

// ---- filter: the panel edits a draft, the applied group is what the parent filters by
const filtersOpen = ref(false)
const draft = ref<FilterGroup>(emptyGroup())
const cloneGroup = (g: FilterGroup): FilterGroup => ({ match: g.match, negate: g.negate, conditions: g.conditions.map(c => ({ ...c })) })
watch(() => model.value.filterGroup, g => (draft.value = cloneGroup(g)), { immediate: true })
watch(() => props.collection, () => (filtersOpen.value = false))
// a parent that reloads or resets the list closes the panel (an open, half-edited draft is not carried over)
defineExpose({ closePanel: () => (filtersOpen.value = false) })

function commit(next: QueryState, options: { remember?: boolean } = {}) {
  model.value = next
  emit('apply', next)
  if (options.remember !== false && !isEmptyQuery(next)) record(toSavedQuery(next))
}

function onBuilderApply(lucene: string) {
  commit({ ...model.value, filterGroup: cloneGroup(draft.value), lucene })
}

const activeFilterCount = computed(() => {
  const count = countActiveConditions(model.value.filterGroup, fieldTypes.value)
  return count > 0 ? count : (model.value.lucene !== '' ? 1 : 0)
})
const filterChips = computed(() => {
  const chips = model.value.filterGroup.conditions
    .filter(c => buildCondition(c, fieldTypes.value[c.field] ?? 'string') !== '')
    .map(c => ({
      id: c.id,
      label: [c.field, t(operatorLabelKey(c.operator, fieldTypes.value[c.field] ?? 'string')), conditionValueText(c)].filter(Boolean).join(' '),
    }))
  // a query restored from a Lucene string has no conditions to show, so the string itself is the chip
  if (chips.length === 0 && model.value.lucene !== '') chips.push({ id: '__lucene', label: t('nuxtUiMongocamp.queryBar.customFilter', { query: model.value.lucene }) })
  return chips
})

function removeChip(id: string) {
  if (id === '__lucene') return clearFilter()
  const group = { ...model.value.filterGroup, conditions: model.value.filterGroup.conditions.filter(c => c.id !== id) }
  commit({ ...model.value, filterGroup: group, lucene: buildFilterQuery(group, fieldTypes.value) })
}

function clearFilter() {
  commit({ ...model.value, filterGroup: emptyGroup(), lucene: '' }, { remember: false })
}

// ---- sort
const sortFieldItems = computed(() => props.columns.map(c => ({ label: c, value: c })))
const sortEntries = computed(() => model.value.sort.map(parseSortEntry))
const canAddSort = computed(() => model.value.sort.length < MAX_SORT_ENTRIES && props.columns.some(c => !sortEntries.value.some(e => e.field === c)))

function setSort(sort: string[]) {
  commit({ ...model.value, sort })
}

function addSortRow() {
  const next = props.columns.find(c => !sortEntries.value.some(e => e.field === c))
  if (next) setSort(addSort(model.value.sort, next))
}

// ---- fields (projection)
const projection = computed(() => usableProjection(model.value.projection, projectable.value))
const fieldMenuItems = computed(() => {
  const chosen = projection.value.length > 0 ? projection.value : projectable.value
  return projectable.value.map(key => ({
    label: key,
    type: 'checkbox' as const,
    checked: chosen.includes(key),
    onUpdateChecked: () => commit({ ...model.value, projection: toggleProjectionField(projection.value, key, projectable.value) }),
    onSelect: (e: Event) => e.preventDefault(),
  }))
})

// ---- history and saved queries
const labels = computed(() => ({
  filter: t('nuxtUiMongocamp.queryBar.wordFilter'),
  sort: t('nuxtUiMongocamp.queryBar.wordSort'),
  fields: t('nuxtUiMongocamp.queryBar.wordFields'),
}))
const describe = (q: SavedQuery) => describeQuery(q, labels.value, fieldTypes.value) || '—'

const saveName = ref('')
const saveError = ref('')
const canSave = computed(() => !isEmptyQuery(model.value))

function restore(query: SavedQuery) {
  const state = fromSavedQuery(query, fieldTypes.value)
  // fields this collection does not have are dropped, so a query from an older shape still loads
  state.projection = usableProjection(state.projection, projectable.value)
  commit(state)
}

function saveCurrent() {
  saveError.value = ''
  const result = save(saveName.value, toSavedQuery(model.value))
  if (result.ok) {
    saveName.value = ''
    return
  }
  const key = { 'invalid-name': 'saveFailedName', 'invalid-query': 'saveFailedQuery', 'limit': 'saveFailedLimit', 'too-large': 'saveFailedSize' }[result.reason]
  saveError.value = t(`nuxtUiMongocamp.queryBar.${key}`)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-1">
      <UChip
        :text="activeFilterCount"
        :show="activeFilterCount > 0"
        size="sm"
      >
        <UButton
          icon="i-lucide-list-filter"
          color="neutral"
          :variant="filtersOpen ? 'subtle' : 'ghost'"
          size="sm"
          :disabled="fields.length === 0"
          :aria-pressed="filtersOpen"
          :aria-label="t('nuxtUiMongocamp.collectionData.filtersTooltip')"
          @click="filtersOpen = !filtersOpen"
        />
      </UChip>

      <UPopover>
        <UChip
          :text="model.sort.length"
          :show="model.sort.length > 0"
          size="sm"
        >
          <UButton
            icon="i-lucide-arrow-up-down"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="columns.length === 0"
            :aria-label="t('nuxtUiMongocamp.queryBar.sortButton')"
          />
        </UChip>
        <template #content>
          <div
            class="flex w-80 flex-col gap-2 p-3"
            data-test="sort-panel"
          >
            <p class="text-sm font-semibold">
              {{ t('nuxtUiMongocamp.queryBar.sortTitle') }}
            </p>
            <p
              v-if="model.sort.length === 0"
              class="text-sm text-dimmed"
            >
              {{ t('nuxtUiMongocamp.queryBar.sortNone') }}
            </p>
            <div
              v-for="(entry, index) in sortEntries"
              :key="entry.field"
              class="flex items-center gap-1"
            >
              <USelect
                :model-value="entry.field"
                :items="sortFieldItems"
                size="sm"
                class="min-w-0 flex-1"
                :aria-label="t('nuxtUiMongocamp.queryBar.sortField', { position: index + 1 })"
                @update:model-value="(v: string) => setSort(setSortField(model.sort, index, v))"
              />
              <UButton
                :icon="entry.desc ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
                color="neutral"
                variant="ghost"
                size="sm"
                :label="entry.desc ? t('nuxtUiMongocamp.queryBar.sortDescending') : t('nuxtUiMongocamp.queryBar.sortAscending')"
                :aria-label="t('nuxtUiMongocamp.queryBar.toggleSortDirection', { field: entry.field })"
                @click="setSort(toggleSortDirection(model.sort, index))"
              />
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="t('nuxtUiMongocamp.queryBar.removeSort', { field: entry.field })"
                @click="setSort(removeSort(model.sort, index))"
              />
            </div>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="soft"
              size="sm"
              :label="t('nuxtUiMongocamp.queryBar.addSort')"
              :disabled="!canAddSort"
              @click="addSortRow"
            />
          </div>
        </template>
      </UPopover>

      <UDropdownMenu :items="fieldMenuItems">
        <UChip
          :text="projection.length"
          :show="projection.length > 0"
          size="sm"
        >
          <UButton
            icon="i-lucide-columns-3"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="projectable.length === 0"
            :title="projection.length > 0 ? t('nuxtUiMongocamp.queryBar.fieldsSome', { count: projection.length, total: projectable.length }) : t('nuxtUiMongocamp.queryBar.fieldsAll')"
            :aria-label="t('nuxtUiMongocamp.queryBar.fieldsButton')"
          />
        </UChip>
      </UDropdownMenu>

      <UPopover>
        <UButton
          icon="i-lucide-history"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('nuxtUiMongocamp.queryBar.historyButton')"
        />
        <template #content>
          <div
            class="flex w-96 max-w-[90vw] flex-col gap-3 p-3"
            data-test="history-panel"
          >
            <section class="flex flex-col gap-1">
              <h3 class="text-sm font-semibold">
                {{ t('nuxtUiMongocamp.queryBar.saved') }}
              </h3>
              <p
                v-if="saved.length === 0"
                class="text-sm text-dimmed"
              >
                {{ t('nuxtUiMongocamp.queryBar.noSaved') }}
              </p>
              <div
                v-for="entry in saved"
                :key="entry.name"
                class="flex items-center gap-1"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="min-w-0 flex-1 justify-start"
                  :title="describe(entry.query)"
                  @click="restore(entry.query)"
                >
                  <span class="truncate font-medium">{{ entry.name }}</span>
                  <span class="truncate text-xs text-dimmed">{{ describe(entry.query) }}</span>
                </UButton>
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="sm"
                  :aria-label="t('nuxtUiMongocamp.queryBar.deleteSaved', { name: entry.name })"
                  @click="remove(entry.name)"
                />
              </div>
              <form
                class="mt-1 flex items-center gap-1"
                @submit.prevent="saveCurrent"
              >
                <UInput
                  v-model="saveName"
                  size="sm"
                  class="min-w-0 flex-1"
                  :placeholder="t('nuxtUiMongocamp.queryBar.saveNamePlaceholder')"
                  :aria-label="t('nuxtUiMongocamp.queryBar.saveName')"
                  maxlength="80"
                />
                <UButton
                  type="submit"
                  icon="i-lucide-save"
                  size="sm"
                  :label="t('nuxtUiMongocamp.queryBar.save')"
                  :disabled="!canSave || saveName.trim() === ''"
                  :title="canSave ? undefined : t('nuxtUiMongocamp.queryBar.nothingToSave')"
                />
              </form>
              <p
                v-if="saveError"
                class="text-xs text-error"
                role="alert"
              >
                {{ saveError }}
              </p>
            </section>
            <section class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold">
                  {{ t('nuxtUiMongocamp.queryBar.recent') }}
                </h3>
                <UButton
                  v-if="recent.length > 0"
                  color="neutral"
                  variant="link"
                  size="xs"
                  :label="t('nuxtUiMongocamp.queryBar.clearHistory')"
                  @click="clearRecent"
                />
              </div>
              <p
                v-if="recent.length === 0"
                class="text-sm text-dimmed"
              >
                {{ t('nuxtUiMongocamp.queryBar.noRecent') }}
              </p>
              <UButton
                v-for="(query, index) in recent"
                :key="index"
                color="neutral"
                variant="ghost"
                size="sm"
                class="justify-start"
                :label="describe(query)"
                data-test="recent-query"
                @click="restore(query)"
              />
            </section>
          </div>
        </template>
      </UPopover>
    </div>

    <MongocampFilterBuilder
      v-if="filtersOpen"
      v-model="draft"
      :fields="fields"
      :load-distinct="loadDistinct"
      @apply="onBuilderApply"
    />

    <div
      v-if="filterChips.length > 0"
      class="flex flex-wrap items-center gap-2"
    >
      <UBadge
        v-if="model.filterGroup.negate"
        color="warning"
        variant="subtle"
        :label="t('nuxtUiMongocamp.collectionData.filterExcluding')"
      />
      <UBadge
        v-for="chip in filterChips"
        :key="chip.id"
        color="neutral"
        variant="subtle"
        class="gap-1"
      >
        {{ chip.label }}
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="link"
          size="xs"
          class="p-0"
          :aria-label="t('nuxtUiMongocamp.collectionData.removeFilter', { filter: chip.label })"
          @click="removeChip(chip.id)"
        />
      </UBadge>
      <UButton
        color="neutral"
        variant="link"
        size="xs"
        :label="t('nuxtUiMongocamp.collectionData.clearFilters')"
        @click="clearFilter"
      />
    </div>
    <p
      v-if="projection.length > 0"
      class="text-xs text-dimmed"
    >
      {{ t('nuxtUiMongocamp.queryBar.fieldsSome', { count: projection.length, total: projectable.length }) }}.
      <UButton
        color="neutral"
        variant="link"
        size="xs"
        :label="t('nuxtUiMongocamp.queryBar.fieldsReset')"
        @click="commit({ ...model, projection: [] })"
      />
    </p>
  </div>
</template>
