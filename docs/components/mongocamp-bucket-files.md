# MongocampBucketFiles

A dedicated file browser for one GridFS bucket: paginated, filterable, sortable table of the bucket's files (with clean `FileInformation` data — `filename`, size, upload date, metadata — no extended-JSON unwrapping needed), plus upload, download, delete, and rename/edit-metadata actions.

This is a *second*, purpose-built way to browse a bucket's files, alongside [`MongocampCollectionData`](/components/mongocamp-collection-data)'s existing generic raw-document view of the `<bucket>.files`/`<bucket>.chunks` collections — that view is unchanged and still works; this component adds a cleaner, action-rich alternative scoped to a single bucket.

## Usage

```vue
<script setup>
const route = useRoute()
const bucketName = route.params.bucket_name
</script>

<template>
  <MongocampBucketFiles :bucket-name="bucketName" />
</template>
```

Typically reached via [`MongocampCollections`](/components/mongocamp-collections)'s "Browse files" action on a bucket row (its `bucketFilesPath` prop, default `/secured/admin/buckets`) — the module doesn't own routing itself, so you provide the page that renders this component for a given `bucket_name` route param, matching the same pattern [`MongocampRoles`](/components/mongocamp-roles)' `grantsPath` uses for role grants.

## Props

| Prop | Type | Description |
|---|---|---|
| `bucketName` | `string` | The GridFS bucket to browse (no `.files`/`.chunks` suffix — the bare bucket name) |
| `hideRefresh` | `boolean` | Hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header. Default `false`. |

## In a page with its own header

The component can hand its toolbar to the page around it:

- **`refresh()`** is exposed — call it through a template ref from your own reload button, and set `hideRefresh` to drop the built-in one.
- **`toolbar` slot** — your own buttons, placed beside the built-in ones.
- **`changed` event** — emitted after a file was uploaded, renamed or deleted, once the component has reloaded. Never on a failed or cancelled action, never on a plain reload.

```vue
<script setup lang="ts">
const list = useTemplateRef<{ refresh: () => void }>('list')
</script>

<template>
  <header>
    <h1>My title</h1>
    <UButton icon="i-lucide-refresh-cw" @click="list?.refresh()" />
  </header>
  <MongocampBucketFiles ref="list" :bucket-name="name" hide-refresh @changed="reloadOtherLists">
    <template #toolbar>
      <UButton>Mine</UButton>
    </template>
  </MongocampBucketFiles>
</template>
```

## Columns

| Column | Description |
|---|---|
| Filename | Sortable |
| Size | Sortable by the underlying byte length; displayed human-readable (`B`/`KB`/`MB`/`GB`/`TB`) |
| Uploaded | Sortable by `uploadDate`; displayed via `toLocaleString()` |
| Metadata | A "N keys" button opening a read-only JSON view when the file has metadata, `—` otherwise |
| — | Download / rename / delete action buttons |

## Filtering, sorting, pagination

The filter input searches `filename` via a Lucene `like` expression (debounced, same convention as [`MongocampCollectionData`](/components/mongocamp-collection-data)). Sorting and pagination both refetch through [`useMongocampBucket`](/composables/use-mongocamp-bucket)'s `listFiles`, which reads the total row count from the `x-pagination-count-rows` response header. A search term that would make the URL too long for the server (over 1800 characters once URL-encoded) is refused with a clear error instead of an opaque network failure.

## Actions

- **Download** — reuses `useMongocampBucket`'s `downloadFile`, tracked via `downloadingFileIds`
- **Preview** — opens [`MongocampFilePreview`](/components/mongocamp-file-preview) in a drawer
- **Rename / edit metadata** — a dialog with the filename and the metadata as one **JSON text** (must be a single JSON object, empty = none; invalid text shows an error and disables Save), saved via `updateFileInformation`. Nested values are kept as typed
- **Delete** — behind a confirmation modal, calls `deleteFile`
- **Upload** — toolbar button (several files at once) **or drag and drop** files onto the component. Files go up one after the other via `uploadFiles`; progress ("Uploading 2 of 5") and a summary with the failed files (name and server message) are shown, a failure never stops the rest, and the table reloads when anything was uploaded

Download, rename and delete are tracked via `useMongocampBucket`'s own loading-state refs (`downloadingFileIds`, `fileActionInFlight`, `uploading`) and show success/error toasts from the composable itself — the component doesn't duplicate that feedback.

## Related

- [`useMongocampBucket`](/composables/use-mongocamp-bucket) — `listFiles`/`deleteFile`/`updateFileInformation`/`downloadFile`/`uploadFile`
- [`MongocampCollections`](/components/mongocamp-collections) — the `bucketFilesPath`-linked entry point
- [`MongocampCollectionData`](/components/mongocamp-collection-data) — the generic raw-document view that still covers `<bucket>.files`/`<bucket>.chunks` collections directly

## Distribution of the stored files

A collapsed **Distribution of the stored files** section charts one field of the bucket's `<bucket>.files` collection ([`MongocampCollectionCharts`](/components/mongocamp-collection-charts)): by default the `contentType` (or `metadata.contentType`), else the `uploadDate` (documents per month), else the first field with something to count; the field select offers text, number, date and boolean fields ([`useMongocampFieldTypes`](/composables/use-mongocamp-field-types)). **Nothing is requested until the section is opened.** It is hidden for a user who may not read `<bucket>.files` (the server's answer from `GET /auth/permissions`; the profile's grants until it arrives), and says so when no field can be charted.

