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
| `canManage` | `boolean` | `true` | Set to `false` to hide **Clear** and **Drop** for ordinary collections even for an admin |

## Events

| Event | Description |
|---|---|
| `changed` | A collection or bucket was cleared or dropped/deleted and the list has been refreshed |

## Columns

| Column | Description |
|---|---|
| Collection | Name, sortable — GridFS bucket collections (`.files`/`.chunks`) show a "bucket" badge |
| Documents | Document count |
| Size (KB) | Storage size |
| Indexes | Index count |
| — | Info / data action buttons, clear / drop on ordinary collections (admins), bucket actions on bucket-backed rows |

## Behavior

- Fetched via `collectionApi.listCollections()` + `collectionApi.getCollectionInformation()` per collection.
- Collections whose name starts with `mc` (MongoCamp's internal collections) are filtered out.
- The filter input matches client-side against the already-loaded rows.

## Clear and drop

Admins (`useMongocampRoles().isAdmin`) get two more actions on every ordinary collection:

- **Clear collection** — deletes every document, keeps the collection (and its indexes).
- **Drop collection** — deletes the collection with all its documents and indexes.

Both sit behind a [`MongocampConfirmByName`](/components/mongocamp-confirm-by-name) modal: nothing happens until the exact collection name is typed, and a refused call (for example `403`) keeps the modal open with the reason. On success a toast appears, the list is refetched and `changed` is emitted. Both are irreversible.

They are never offered for MongoCamp's own `mc_*` collections or for the `.files`/`.chunks` halves of a GridFS bucket — those go through the bucket actions below, which handle both halves. The rule is the pure predicate `isProtectedCollection` in `src/runtime/utils/collectionProtection.ts`. Non-admins see neither action, and `canManage="false"` hides them for everyone.

::: warning Server proxy mode
With [`useServerProxy`](/guide/server-proxy-auth) the browser never logs in, so the `isAdmin` check above can't protect anything: every visitor of your app can reach these buttons, and the request runs with the api key's full power. Guard the proxy route with the `mongocamp-proxy:authorize` hook, or hide the actions with `canManage="false"`.
:::

## Bucket actions

Rows for a `.files` or `.chunks` collection (detected via [`useMongocampBucket`](/composables/use-mongocamp-bucket)'s `isBucketCollection`) get three extra actions:

- **Browse files** — links to `<bucketFilesPath>/<bucketName>`, a consumer-owned page rendering [`MongocampBucketFiles`](/components/mongocamp-bucket-files) for that bucket
- **Clear bucket** — behind a type-the-bucket-name confirmation ([`MongocampConfirmByName`](/components/mongocamp-confirm-by-name)), deletes every file in the bucket, keeps the bucket itself; refetches the collection list on success
- **Delete bucket** — behind the same confirmation, drops both the `.files` and `.chunks` collections permanently; refetches the collection list on success

The bucket actions are shown to every user (the server enforces permissions); a failed action keeps the modal open with a message.

The `.files`/`.chunks` pair is **not** collapsed into a single row — each stays independently browsable via [`MongocampCollectionData`](/components/mongocamp-collection-data); the badge and bucket actions are just added to both rows.
