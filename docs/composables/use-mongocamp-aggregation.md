# useMongocampAggregation

Aggregation, distinct values and sampling over `collectionApi.aggregate` / `distinct`, with timeouts, defensive result handling and readable errors. It is the engine behind [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder), the value suggestions in [`MongocampFilterBuilder`](/components/mongocamp-filter-builder) and the field statistics in [`MongocampCollectionInfos`](/components/mongocamp-collection-infos), and works in session and [server proxy](/guide/server-proxy-auth) mode alike (it calls [`useMongocampClientApi`](/composables/use-mongocamp-client-api)).

```ts
const { runAggregation, listDistinct, listFieldNames, sampleDocuments, describeAggregationError } = useMongocampAggregation()

const { rows, total, pages, page } = await runAggregation('customers', [
  { stage: '$group', value: { _id: '$country', n: { $sum: 1 } } },
  { stage: '$sort', value: { n: -1 } },
], { page: 1, rowsPerPage: 20 })
```

## `runAggregation(collection, pipeline, { page, rowsPerPage }, { allowStatsStages })`

`pipeline` is `{ stage: '$match', value: <JSON> }[]` — `value` is real JSON (a number for `$limit`, an object for most stages), not a string. Returns:

```ts
{ rows: Record<string, unknown>[], total: number, pages: number, page: number }
```

`total`, `pages` and `page` come from the server's `x-pagination-*` headers (falling back to the row count, `1` and the requested page); `rowsPerPage` defaults to the server's 100. Entries that are not objects are dropped. The request has a 30 s timeout and always sends `allowDiskUse: false` (the server requires the field).

- **Refuses forbidden pipelines.** Before any request, a pipeline using `$out`, `$merge`, `$function`, `$accumulator`, `$where`, `$lookup`, `$unionWith`, `$graphLookup`, `$collStats` or `$indexStats` — as a stage or nested at any depth — is rejected with a `ForbiddenPipelineError` (`.findings` lists operator, stage and path). Since 1.6.3 the server refuses `$function`, `$accumulator`, `$where`, `$out`, `$merge` and `$currentOp` itself (`403`, code `4031`), but it still runs `$lookup`, `$unionWith` and `$graphLookup` across collections (and `$collStats`, `$indexStats`), so this check stays as early feedback and as the gate for those.
- **Stats stages are opt-in.** `$collStats` and `$indexStats` work on the server (storage numbers, per-index usage) but every result row carries the database server's address (`host`) and its `<database>.<collection>` name (`ns`). `runAggregation(collection, pipeline, paging, { allowStatsStages: true })` lets a pipeline use exactly those two — every other denied operator stays refused — and removes `host` and `ns` from the top level of every row (`stripServerFields`). It is for the module's own storage and index-usage calls; the aggregation builder never sets it. Ordinary results are never stripped (a document may have a field called `host`).
- **An empty result is an empty page.** Since server 1.6.1 an aggregation with no documents answers `200 []` with a count of `0`. Older servers (1.5.x) answered `500 "Index 0 out of bounds for length 0"`, which is no longer special-cased and rejects like any other error.

`runAggregation`'s fourth argument also takes `signal`: aborting rejects the call (an `AbortError`) on top of the 30 s timeout — the builder's stage previews use it to drop a run that is out of date.

## `listFieldNames(collection)`

The top-level field names the server knows for a collection, sorted (the server lists them unordered; nested paths are not included). 15 s timeout. For suggestions only — the builder's templates offer them while you type.

## `listDistinct(collection, field, limit = 100)`

Distinct values of a field: `{ values, total, truncated }`. Only strings, numbers and booleans are returned — `null` (which is what the server answers for a field nobody has), arrays (not unwound) and objects are dropped. The values are in no particular order. `truncated` is `true` when the field has more distinct values than `limit`. 15 s timeout.

## `sampleDocuments(collection, size = 500)`

A random sample in one page — an aggregation with `$sample`, `size` clamped to 1–1 000. Same result shape as `runAggregation`. This is how the field statistics are computed: the server's own `getSchemaAnalysis` is **not used**: the client-side sample needs no extra request and behaves the same on every server version. (Up to 1.5.x that endpoint returned an accumulation of every analysis since the server started, across collections — an information leak; it is clean since 1.6.1, re-verified on 1.6.3, so it could be offered for whole-collection scans.)

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

Verified against MongoCamp 1.5.10 and unchanged on 1.6.3 (2026-11-03):

- results are plain JSON: dates as ISO strings without milliseconds, `_id` as a hex string, 64-bit integers as bare numbers with every digit — `runAggregation` and `listDistinct` read the response text themselves and return an integer beyond ±(2^53 − 1) as its exact digit string, because the generated client's `JSON.parse` would round it (`$numberInt` / `$numberDecimal` wrappers in a result become numbers);
- `distinct` answers with native values although the generated client types it as `string[]`;
- the generated client types a stage's `value` as `string`; the server wants JSON (the composable casts).

## Related

- [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder)
- [`useMongocampQuery`](/composables/use-mongocamp-query) — Lucene filters for the document list; aggregation `$match` uses MongoDB query syntax instead
