# useMongocampIndex

Wraps `indexApi` for MongoDB index management — used by [`MongocampCollectionInfos`](/components/mongocamp-collection-infos)'s Indexes card.

::: warning Prefer the 1.8 calls
`listIndexes` (unordered keys) and `createIndex` (unordered `keys` map) are kept for apps and are **deprecated**: use [`listIndexDetails` and `createOrderedIndex`](#listindexdetails-and-createorderedindex-server-1-8-1), which keep a compound index's field order and take `sparse`, `hidden`, partial filters and more. The module's own components use the new calls only (and `createExpiringIndex`, `createIndexForField`).
:::

```ts
const {
  listIndexes,         // (collectionName: string) => Promise<MongoIndex[]> — the old, unordered listing
  listIndexDetails,    // (collectionName: string) => Promise<IndexInfo[]> — ordered keys and all options (server 1.8.1)
  createOrderedIndex,  // (collectionName: string, orderedKeys: { field, direction }[], options?: IndexOptionsRequest) => Promise<IndexCreateResponse>
  createIndex,          // (collectionName: string, keys: Record<string, number>, options?: IndexOptionsRequest) => Promise<IndexCreateResponse>
  createIndexForField,   // (collectionName: string, fieldName: string, sortAscending?: boolean) => Promise<IndexCreateResponse>
  createUniqueIndex,     // (collectionName: string, fieldName: string, sortAscending?: boolean) => Promise<IndexCreateResponse>
  createTextIndex,       // (collectionName: string, fieldName: string) => Promise<IndexCreateResponse>
  createExpiringIndex,   // (collectionName: string, fieldName: string, duration: string) => Promise<IndexCreateResponse>
  deleteIndex,           // (collectionName: string, indexName: string) => Promise<IndexDropResponse>
} = useMongocampIndex()
```

## `listIndexDetails` and `createOrderedIndex` (server 1.8.1)

`listIndexDetails` calls `GET …/index/details` (15 s timeout) and returns, per index, the keys as an **ordered** array `{ field, direction }` (`direction` is the text `'1'`, `'-1'` or `'text'`) with `unique`, `sparse`, `hidden`, `weights`, `defaultLanguage`, `expireAfterSeconds` and `collation` — what [`MongocampIndexes`](/components/mongocamp-indexes) shows. `partialFilterExpression` is listed but **garbled by the server** (`{ "n": { "underlying": null } }`): treat it as "there is one".

`createOrderedIndex` creates from the same ordered keys, so the field order of a compound index is kept, and takes the options of the newer servers (`unique`, `sparse`, `hidden`, `name`, `partialFilterExpression`, `weights`, `defaultLanguage`, `collation`):

```ts
await createOrderedIndex('users', [{ field: 'country', direction: '1' }, { field: 'age', direction: '-1' }], { name: 'by_country_age', hidden: true })
await createOrderedIndex('posts', [{ field: 'title', direction: 'text' }, { field: 'body', direction: 'text' }], { defaultLanguage: 'english' }) // one text index over several fields
```

Refusals (verified live): a direction other than `1`/`-1`/`text` is a `400` (code `4006`), `sparse` together with `partialFilterExpression` a `400` (code `67`), a unique index over duplicate data a `409` (code `11000`), dropping `_id_` a `400` (code `72`), dropping a missing index a `404` (code `27`).

## Request shapes differ per creator

`createIndex` is the general-purpose compound-key creator (verified on server 1.6.3: several keys, `unique: true` for a compound unique index, `name`, `expireAfter`; the key order of a compound index is only kept in its name — the listing is unordered; the server also accepts a direction other than `1`/`-1`, e.g. `z_5`, so validate before sending) — `keys`/`options` are nested under `indexCreateRequest` on the wire:

```ts
await createIndex('users', { email: 1 }, { unique: true })
// → indexApi.createIndex({ collectionName, indexCreateRequest: { keys: { email: 1 }, indexOptionsRequest: { unique: true } } })
```

`createUniqueIndex`/`createTextIndex`/`createExpiringIndex` are single-field convenience creators with **flat** parameters (no nested request object) — don't assume they share `createIndex`'s shape:

```ts
await createUniqueIndex('users', 'email', false)   // sortAscending, not a keys map
await createTextIndex('users', 'name')
await createExpiringIndex('sessions', 'createdAt', '3600s')
```

## `createIndexForField`

A plain single-field index in one call (`sortAscending` defaults to `true`), with a 15 s timeout — used by the "Index this field" column menu of [`MongocampCollectionData`](/components/mongocamp-collection-data). Like the other single-field creators it takes flat parameters. A refusal from the server is rethrown unchanged; requesting an index that already exists is not a refusal (MongoDB answers with the existing name).

## `MongoIndex.keys` vs the create request's `keys`

The read model (`MongoIndex.keys`) is `Record<string, string>`; the create request's `keys` is `Record<string, number>` (sort direction `1`/`-1`). They are not symmetric — don't reuse a fetched index's `keys` value directly as input to `createIndex`.

## Deleting the default index

MongoDB won't let you drop the `_id_` index — `deleteIndex` will just return an error for it. `MongocampCollectionInfos` filters it out of the deletable rows client-side rather than relying on the API call to fail gracefully.
