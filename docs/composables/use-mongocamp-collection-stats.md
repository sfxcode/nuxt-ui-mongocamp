# useMongocampCollectionStats

Typed storage and index-usage numbers of one collection — the data behind a storage card or an "unused indexes" hint. Both calls have a 15 s limit and go through the normal client (session or server-proxy mode).

```ts
const { getStorage, getIndexUsage } = useMongocampCollectionStats()

const storage = await getStorage('orders')
// { collectionType, count, size, storageSize, avgObjSize, indexCount, indexSizes, totalIndexSize }  (bytes)

const usage = await getIndexUsage('orders')
// [{ name: 'name_1', key: { name: 1 }, ops: 2, since: '2026-11-04T01:53:46.513Z', unused: false }, …]
```

## `getStorage(collection)`

From the server's collection information. `size` is the uncompressed size of the documents, `storageSize` the size on disk, `indexSizes` the bytes per index name. A missing or malformed number becomes `0` rather than `NaN`. The database name (`ns`) the server sends is not carried over.

## `getIndexUsage(collection)`

From a `$indexStats` aggregation. `ops` counts the operations that used the index **since `since`** — MongoDB resets the counters when the server restarts, so `unused: true` means "not used since then", a candidate to look at, not proof; never drop `_id_`.

::: warning The server leaks its address here
The raw `$indexStats` (and `$collStats`) result contains `host` (the database server's address), `ns` and the index `spec`. The module strips them before the rows reach you; if you run these stages yourself, drop them too. Because the stage is deny-listed for ordinary pipelines, `getIndexUsage` goes through the internal gated path only.
:::

Verified against server 1.6.3 on a scratch collection: `count`, the number of indexes and `totalIndexSize = sum(indexSizes)` match the collection info card, and `ops` rises after a filtered read.
