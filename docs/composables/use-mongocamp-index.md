# useMongocampIndex

Wraps `indexApi` for MongoDB index management — used by [`MongocampCollectionInfos`](/components/mongocamp-collection-infos)'s Indexes card.

```ts
const {
  listIndexes,         // (collectionName: string) => Promise<MongoIndex[]>
  createIndex,          // (collectionName: string, keys: Record<string, number>, options?: IndexOptionsRequest) => Promise<IndexCreateResponse>
  createUniqueIndex,     // (collectionName: string, fieldName: string, sortAscending?: boolean) => Promise<IndexCreateResponse>
  createTextIndex,       // (collectionName: string, fieldName: string) => Promise<IndexCreateResponse>
  createExpiringIndex,   // (collectionName: string, fieldName: string, duration: string) => Promise<IndexCreateResponse>
  deleteIndex,           // (collectionName: string, indexName: string) => Promise<IndexDropResponse>
} = useMongocampIndex()
```

## Request shapes differ per creator

`createIndex` is the general-purpose compound-key creator — `keys`/`options` are nested under `indexCreateRequest` on the wire:

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

## `MongoIndex.keys` vs the create request's `keys`

The read model (`MongoIndex.keys`) is `Record<string, string>`; the create request's `keys` is `Record<string, number>` (sort direction `1`/`-1`). They are not symmetric — don't reuse a fetched index's `keys` value directly as input to `createIndex`.

## Deleting the default index

MongoDB won't let you drop the `_id_` index — `deleteIndex` will just return an error for it. `MongocampCollectionInfos` filters it out of the deletable rows client-side rather than relying on the API call to fail gracefully.
