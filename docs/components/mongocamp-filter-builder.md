# MongocampFilterBuilder

Panel for building a filter without writing Lucene: a list of conditions (`field · operator · value`), a **Match all / any** choice once there are two or more, **Add condition**, **Clear all** and **Apply filters**. The operators offered depend on the field's type (see [`useMongocampFilterBuilder`](/composables/use-mongocamp-filter-builder)); the value inputs follow the operator (none for "exists", two for "is between", a date picker for dates). A read-only **Query** line shows the Lucene that Apply will send, and conditions that are incomplete are called out as ignored.

It only edits data and emits the result — it does not run the query itself. You keep the draft in a `v-model`, so it survives the panel being hidden and shown, and run the filter yourself on `apply`.

## Usage

```vue
<script setup lang="ts">
const draft = ref({ match: 'all' as const, conditions: [] })
const fields = [
  { key: 'name', type: 'string' },
  { key: 'age', type: 'number' },
  { key: 'created', type: 'date-time' },
] as const

function onApply(query: string) {
  // '' means "no filter"
  filter.value = query
}
</script>

<template>
  <MongocampFilterBuilder v-model="draft" :fields="fields" @apply="onApply" />
</template>
```

## Props

| Prop | Type | Description |
|---|---|---|
| `v-model` | `FilterGroup` | The draft: `{ match: 'all' \| 'any', conditions: FilterCondition[] }` |
| `fields` | `{ key: string, type: FilterFieldType }[]` | Fields a condition can target; `type` is `string`, `number`, `date-time`, `boolean`, `array` or `object`. With no fields the panel says so and offers no controls |

## Events

| Event | Payload | Description |
|---|---|---|
| `apply` | `query: string` | **Apply filters** clicked, or **Clear all** (which sends `''`). `''` means "no filter" |

## Behaviour

- Choosing a different field resets the condition's values, and its operator too unless the new field's type also supports it (a name's "contains" becomes a number's "equals").
- Rows that are incomplete or invalid (empty value, a non-numeric number, a non-ISO date) are ignored rather than matching everything.
- Labels are translated (English and German); date operators read "on or after" / "on or before".

## Related

- [`useMongocampFilterBuilder`](/composables/use-mongocamp-filter-builder)
- [`useMongocampQuery`](/composables/use-mongocamp-query)
