# useMongocampImport

`importRows(collectionName, rows, options)` inserts documents into a collection in batches through `documentApi.insertMany` and returns what happened instead of stopping at the first failure. It is the engine behind [`MongocampImport`](/components/mongocamp-import) and works in session and [server proxy](/guide/server-proxy-auth) mode alike (it calls [`useMongocampClientApi`](/composables/use-mongocamp-client-api)).

```ts
const { importRows } = useMongocampImport()

const result = await importRows('customers', rows, {
  batchSize: 500,
  stampMetadata: true,
  signal: controller.signal,
  onProgress: ({ done, total }) => (progress.value = done / total),
})
// result.inserted, result.failedBatches, result.skipped, result.aborted
```

## Options

| Option | Default | Description |
|---|---|---|
| `batchSize` | `1000` | Rows per request. Clamped to 1–10 000. |
| `stampMetadata` | `false` | Adds `metaData` (`createdBy`/`updatedBy`/timestamps from the signed-in user) to a **copy** of each row; the input rows are not modified. |
| `signal` | — | An `AbortSignal`. It also aborts the request in flight. |
| `onProgress` | — | Called after every batch, failed ones included, with `{ done, total }`. |

Every batch also has a 60 second timeout (the generated client has none).

## Result

```ts
interface BatchInsertResult {
  inserted: number
  failedBatches: { start: number, count: number, error: unknown, mayBePartial: boolean }[]
  skipped: number // rows never sent because the run was aborted
  aborted: boolean
}
```

- Batches are sent **in order, one at a time**, and a failed batch does not stop the next one. `start`/`count` locate the failed rows in the input array.
- `mayBePartial` is `false` only for an HTTP 400: the server validates a batch before writing, so nothing from it was inserted. For any other error part of the batch may have been written — retrying it can create duplicates.
- An empty `rows` array sends nothing (the server answers 500 for an empty batch).

## Preparing the rows

The composable sends exactly what it is given. Turning a file into rows is done by pure helpers (not auto-imported, they live in `src/runtime/utils/`): `prepareImport` parses a JSON/CSV text, converts CSV cells by column type, unwraps extended JSON, drops and reports invalid rows (every error carries its file row), and enforces the 10 000-row / 5 MB limits. What the server stores differently from what you might expect:

- `{ "$date": … }` / `{ "$numberLong": … }` wrappers are stored as **literal sub-documents** — send dates as ISO strings **with milliseconds** (`2024-03-01T10:30:00.000Z`), which the server stores as real dates;
- `_id`, if present, must be a 24-character hex string;
- an integer beyond ±(2^53 − 1) cannot be sent as a JSON number without losing digits.

These were verified against a real MongoCamp server (1.5.x).
