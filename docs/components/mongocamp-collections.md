# MongocampCollections

Table of all collections in the default database, with document count, storage size, and index count. Each row links to the collection's info and data pages. Includes a client-side filter input and sortable column headers.

## Usage

```vue
<template>
  <MongocampCollections
    info-path="/secured/admin/collections"
    data-path="/secured/admin/collections"
    bucket-files-path="/secured/admin/buckets"
  />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `infoPath` | `string` | `/secured/admin/collections` | Base path for the info-page link: `<infoPath>/<name>` |
| `dataPath` | `string` | `/secured/admin/collections` | Base path for the data-page link: `<dataPath>/<name>/data` |
| `bucketFilesPath` | `string` | `/secured/admin/buckets` | Base path for the bucket file-browser link (bucket rows only): `<bucketFilesPath>/<bucketName>` — points at a consumer-owned page rendering [`MongocampBucketFiles`](/components/mongocamp-bucket-files) |

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

Rows for a `.files` or `.chunks` collection (detected via [`useMongocampBucket`](/composables/use-mongocamp-bucket)'s `isBucketCollection`) get three extra actions:

- **Browse files** — links to `<bucketFilesPath>/<bucketName>`, a consumer-owned page rendering [`MongocampBucketFiles`](/components/mongocamp-bucket-files) for that bucket
- **Clear bucket** — behind a confirmation modal, deletes every file in the bucket, keeps the bucket itself; refetches the collection list on success
- **Delete bucket** — behind a confirmation modal, drops both the `.files` and `.chunks` collections permanently; refetches the collection list on success

The `.files`/`.chunks` pair is **not** collapsed into a single row — each stays independently browsable via [`MongocampCollectionData`](/components/mongocamp-collection-data); the badge and bucket actions are just added to both rows.
