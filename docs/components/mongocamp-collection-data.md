# MongocampCollectionData

Paginated, filterable, sortable document table for a collection, with insert/edit/delete, import, bulk edit and bulk delete, a filter builder, page export and a column menu, and — for GridFS bucket collections — per-row download and bucket upload.

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

Columns are derived from the first fetched row's keys (`_id` first, `metaData` last, everything else A–Z). The first data column stays pinned while the table scrolls sideways, so rows stay identifiable on narrow screens; the [column menu](#toolbar) hides and shows the rest.

## Cell rendering

- ISO timestamp strings (date **and** time, e.g. `2018-02-02T22:23:44Z`) and MongoDB `$date` extended JSON → locale-formatted date string, decided per cell — a column that mixes both formats renders consistently. Date-only strings (`2018-02-02`) are left as they are
- MongoDB `$oid` → monospaced ID string
- `metaData` objects (with `created`/`updated` fields) → structured `created` / `updated` / `by` rows
- Other scalar values longer than 60 characters are truncated with `…`; the full value is available via a hover tooltip
- All other objects and arrays → icon button (`{}` / list); click opens a modal with pretty-printed JSON

## Filtering & sorting

- The search input is debounced (300ms) and built with [`useMongocampQuery`](/composables/use-mongocamp-query)'s `like`/`or` helpers (`col1:"*term*" OR col2:"*term*"`) across all string-typed columns — disabled until at least one such column exists.
- Column headers are clickable and trigger a server-side sort (`field` / `-field`) via `documentApi.listDocumentsRaw`.
- The **Filters** button (badge = number of active conditions) opens a [`MongocampFilterBuilder`](/components/mongocamp-filter-builder) panel. **Apply filters** reloads from page 1; each applied condition shows as a removable chip with a **Clear filters** link. The builder and the search input narrow the result together (AND).
  - The fields offered come from the rows on the first page, with their types inferred from the values. `_id` is not offered (a real server rejects `_id` filters), nor are arrays and objects (no operators for them). The button is disabled for an empty collection.
  - Applied filters, the panel and the draft are reset when `collectionName` changes and by the reload button.

## Toolbar

- **Filters** — see above.
- **Import documents** — opens [`MongocampImport`](/components/mongocamp-import): load a JSON or CSV file, check the preview and insert it in batches. Not shown for GridFS bucket collections; the table reloads when rows were imported.
- **Columns** — a checklist of every data column; unchecked columns are hidden (and left out of the CSV export). Resets when you reload or switch collection.
- **Export** — downloads the rows **on the current page**, as JSON (full documents, extended JSON unwrapped to plain values) or CSV (visible columns; nested values as JSON; RFC 4180 quoting). No extra request is made, so export what you need page by page, or raise the page size first.
- **Rows per page** — 10, 20 (default), 50 or 100; changing it reloads from page 1.
- **Reload** — refetches and resets sorting, search, filters and column choices.

## Selecting, editing and deleting several documents

The first column is a checkbox column (with select-all for the current page). While rows are selected a bar shows **N selected · Delete selected · Edit selected · Clear selection** ([`MongocampBulkDelete`](/components/mongocamp-bulk-delete)).

- **Edit selected** ([`MongocampBulkEdit`](/components/mongocamp-bulk-edit)) sets one scalar field to one value on every selected document, in one request per 100 documents. Fields that were not updated stay selected and are reported; `metaData` is not touched.
- **Delete selected** asks for confirmation first, listing the first few ids.

- The selection is dropped whenever the table reloads — paging, sorting, searching, filtering, page size — so rows you can no longer see are never deleted.
- Deletion is one `deleteMany` request for the selection (with a one-by-one fallback); if some fail the rest are still deleted, the failed ones stay selected and the modal reports how many failed and why. Documents whose `_id` is not a 24-character hex string can only be deleted one by one, and cannot be bulk-edited.
- GridFS bucket collections (`*.files` / `*.chunks`) have no selection: deleting those documents one by one would orphan the other half of a file. Use [`MongocampBucketFiles`](/components/mongocamp-bucket-files) for buckets.

## When loading fails

A failed load shows a [`MongocampErrorAlert`](/components/mongocamp-error-alert) above the table (retry, or "log in again" when the session has expired) instead of an empty table, and an empty result shows an empty state. A search or filter the server rejects looks to the browser exactly like a dead network or session, so when a load fails while a search or filter is active the component makes one extra request for a single row **without** them. If that works the alert says **"The filter could not be applied"** and offers **Clear filters** (which drops the search and every condition); if it fails too, the generic message stays, because then it really is the server or the session. A 401 is shown as an expired session and is not probed.

## Insert / Edit / Delete

- **Insert / Edit** — opens a form generated by `@sfxcode/nuxt-ui-formkit`'s `FUAutoForm`, which infers a FormKit schema directly from the currently-loaded page of rows (unwrapped via [`useMongocampExtendedJson`](/composables/use-mongocamp-extended-json)) — scalar fields, nested objects, and arrays (including arrays of objects, with `FUAutoForm`'s own add/clone/delete row controls) all render as real inputs instead of raw JSON. `_id` is stripped from the samples/form data before they ever reach `FUAutoForm`, so it never appears as an editable field — it is not something a document's own value should drive. Saving rewraps the form data back through `useMongocampExtendedJson`, stamps `metaData` via `useMongocampDocument`'s `ensureMetaData`, then calls `documentApi.insert`/`documentApi.update` (any `_id` still present is stripped again before sending, since MongoDB rejects updates to it). Editing preserves any document field the sampled schema never saw — `documentApi.update` is full-replace, so an unsampled field is carried over from the original row rather than dropped.
- **Empty-collection fallback** — if the currently-loaded page has zero rows, there's nothing to infer a schema from, so Insert falls back to a raw-JSON textarea modal instead (Edit never hits this path, since editing requires an existing row to have been loaded in the first place).
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
- [`useMongocampExtendedJson`](/composables/use-mongocamp-extended-json) — extended-JSON unwrap/rewrap that feeds `FUAutoForm`'s Add/Edit modal
- [`useMongocampDocument`](/composables/use-mongocamp-document) — `ensureMetaData` stamps `metaData` on insert/update
- [`useMongocampFilterBuilder`](/composables/use-mongocamp-filter-builder), [`useMongocampExport`](/composables/use-mongocamp-export), [`useMongocampBulkDelete`](/composables/use-mongocamp-bulk-delete) — the logic behind the filter panel, page export and bulk delete
- [`useMongocampImport`](/composables/use-mongocamp-import) — the batched insert behind the import dialog
