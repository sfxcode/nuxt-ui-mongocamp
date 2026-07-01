# MongocampCollections

Table of all collections in the default database, with document count, storage size, and index count. Each row links to the collection's info and data pages. Includes a client-side filter input and sortable column headers.

## Usage

```vue
<template>
  <MongocampCollections
    info-path="/secured/admin/collections"
    data-path="/secured/admin/collections"
  />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `infoPath` | `string` | `/secured/admin/collections` | Base path for the info-page link: `<infoPath>/<name>` |
| `dataPath` | `string` | `/secured/admin/collections` | Base path for the data-page link: `<dataPath>/<name>/data` |

## Columns

| Column | Description |
|---|---|
| Collection | Name, sortable — GridFS bucket collections (`.files`/`.chunks`) show a "bucket" badge |
| Documents | Document count |
| Size (KB) | Storage size |
| Indexes | Index count |
| — | Info / data action buttons, plus bucket actions on bucket-backed rows |

## Behavior

- Fetched via `collectionApi.listCollections()` + `collectionApi.getCollectionInformation()` per collection.
- Collections whose name starts with `mc` (MongoCamp's internal collections) are filtered out.
- The filter input matches client-side against the already-loaded rows.

## Bucket actions

Rows for a `.files` or `.chunks` collection (detected via [`useMongocampBucket`](/composables/use-mongocamp-bucket)'s `isBucketCollection`) get two extra actions, both behind a confirmation modal and both refetching the collection list on success:

- **Clear bucket** — deletes every file in the bucket, keeps the bucket itself
- **Delete bucket** — drops both the `.files` and `.chunks` collections permanently

The `.files`/`.chunks` pair is **not** collapsed into a single row — each stays independently browsable via [`MongocampCollectionData`](/components/mongocamp-collection-data); the badge and bucket actions are just added to both rows.
