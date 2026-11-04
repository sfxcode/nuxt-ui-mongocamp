# MongocampQueryBar

One bar for the query of a document list: the **visual filter**, a **sort**, the **fields to load** (a projection) and a menu with the **recent and saved queries** of the collection. [`MongocampCollectionData`](/components/mongocamp-collection-data) uses it; use it on its own for any list you query yourself.

## Usage

```vue
<script setup lang="ts">
const query = ref(emptyQueryState())   // { filterGroup, lucene, sort, projection }

function load(next: QueryState) {
  // fetch with: filter = next.lucene, sort = next.sort, projection = next.projection
}
</script>

<template>
  <MongocampQueryBar
    v-model="query"
    :fields="[{ key: 'name', type: 'string' }, { key: 'age', type: 'number' }]"
    :columns="['_id', 'name', 'age']"
    collection="customers"
    @apply="load"
  />
</template>
```

## Props

| Prop | Type | Description |
|---|---|---|
| `v-model` | `QueryState` | The **applied** query: `filterGroup` (the visual conditions), `lucene` (the string they build, `''` = no filter), `sort` (`['name', '-age']`, a leading `-` is descending) and `projection` (field names to load; empty = all) |
| `fields` | `{ key, type }[]` | The fields a filter condition can target, as for [`MongocampFilterBuilder`](/components/mongocamp-filter-builder) |
| `columns` | `string[]` | The field names the sort and the projection can use (`_id` may be in it: sortable, never part of a projection) |
| `collection` | `string` | History and saved queries are kept **per collection** |
| `loadDistinct` | `(field) => Promise<string[]>` | Optional value suggestions for the filter builder |

## Events

| Event | Payload | When |
|---|---|---|
| `apply` | `QueryState` | The user applied a filter, changed the sort or the fields, removed a chip or restored a query. `v-model` is updated first; the parent fetches |

Exposes `closePanel()` (a parent that reloads closes the filter panel).

## Parts

- **Filters** — the filter builder panel, a count badge and one chip per condition (remove one, or **Clear filters**). A query restored from a Lucene string without conditions shows the string as a chip.
- **Sort** — up to five fields, each ascending or descending; every change is applied at once.
- **Fields** — tick the fields to load. Unticked fields are **not loaded at all** (the server always adds `_id`); ticking everything again is the same as no projection and the last field cannot be unticked. A note shows `n of m fields are loaded` with **Load all fields**.
- **History and saved queries** — *Saved*: apply, delete, and save the current query under a name (up to 80 characters, 50 per collection, names unique ignoring case). *Recent*: the last 20 distinct queries that were applied. Everything is kept in this browser only ([`useMongocampSavedQueries`](/composables/use-mongocamp-saved-queries)).

A restored query drops fields the collection does not have, and its visual filter is built again with the current field types.

## In the data table

`MongocampCollectionData` keeps its quick search as the simple mode and shows this bar below the toolbar. The table header still sorts and the bar follows it. With a projection, the other columns are hidden (and not remembered as hidden) and **editing a row first loads the complete document** by id — a partial row must never be written back as the whole document.
