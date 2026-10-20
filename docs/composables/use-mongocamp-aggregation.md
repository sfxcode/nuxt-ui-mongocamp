# useMongocampAggregation

Aggregation, distinct values and sampling over `collectionApi.aggregate` / `distinct`, with timeouts, defensive result handling and readable errors. It is the engine behind [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder), the value suggestions in [`MongocampFilterBuilder`](/components/mongocamp-filter-builder) and the field statistics in [`MongocampCollectionInfos`](/components/mongocamp-collection-infos), and works in session and [server proxy](/guide/server-proxy-auth) mode alike (it calls [`useMongocampClientApi`](/composables/use-mongocamp-client-api)).

```ts
const { runAggregation, listDistinct, sampleDocuments, describeAggregationError } = useMongocampAggregation()

const { rows, total, pages, page } = await runAggregation('customers', [
  { stage: '$group', value: { _id: '$country', n: { $sum: 1 } } },
  { stage: '$sort', value: { n: -1 } },
], { page: 1, rowsPerPage: 20 })
```

## `runAggregation(collection, pipeline, { page, rowsPerPage })`

`pipeline` is `{ stage: '$match', value: <JSON> }[]` — `value` is real JSON (a number for `$limit`, an object for most stages), not a string. Returns:

```ts
{ rows: Record<string, unknown>[], total: number, pages: number, page: number }
```

`total`, `pages` and `page` come from the server's `x-pagination-*` headers (falling back to the row count, `1` and the requested page); `rowsPerPage` defaults to the server's 100. Entries that are not objects are dropped. The request has a 30 s timeout and always sends `allowDiskUse: false` (the server requires the field).

- **Refuses forbidden pipelines.** Before any request, a pipeline using `$out`, `$merge`, `$function`, `$accumulator`, `$where`, `$lookup`, `$unionWith` or `$graphLookup` — as a stage or nested at any depth — is rejected with a `ForbiddenPipelineError` (`.findings` lists operator, stage and path). The server does not restrict stages itself.
- **An empty result is an empty page.** The server answers an aggregation with no documents at all with `500 "Index 0 out of bounds for length 0"` (on existing collections too). `runAggregation` turns exactly that error into `{ rows: [], total: 0, pages: 0, page }`. Any other error rejects with the original error.

## `listDistinct(collection, field, limit = 100)`

Distinct values of a field: `{ values, total, truncated }`. Only strings, numbers and booleans are returned — `null` (which is what the server answers for a field nobody has), arrays (not unwound) and objects are dropped. The values are in no particular order. `truncated` is `true` when the field has more distinct values than `limit`. 15 s timeout.

## `sampleDocuments(collection, size = 500)`

A random sample in one page — an aggregation with `$sample`, `size` clamped to 1–1 000. Same result shape as `runAggregation`. This is how the field statistics are computed: the server's own `getSchemaAnalysis` is **not used** because (1.5.10) it returns an accumulation of every analysis since the server started, across collections — a cross-collection information leak that also grows with every call.

## `describeAggregationError(error)`

Async, because the server explains a failure in the response body. Returns `{ kind, message }`:

| `kind` | When |
|---|---|
| `forbidden` | a `ForbiddenPipelineError`; the message names the operator |
| `retryable` | an unexpected `405` (an intermittent proxy response) |
| `mongo` | MongoDB rejected a command; `message` is **only** MongoDB's own text |
| `network` / `unauthorized` / `forbidden-access` / `other` | the shared mapping of [`useMongocampError`](/composables/use-mongocamp-error) |

The server's raw error contains the address of the database server (`… on server host:port. …`); it is removed from every message this returns.

## What the server does that you might not expect

Verified against MongoCamp 1.5.10:

- results are plain JSON: dates as ISO strings without milliseconds, `_id` as a hex string, 64-bit integers as bare numbers (rounded beyond 2^53);
- `distinct` answers with native values although the generated client types it as `string[]`;
- the generated client types a stage's `value` as `string`; the server wants JSON (the composable casts).

## Related

- [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder)
- [`useMongocampQuery`](/composables/use-mongocamp-query) — Lucene filters for the document list; aggregation `$match` uses MongoDB query syntax instead
