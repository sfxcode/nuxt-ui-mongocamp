# useMongocampExportAll

Exports a **whole collection**, or every document matching a filter, as JSON, NDJSON or CSV — not just the rows on screen (that is [`useMongocampExport`](/composables/use-mongocamp-export), which the table's page export uses). It reads every page with [`useMongocampFetchAll`](/composables/use-mongocamp-fetch-all) and builds the file in the browser.

```ts
const { exportCollection } = useMongocampExportAll()

const controller = new AbortController()
const result = await exportCollection({
  collection: 'customers',
  format: 'csv',                 // 'json' | 'ndjson' | 'csv'
  filter: 'country:"DE"',        // optional Lucene filter
  maxRows: 100_000,              // default 50 000
  signal: controller.signal,
  onProgress: ({ loaded, target }) => (progress.value = loaded / (target ?? loaded)),
})

if (result.truncated) toast('Only the first 100 000 documents were exported')
```

## Options

| Option | Meaning |
|---|---|
| `collection`, `format` | what to export and as what |
| `filter`, `sort`, `projection` | as for the document list; `projection: ['_id', 'name']` limits the fields |
| `columns` | CSV columns in this order (default: see below) |
| `maxRows` | stop after this many documents, default **50 000** — raise it on purpose |
| `pageSize`, `onProgress`, `signal` | as for `fetchAllDocuments`; aborting **rejects** with an `AbortError` and downloads nothing |
| `filename` | default `<collection>-<yyyymmdd>-<hhmm>.<format>` (the name made safe for a file) |
| `download` | `false` only returns the text instead of handing it to the browser |

Returns `{ content, filename, mimeType, format, rowCount, total, truncated, totalChanged }`.

**`truncated` means the file is incomplete** — the cap was hit and more documents exist — yet the file *is* downloaded with what was read, so always tell the user. `totalChanged` says documents were added or removed while reading, so the file may miss or repeat one (a repeat is dropped by `_id`).

## The formats

| Format | Content |
|---|---|
| `json` | an array, one document per line (`[`, `  {…},`, … `]`) |
| `ndjson` | one compact document per line — what `mongoimport` and most tools read |
| `csv` | a header row and one row per document, RFC 4180 quoting, `\r\n` line ends |

CSV columns are the keys of **all** rows in order of first appearance, `_id` first, so a key that only later documents have is not lost; nested objects and arrays become one cell of JSON text, `null` and missing values are empty. Documents are written as the table shows them: `$oid` as text, dates as ISO text, `$numberInt` as a number (a `$numberDecimal` becomes a JS number, rounded past ~15 significant digits).

### Large integers

An integer beyond ±(2^53 − 1) keeps **every digit**: in JSON and NDJSON it is a *bare number* (`"big":9007199254740993` — exact for `jq`, Python or `mongoimport`; a browser's `JSON.parse` would round it, which is why the module reads responses from their text), in CSV its digits. It is never written as a string, which would change its type.

## Importing it again

Checked live on MongoCamp 1.6.3 with 2 000 documents (nested objects, arrays, `null`, booleans, decimals, dates, unicode, text with quotes, commas and line breaks): **export as JSON → the import wizard's parser → insert → read back: every field equal.** The CSV export is read back by the importer's CSV parser with the same row count and intact cells. Two limits: the wizard imports **JSON arrays and CSV, not NDJSON**; and a JSON row holding an integer beyond 2^53 is **refused with "Integer too large to store exactly"** (the importer sends plain JSON, which cannot carry it) instead of being rounded — use `mongoimport` or the API for those.

## Memory and size

The whole file is built in memory: 2 000 small documents were 430 KB as JSON; with the default cap of 50 000 expect tens of megabytes. Pick `projection` and `filter` to export less.

## Related

- [`useMongocampFetchAll`](/composables/use-mongocamp-fetch-all) — the paged read underneath
- [`useMongocampExport`](/composables/use-mongocamp-export) — `rowsToCsv` and `downloadTextFile`
- [`useMongocampImport`](/composables/use-mongocamp-import) — the other direction
