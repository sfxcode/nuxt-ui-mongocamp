# useMongocampSavedQueries

Saved filters and a short history **per collection**, kept in this browser only (`localStorage`, through [`useMongocampPersistedState`](/composables/use-mongocamp-persisted-state)). Nothing is sent to the server, so saved queries are per browser and are not shared.

```ts
const { saved, recent, save, remove, record, clearRecent, exportJson, importJson } =
  useMongocampSavedQueries(() => route.params.name as string)

record({ lucene: 'status:open', sort: ['-createdAt'] })      // after a query ran
const r = save('Open orders', { filterGroup: group.value, lucene: applied.value })
if (!r.ok) toast(r.reason)   // 'invalid-name' | 'invalid-query' | 'limit' | 'too-large'

for (const { name, query } of saved.value) { /* offer it */ }
```

## A query

```ts
interface SavedQuery {
  filterGroup?: FilterGroup   // the visual builder's state, so it can be restored and edited
  lucene?: string             // a quick search, or what the builder produced
  sort?: string[]             // e.g. ['-createdAt']
  projection?: string[]
}
```

Restoring a `filterGroup` and running it through `buildFilterQuery` gives the same Lucene string as the original.

## Rules

- **Saved**: at most 50 per collection; names are trimmed (1–80 characters) and unique **case-insensitively** — saving an existing name replaces it, also when the list is full.
- **Recent**: at most 20; `record` puts the query on top and removes an equal one (condition ids and key order do not matter). An empty query is ignored (`record` returns `false`).
- **Bounds**: Lucene ≤ 2000 characters, ≤ 50 conditions, ≤ 500 characters per value, ≤ 10 sort and ≤ 100 projection entries; the whole store ≤ 128 KB (`save`/`record`/`importJson` refuse what would not fit and change nothing).
- **Untrusted input**: everything read from storage or an imported file is cleaned field by field — unknown keys are dropped, unknown operators (`$where`, …) invalidate the whole filter group, never half of it.
- Per collection: the key is `savedQueries:<collection>`; a ref or getter collection reloads when it changes.

## Export and import

`exportJson()` returns `{ "format": "nuxt-ui-mongocamp-saved-queries", "version": 1, "queries": [{ name, query }] }`. `importJson(text)` merges it into the saved list (same names are replaced) and returns `{ ok: true, imported, skipped }`; a file of another format, non-JSON or over 128 KB is refused whole (`foreign-format`, `not-json`, `too-large`).

::: info
This is the composable only. The data table has no "Saved queries" menu yet — that UI belongs to the admin-components plan.
:::
