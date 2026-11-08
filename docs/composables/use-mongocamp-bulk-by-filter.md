# useMongocampBulkByFilter

Count, delete and update by the **Lucene filter** of the document list — one request each (server 1.7.0). No ids are collected, so there is no cap, no id snapshot and nothing to chunk.

```ts
const { countDocuments, deleteByFilter, updateByFilter } = useMongocampBulkByFilter()

const n = await countDocuments('orders', 'status:open')                 // GET …/documents/count?filter=
const deleted = await deleteByFilter('orders', 'status:cancelled')      // DELETE …/documents/many/delete?filter= (body {})
const { matched, modified } = await updateByFilter('orders', 'status:open', { status: 'archived' })
```

| Function | Returns |
|---|---|
| `countDocuments(collection, filter?, signal?)` | the number of matching documents |
| `deleteByFilter(collection, filter?, signal?)` | the server's `deletedCount` |
| `updateByFilter(collection, filter, document, signal?)` | `{ matched, modified }`; `document` is set on every match (`$set`) |

## Empty filter

An empty filter would touch the whole collection. The server only does that with `matchAll=true`, so the composable sends it **exactly when the filter is empty** — the caller's own confirmation (the typed collection name in [`MongocampCollectionData`](/components/mongocamp-collection-data#select-all-matching)) is the guard.

## Server facts

Verified live on server 1.8.1 (`brain/project/mongocamp-server-1-8-1-endpoints.md`): the Lucene filter goes in the `filter` query parameter and the body is empty (`{}` for delete, `{ document, filter: {} }` for update) — a filter in both places is refused with `400`, code `4004`; no filter at all without `matchAll` is `400`, code `4003`. A filter that matches nothing changes nothing. The server loads the matching documents for its events, so very large matches use memory in proportion.
