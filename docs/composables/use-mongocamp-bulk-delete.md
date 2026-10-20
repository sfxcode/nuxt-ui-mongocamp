# useMongocampBulkDelete

`runBulkDelete(items, remove, concurrency = 5, removeMany?)` runs `remove` for every item, a few at a time, and returns what happened instead of stopping at the first error.

```ts
const { runBulkDelete } = useMongocampBulkDelete()
const { deleted, failed } = await runBulkDelete(['a@x.io', 'b@x.io'], id => deleteUser(id))
// deleted: items that were removed; failed: [{ item, error }] — both keep input order
```

## One request per chunk

Pass `removeMany` when the backend can delete several items in one call (as `documentApi.deleteMany` can):

```ts
await runBulkDelete(ids, id => documentApi._delete({ collectionName, documentId: id }), 5, {
  canHandle: isObjectIdHex, // items it cannot address go straight to `remove`
  run: async chunk => (await documentApi.deleteMany({ collectionName, requestBody: filterFor(chunk) })).deletedCount,
  chunkSize: 100, // default
})
```

- `run` receives chunks of up to `chunkSize` items (never an empty one — an empty filter would delete the whole collection) and returns how many it deleted.
- A chunk whose `run` throws, returns no count, or returns a count below the chunk size is deleted again one by one with `remove`. That is safe to repeat: deleting something that is already gone must be harmless (it is, on the MongoCamp server: 200 with a count of 0). A short count is therefore never reported as success.
- The result keeps the input order, exactly as without `removeMany`.

Used by `MongocampUsers`, `MongocampRoles` and `MongocampCollectionData`; the UI side is [`MongocampBulkDelete`](/components/mongocamp-bulk-delete).
