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
| `loadDistinct` | `(field: string) => Promise<string[]>` | Optional. Supplies the values a text field really has; they are offered as suggestions while typing an "equals" / "not equals" / "is one of" value (see below). Called when such a value input is focused; may resolve to `[]` for "no suggestions", and a rejection just means none |

## Events

| Event | Payload | Description |
|---|---|---|
| `apply` | `query: string` | **Apply filters** clicked, or **Clear all** (which sends `''`). `''` means "no filter" |

## Behaviour

- Choosing a different field resets the condition's values, and its operator too unless the new field's type also supports it (a name's "contains" becomes a number's "equals").
- Rows that are incomplete or invalid (empty value, a non-numeric number, a non-ISO date) are ignored rather than matching everything.
- **Value suggestions** (only with `loadDistinct`, only for text fields and the operators *equals*, *not equals* and *is one of*): the value input becomes a combo box — type freely or pick a value (a native `<datalist>`). For *is one of* a choice extends the list typed so far and values already in it are not offered again. Values containing `: * ? ( )` or a backslash are never suggested — the server treats those as query syntax even inside quotes, so a filter on them fails or misses; neither are values with a comma in a list.
- Labels are translated (English and German); date operators read "on or after" / "on or before".

## Related

- [`useMongocampFilterBuilder`](/composables/use-mongocamp-filter-builder)
- [`useMongocampQuery`](/composables/use-mongocamp-query)
