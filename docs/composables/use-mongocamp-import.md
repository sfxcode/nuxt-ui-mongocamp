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
  rowErrors: { index: number, code?: number, message: string }[] // rows the server refused one by one
  skipped: number // rows never sent because the run was aborted
  aborted: boolean
}
```

- Batches are sent **in order, one at a time**, and a failed batch does not stop the next one. `start`/`count` locate the failed rows in the input array.
- `mayBePartial` is `false` only for an HTTP 400: the server validates a batch before writing, so nothing from it was inserted. For any other error part of the batch may have been written — retrying it can create duplicates.
- Batches are sent with **`ordered: false`** (server 1.7.0): a document the server refuses — typically a duplicate key — no longer stops the rest of its batch. The answer says how many landed (`inserted` counts exactly those) and which rows did not: they are in `rowErrors` (`index` is the position in the input) **and** also appear in `failedBatches` as ranges (neighbouring rows with the same message are one range, `mayBePartial: false` — they are known not to have been written), so lists and "retry failed rows" work unchanged.
- An empty `rows` array sends nothing (the server answers 500 — 400 since 1.6.3 — for an empty batch).

## `importNdjson(collection, file, { signal })` (server 1.8.1)

Sends a **NDJSON file** — one JSON document per line, as the export writes it — to the server as it is (`POST …/documents/import`). The `File`/`Blob` itself is the request body, so the browser streams it from disk: nothing is parsed or held in memory, there is **no row cap** (the server answers `413` above its `IMPORT_MAX_BYTES`) and no time limit. Each line is read like the body of an insert: extended-JSON wrappers are honoured and a timestamp-shaped string becomes a date; no metadata is stamped. The documents are stored in unordered batches, so a line that cannot be stored does not stop the others.

```ts
const result = await importNdjson('people', file)
// { read: 20001, inserted: 19997, failed: 4, errors: [{ index: 2, code: 4008, message }], errorsTruncated: false }
```

`errors[].index` is the **1-based line number** (blank lines count) and the list is limited (`errorsTruncated`). Verified live: 20 001 lines took 1.9 s, wrappers and a bare `9007199254740993` were stored exactly. The wizard offers this for `.ndjson` / `.jsonl` files; JSON arrays and CSV still go through `importRows` below (type inference, validation, metadata stamping and retry).

## Preparing the rows

The composable sends exactly what it is given. Turning a file into rows is done by pure helpers (not auto-imported, they live in `src/runtime/utils/`): `prepareImport` parses a JSON/CSV text, converts CSV cells by column type, unwraps extended JSON, drops and reports invalid rows (every error carries its file row), and enforces the 10 000-row / 5 MB limits. What the server stores differently from what you might expect:

- dates: the importer unwraps `{ "$date": … }` and writes ISO strings **with milliseconds** (`2024-03-01T10:30:00.000Z`). Server 1.6.3 stores these — and `{ "$date" }` / `{ "$numberLong" }` wrappers and ISO strings without milliseconds — as real dates (1.5.x stored the wrappers as literal sub-documents); a bare `2024-03-01` string stays plain text, so a full timestamp is always written;
- `_id`, if present, must be a 24-character hex string;
- an integer beyond ±(2^53 − 1) cannot be sent as a JSON number without losing digits: in a **CSV** column chosen as Number and in a **JSON file** the row is refused ("Integer too large to store exactly — import it as text"). The JSON parser reads such a value from the file text for exactly this reason — a plain `JSON.parse` would have rounded `9007199254740993` to `…992` and imported it without a word.

These were verified against a real MongoCamp server (1.5.x; the date handling and the empty-batch answer re-verified on 1.6.3 — an empty `insertMany` is a `400` there).
