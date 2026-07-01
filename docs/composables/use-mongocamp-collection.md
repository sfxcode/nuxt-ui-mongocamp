# useMongocampCollection

Reactive state for paginated collection queries. Each call returns a fresh, independent set of refs — call it once per component instance that owns a query.

```ts
const {
  filter,     // Ref<string | undefined>       — MongoDB/Lucene filter expression
  sort,       // Ref<string[] | undefined>      — sort fields
  projection, // Ref<string[] | undefined>      — field projection
  pagination, // Ref<{ pageIndex: number, pageSize: number }>
  total,      // Ref<number>                    — total document count
} = useMongocampCollection()
```

Defaults: `pagination.value = { pageIndex: 1, pageSize: 20 }`, `total.value = 0`.

## Typical usage with `documentApi.listDocumentsRaw`

```ts
const { pagination, total } = useMongocampCollection()

async function fetchDocuments() {
  const res = await documentApi.listDocumentsRaw({
    collectionName,
    rowsPerPage: pagination.value.pageSize,
    page: pagination.value.pageIndex,
  })
  total.value = +(res.raw.headers.get('x-pagination-count-rows') ?? 0)
  const rows = await res.value()
}
```

Use `listDocumentsRaw` (not `listDocuments`) so you can read the `x-pagination-count-rows` response header — it reflects the filtered count, not the collection total, and there's no other way to get an accurate count when a filter is applied.

Drive pagination via `UPagination`'s `@update:page` event rather than a `watch` on `pagination.value.pageIndex`, to avoid a race where a reload fires before the page has actually reset to 1.
