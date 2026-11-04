# useMongocampCollectionCopy

Copy a collection's documents into a new collection, and make a quick timestamped backup. The logic behind [`MongocampCollectionCopy`](/components/mongocamp-collection-copy).

```ts
const { copyCollection, copyIndexes, backupCollection, retryBatches, listCollectionNames, countDocuments, collectionCount } = useMongocampCollectionCopy()

const result = await copyCollection({ source: 'orders', target: 'orders_2025', filter: 'year:2025', signal, onProgress })
const backup = await backupCollection({ source: 'orders' })   // → backup.target === 'orders_backup_20261104_153045'
```

## `copyCollection(options)`

Checks that `target` does not exist (read again right before writing, ignoring case), counts the documents, refuses above `maxDocuments` (default 50 000), reads the source in pages of 1 000 and writes batches of 1 000 through the importer. The documents are copied as the server gives them, **`_id` included**; no metadata is added.

Returns `{ refused?, sourceTotal, rows, inserted, failedBatches, skipped, aborted, totalChanged }`:

- `refused: 'target-exists' | 'too-many-documents'` — nothing was read or written.
- `rows` — the documents read, kept so `retryBatches(target, rows, failedBatches)` can send the failed batches again.
- `failedBatches` — `{ start, count, error, mayBePartial }` (`mayBePartial` is `false` only for a rejection before writing).
- `aborted` / `skipped` — a stop while writing; a stop while reading rejects with `AbortError` and writes nothing.
- `totalChanged` — the source changed while it was read.

## Copying the indexes

`copyCollection({ …, copyIndexes: true })` (also accepted by `backupCollection`) creates the indexes of the source on the target **after** the documents — only when every batch was written (also for an empty source). The result then has `indexes: { copied: string[], skipped: { name, reason }[], failed: { name, error }[] }`, or `indexesError` when the source's indexes could not be listed (the documents are still copied). Progress reports `phase: 'indexes'`.

`copyIndexes(source, target)` does the same on its own (the dialog calls it after a successful retry). Per index: name, field order, `unique` and `expireAfter` go through `createIndex(keys, options)`; a one-field text index through `createTextIndex`. Skip reasons: `multi-field-text`, `custom-weights`, `unsupported-key`, `unknown-key-order` (a custom-named compound index — the listing's key order is unreliable). The rules live in `utils/indexCopy.ts` (`planIndexCopy`).

## `backupCollection(options)`

The same copy without a name: `target` is `<source>_backup_<yyyymmdd>_<hhmmss>` in local time (`backupName` in `utils/collectionCopy.ts`: odd characters become `_`, a long name is shortened, `_2`, `_3` … when it exists). Takes the options of `copyCollection` minus `target`, plus `now` (the time in the name) and `onTarget(name)` (called before anything is read). Returns the same result with `target`. If another session takes the name meanwhile, a new name is chosen (up to three tries). Throws `CollectionNotCopyableError` for `mc_*`, GridFS halves and `system.*`.

## Not copied

Grants, the schema and bucket files; indexes only with `copyIndexes`. Not atomic, not a snapshot. Dates, 64-bit integers and ids keep their types (verified on server 1.6.3).
