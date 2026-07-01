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
| Collection | Name, sortable |
| Documents | Document count |
| Size (KB) | Storage size |
| Indexes | Index count |
| — | Info / data action buttons |

## Behavior

- Fetched via `collectionApi.listCollections()` + `collectionApi.getCollectionInformation()` per collection.
- Collections whose name starts with `mc` (MongoCamp's internal collections) are filtered out.
- The filter input matches client-side against the already-loaded rows.
