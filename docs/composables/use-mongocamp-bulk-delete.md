# useMongocampBulkDelete

`runBulkDelete(items, remove, concurrency = 5)` runs `remove` for every item, a few at a time, and returns what happened instead of stopping at the first error.

```ts
const { runBulkDelete } = useMongocampBulkDelete()
const { deleted, failed } = await runBulkDelete(['a@x.io', 'b@x.io'], id => deleteUser(id))
// deleted: items that were removed; failed: [{ item, error }] — both keep input order
```

Used by `MongocampUsers`, `MongocampRoles` and `MongocampCollectionData`; the UI side is [`MongocampBulkDelete`](/components/mongocamp-bulk-delete).
