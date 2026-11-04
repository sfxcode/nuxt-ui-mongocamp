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
| `infoPath` | `string` | Base path of the page rendering [`MongocampCollectionInfos`](/components/mongocamp-collection-infos); the "index created" toast links to `<infoPath>/<collectionName>`. Default `/secured/admin/collections`. |
| `persistState` | `boolean` | Remember page size, sort and hidden columns per collection in `localStorage` (see [`useMongocampPersistedState`](/composables/use-mongocamp-persisted-state)). Default `true`; the quick search and filters are **not** remembered. |
| `stateKey` | `string` | Extra key part so two tables over the same collection keep separate state. |

## Columns

Columns are derived from the first fetched row's keys (`_id` first, `metaData` last, everything else A–Z). The first data column stays pinned while the table scrolls sideways, so rows stay identifiable on narrow screens; the [column menu](#toolbar) hides and shows the rest.

### Index this field

Managers (`useMongocampRoles().isManager`) get a small menu next to the sort button of each data column: **Create ascending index** / **Create descending index**. It makes one plain single-field index through [`useMongocampIndex().createIndexForField`](/composables/use-mongocamp-index). It is not offered for GridFS bucket collections, for `_id` (always indexed) or for the `metaData` object, nor to non-managers.

On success a toast names the index and offers **View indexes** (the info page, see `infoPath`). On failure a toast shows the server's own message (a conflicting existing index, for example) with the database address removed. Asking for an index that already exists is **not** an error: MongoDB treats an identical request as a no-op and the server answers with the same index name. Compound, unique, text and expiring indexes stay in the Indexes card of `MongocampCollectionInfos`.

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
  - The fields offered come from the rows on the first page, with their types inferred from the values. `_id` is offered with the exact operators only (`equals`, `notEquals`, `oneOf` with 24-character hex ids; server 1.6.1 or later — older servers reject `_id` filters), no arrays and objects (no operators for them). The button is disabled for an empty collection.
  - Applied filters, the panel and the draft are reset when `collectionName` changes and by the reload button.
  - **Value suggestions:** focusing the value of a text field's *equals* / *not equals* / *is one of* condition lists that field's distinct values (one `distinct` request per field, cached until the collection changes or the table is reloaded; sorted, up to 100). A field with more than 100 distinct values (names, ids) gets no suggestions — an arbitrary hundred would only mislead — and a failed lookup quietly leaves a plain input.

## Toolbar

- **Filters** — see above.
- **Import documents** — opens [`MongocampImport`](/components/mongocamp-import): load a JSON or CSV file, check the preview and insert it in batches. Not shown for GridFS bucket collections; the table reloads when rows were imported.
- **Columns** — a checklist of every data column; unchecked columns are hidden (and left out of the CSV export). Resets when you reload or switch collection.
- **Export** — downloads the rows **on the current page**, as JSON (full documents, extended JSON unwrapped to plain values) or CSV (visible columns; nested values as JSON; RFC 4180 quoting). No extra request is made, so export what you need page by page, or raise the page size first. An integer beyond 2^53 is written with every digit (a bare number in JSON). To export the whole collection or everything a filter matches, use [`useMongocampExportAll`](/composables/use-mongocamp-export-all).
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

A failed load shows a [`MongocampErrorAlert`](/components/mongocamp-error-alert) above the table (retry, or "log in again" when the session has expired) instead of an empty table, and an empty result shows an empty state. A search or filter the server rejects answers `400` (MongoCamp server 1.6.3+ sends CORS headers on errors, so the status is readable); when that happens while a search or filter is active the alert says **"The filter could not be applied"** and offers **Clear filters** (which drops the search and every condition). A 401 is shown as an expired session; any other failure keeps the generic message. No extra request is made.

## Without a write grant

The table is read-only for a user whose grant for this collection has no `write` — no insert, import, edit, delete or row selection (so no bulk edit or delete either); rows, filtering, sorting, the column menu and export stay. The decision comes from the grants in the session profile ([`useMongocampPermissions`](/composables/use-mongocamp-permissions)): administrators, [server proxy mode](/guide/server-proxy-auth), a profile without a grant list and GridFS bucket collections always keep every control, and the server refuses a write without a grant anyway — this only hides what could not work.

## Insert / Edit / Delete

- **Insert / Edit** — opens a form generated by `@sfxcode/nuxt-ui-formkit`'s `FUAutoForm`, which infers a FormKit schema directly from the currently-loaded page of rows (unwrapped via [`useMongocampExtendedJson`](/composables/use-mongocamp-extended-json)) — scalar fields, nested objects, and arrays (including arrays of objects, with `FUAutoForm`'s own add/clone/delete row controls) all render as real inputs instead of raw JSON. `_id` is stripped from the samples/form data before they ever reach `FUAutoForm`, so it never appears as an editable field — it is not something a document's own value should drive. Saving rewraps the form data back through `useMongocampExtendedJson`, stamps `metaData` via `useMongocampDocument`'s `ensureMetaData`, then calls `documentApi.insert` (any `_id` is stripped before sending). FormKit's internal `slots` form entry is dropped first so it never lands in a document.
- **Large integers stay exact.** MongoCamp sends a 64-bit integer with every digit, but the generated client's `JSON.parse` rounds anything beyond 2^53 (`9007199254740993` would show as `9007199254740992`, `9223372036854775807` as `9223372036854776000`). The component reads the response text itself (`utils/bigIntJson.ts`): such an integer is shown, edited and exported as its exact digits, and written back as `{ $numberLong }` when you change it. An untouched one is never part of an edit request. In the edit form it is a text field, and the filter builder still offers number operators for it.
- **Edit sends only what changed** — the edited document is compared with the row it was opened from (values compared as plain values, so a date or number that merely round-tripped through its extended-JSON wrapper — or a date the server prints without its zero milliseconds — is not a change) and sent with `documentApi.updateDocumentPartial`: a changed leaf of a nested object as a dotted key (`nested.y`), an array or a changed `$date`/`$oid`/number wrapper as a whole value, a removed field as `$unset`, plus `metaData.updatedBy`/`metaData.updated`. A concurrent change to another field of the same document is therefore not overwritten, and fields the form never saw are simply not part of the request. Nothing changed ⇒ the dialog closes without a request. If the server reports `matchedCount: 0` the document is gone and the dialog shows "The document no longer exists." A change a partial update cannot express (a top-level field name containing a dot or starting with `$`) falls back to the full `documentApi.update`. Helpers: `utils/documentDiff.ts`.
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

## Viewing documents

Every row has a **View** button (also without a write grant) that opens the document in a drawer with [`MongocampDocumentView`](/components/mongocamp-document-view): typed values, copy of path and value, tree or JSON. A **Table | JSON** switch in the toolbar shows the page as JSON text.

## Query bar

Below the toolbar sits a [`MongocampQueryBar`](/components/mongocamp-query-bar): the visual filter (button, count and chips), a **sort** (it follows clicks on the column headers), the **fields to load** and the recent/saved queries of the collection. The quick search stays as the simple mode and is ANDed with the bar's filter.

With fields chosen, only those are requested (`projection`); the other columns are hidden and **Edit** loads the complete document first, so a partial row is never written back. A failed load shows a toast and the form stays closed.
