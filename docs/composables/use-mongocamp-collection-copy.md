# useMongocampCollectionCopy

Copy a collection into a new one, make a quick timestamped backup, and rename a collection — all **inside the database** (server 1.8.1, `POST …/collections/{name}/copy` and `…/rename`). The logic behind [`MongocampCollectionCopy`](/components/mongocamp-collection-copy) and [`MongocampCollectionRename`](/components/mongocamp-collection-rename).

```ts
const { copyCollection, backupCollection, renameCollection, listCollectionNames, countDocuments } = useMongocampCollectionCopy()

const result = await copyCollection({ source: 'orders', target: 'orders_2025', filter: 'year:2025', withIndexes: true, signal })
// → { target: 'orders_2025', count: 1834, indexes: 2 }
const backup = await backupCollection({ source: 'orders', withIndexes: true })   // backup.target === 'orders_backup_20261104_153045'
await renameCollection('orders_2025', 'orders_archive')                           // → { target: 'orders_archive' }
```

## `copyCollection(options)`

One request. The server copies with its own checks — no cap, nothing held in the browser, and the copy is a snapshot taken by the server (before 1.8.1 the browser read every page and wrote batches, capped at 50 000 documents). `filter` is a Lucene filter (only matching documents are copied). With `withIndexes` the server recreates every index except `_id_` from the **real index specifications** (compound order, unique, expiry, partial filter, text weights, collation) — nothing is skipped or approximated any more. Grants, the schema and GridFS files are not copied.

Returns `{ target, count, indexes }` (documents in the new collection, indexes created). A target that exists (`409`, code `4091`) is returned as `{ refused: 'target-exists', target, count: 0, indexes: 0 }`; every other refusal (a reserved name: `400`, code `4007`) is thrown so the caller can show the server's message.

## `backupCollection(options)`

The same copy without a name: `target` is `<source>_backup_<yyyymmdd>_<hhmmss>` in local time (`backupName` in `utils/collectionCopy.ts`: odd characters become `_`, a long name is shortened, `_2`, `_3` … when it exists). Takes the options of `copyCollection` minus `target`, plus `now` (the time in the name) and `onTarget(name)` (called before the request). If another session takes the name meanwhile, a new name is chosen (up to three tries). Throws `CollectionNotCopyableError` for `mc_*`, GridFS halves and `system.*`.

## `renameCollection(source, target, signal?)`

Documents and indexes stay, the name changes. **Grants are matched by name**: every grant for the old name stops applying and none exists for the new one — grant the new name again. Returns `{ target }`, or `{ refused: 'target-exists', target }` for a name that exists.

## Helpers

`listCollectionNames()` and `countDocuments(collection, filter?)` (the count endpoint, see [`useMongocampBulkByFilter`](/composables/use-mongocamp-bulk-by-filter)). The name rules (`validateTargetName`, `backupName`, `canCopyCollection`) are pure functions in `utils/collectionCopy.ts`.
