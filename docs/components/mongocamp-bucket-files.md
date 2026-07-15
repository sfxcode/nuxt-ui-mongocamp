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

## Columns

| Column | Description |
|---|---|
| Filename | Sortable |
| Size | Sortable by the underlying byte length; displayed human-readable (`B`/`KB`/`MB`/`GB`/`TB`) |
| Uploaded | Sortable by `uploadDate`; displayed via `toLocaleString()` |
| Metadata | A "N keys" button opening a read-only JSON view when the file has metadata, `—` otherwise |
| — | Download / rename / delete action buttons |

## Filtering, sorting, pagination

The filter input searches `filename` via a Lucene `like` expression (debounced, same convention as [`MongocampCollectionData`](/components/mongocamp-collection-data)). Sorting and pagination both refetch through [`useMongocampBucket`](/composables/use-mongocamp-bucket)'s `listFiles`, which reads the total row count from the `x-pagination-count-rows` response header.

## Actions

- **Download** — reuses `useMongocampBucket`'s `downloadFile`, tracked via `downloadingFileIds`
- **Rename / edit metadata** — opens a `FUDataEdit` form (filename input + a `nuxtUIRepeater` of key/value pairs for metadata) and saves via `updateFileInformation`
- **Delete** — behind a confirmation modal, calls `deleteFile`
- **Upload** — toolbar button reusing `uploadFile`, refetches the table on success

All four actions are tracked via `useMongocampBucket`'s own loading-state refs (`downloadingFileIds`, `fileActionInFlight`, `uploading`) and show success/error toasts from the composable itself — the component doesn't duplicate that feedback.

## Related

- [`useMongocampBucket`](/composables/use-mongocamp-bucket) — `listFiles`/`deleteFile`/`updateFileInformation`/`downloadFile`/`uploadFile`
- [`MongocampCollections`](/components/mongocamp-collections) — the `bucketFilesPath`-linked entry point
- [`MongocampCollectionData`](/components/mongocamp-collection-data) — the generic raw-document view that still covers `<bucket>.files`/`<bucket>.chunks` collections directly
