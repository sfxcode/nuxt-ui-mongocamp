# MongocampCollectionData

Paginated, filterable, sortable document table for a collection, with insert/edit/delete, and — for GridFS bucket collections — per-row download and bucket upload.

## Usage

```vue
<template>
  <MongocampCollectionData collection-name="myCollection" />
</template>
```

## Props

| Prop | Type | Description |
|---|---|---|
| `collectionName` | `string` | Required. Collection to browse. |

## Columns

Columns are derived from the first fetched row's keys (`_id` first, `metaData` last, everything else A–Z).

## Cell rendering

- `date-time`-looking values and MongoDB `$date` extended JSON → locale-formatted date string
- MongoDB `$oid` → monospaced ID string
- `metaData` objects (with `created`/`updated` fields) → structured `created` / `updated` / `by` rows
- All other objects and arrays → icon button (`{}` / list); click opens a modal with pretty-printed JSON

## Filtering & sorting

- The search input is debounced (300ms) and sent as a Lucene query (`col1: *term* OR col2: *term*`) across all string-typed columns — disabled until at least one such column exists.
- Column headers are clickable and trigger a server-side sort (`field` / `-field`) via `documentApi.listDocumentsRaw`.

## Insert / Edit / Delete

- **Insert** — opens a JSON textarea modal (empty `{}` by default); calls `documentApi.insert`.
- **Edit** — pre-fills the same textarea with the row's JSON; calls `documentApi.update` (the `_id` field is stripped before sending, since MongoDB rejects updates to it).
- **Delete** — confirmation modal, then `documentApi._delete`.

## GridFS bucket collections

When `collectionName` ends in `.files` or `.chunks` (i.e. you're browsing a GridFS bucket), the toolbar and actions column change:

- The **Insert** (+) button is replaced with an **Upload** button — picks a file and uploads it to the underlying bucket via `fileApi.insertFile`.
- Each row gets a **Download** button that fetches the file (by `_id` on `.files` rows, by `files_id` on `.chunks` rows) and triggers a browser download using the real filename.

This logic is provided by [`useMongocampBucket`](/composables/use-mongocamp-bucket) — see that page for the bucket-naming convention and how file IDs are resolved from each row shape.

## Related composables

- [`useMongocampCollection`](/composables/use-mongocamp-collection)
- [`useMongocampBucket`](/composables/use-mongocamp-bucket)
- [`useMongocampQuery`](/composables/use-mongocamp-query) / [`useMongocampQueryBuilder`](/composables/use-mongocamp-query-builder) — for building custom Lucene filters
