# useMongocampFetchAll

Reads **every** page of a document or file list — with a cap, progress and cancellation. Before server 1.8 it was the base for exporting a whole collection, copying one and "select all N matching"; the list components themselves page on screen and don't need it.

::: tip Not used by the module itself since server 1.8
Bulk delete/edit by filter, copy, export and import now run on the server, so none of the module's own components call `fetchAllDocuments` / `fetchAllFiles` any more. They stay a public helper for apps that need every row of a collection in the browser (the document search is POSTed, so long filters work).
:::

```ts
const { fetchAllDocuments, fetchAllFiles } = useMongocampFetchAll()

const controller = new AbortController()
const { rows, total, truncated } = await fetchAllDocuments('customers', {
  filter: 'country:"DE"',
  sort: ['name'],
  projection: ['_id'],          // the cheap way to collect ids
  pageSize: 500,                // default 500
  maxRows: 50_000,              // default 10 000
  signal: controller.signal,
  onProgress: ({ loaded, target }) => (progress.value = loaded / (target ?? loaded)),
})
```

`fetchAllFiles(bucketName, { filter, sort, projection, … })` does the same for the files of a GridFS bucket (there `sort` and `projection` are strings, as the file list takes them).

## Options and result

| Option | Meaning |
|---|---|
| `pageSize` | rows per request, default **500** |
| `maxRows` | stop after this many rows, default **10 000** — raise it on purpose, an unbounded read is never the default |
| `onProgress` | called after every page with `{ loaded, total, target, page }`; `target` is the total capped at `maxRows`; synchronous (not awaited) |
| `signal` | an `AbortSignal` — see below |
| `keyOf` | identity of a row (`row => row._id`), to drop a row that shows up on two pages |

Returns `{ rows, total, truncated, totalChanged, duplicates, pages }`: `total` is the server's count as of the last page, `truncated` says more rows exist than were read (the cap was hit), `totalChanged` that the collection changed while it was being read, `duplicates` how many rows `keyOf` dropped.

## What it relies on

Verified on MongoCamp 1.6.3 with a 20 000-document collection (2026-11-03):

- The server honours `rowsPerPage` far beyond its default of 100 — 1 000 and even 100 000 in a single request — so **the page size is the speed lever**, not concurrency (the pages are read one after the other). A full read of 20 000 documents took 21 s at 100 per page, 4.7 s at 500 and 2.8 s at 1 000; 5 000 documents took 3.3 s, 0.8 s and 0.5 s. Very large documents make a big page heavy: lower `pageSize` for them.
- The total arrives in the `x-pagination-count-rows` header of every page. A page past the end answers `200 []`; page 0 or a page size of 0 is a `400` and is never sent.
- Deep pages cost almost nothing extra (page 1: 64 ms, page 190: 85 ms), and an unsorted list is repeatable — but add a `sort` for a stable order when the collection may change.

It stops when the rows read reach the server's latest total, on an empty page, or at `maxRows`. A page shorter than asked for does **not** end the read as long as the server reports a total (a server may cap the page size); only without a total does a short page mean the end. A server that ignores the page number and repeats one page is stopped by the cap, or — with `keyOf` — as soon as a page brings nothing new.

## Cancelling

Aborting makes the call **reject** with an `AbortError` (or the signal's own `reason`), also while a request is in flight — a half-read list is never returned as if it were complete, so an export or a copy cannot quietly end up partial. Every page also has its own 60 s timeout.

## Documents changing while it reads

Paging is skip/limit, so a document added or removed during the read shifts the later pages: the result can miss or repeat one. `totalChanged` tells you it happened; `keyOf` drops repeats (it cannot bring back a missed row). Checked live: 100 documents added while reading were picked up (the total followed, 5 100 rows, `totalChanged: true`). For a read that must be exact, do it when nobody is writing, or compare the row count with a fresh count afterwards.

## Rows

The rows are what the list returns, read from the response text: integers beyond 2^53 are kept exact as `{ $numberLong }` wrappers (use `unwrapExtendedJson` for display, see [`useMongocampExtendedJson`](/composables/use-mongocamp-extended-json)) and dates are ISO strings. Calls go through [`useMongocampClientApi`](/composables/use-mongocamp-client-api), so session and server proxy mode both work. The pure function is `fetchAllPages(fetchPage, options)` in `utils/pagedFetch.ts` if you need another list.

## Related

- [`useMongocampBulkDelete`](/composables/use-mongocamp-bulk-delete) — deleting a set of ids in chunks
- [`useMongocampExport`](/composables/use-mongocamp-export) — turning rows into CSV
