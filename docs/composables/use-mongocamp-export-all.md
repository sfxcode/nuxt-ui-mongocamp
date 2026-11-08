# useMongocampExportAll

Exports a **whole collection**, or every document matching a filter, as JSON, NDJSON or CSV — not just the rows on screen (that is [`useMongocampExport`](/composables/use-mongocamp-export), which the table's page export uses). The **server streams the file** (`GET …/documents/export`, server 1.8.1): there is no document cap, and the browser never parses a document. (Before 1.8.1 every page was read through [`useMongocampFetchAll`](/composables/use-mongocamp-fetch-all) and the file built in memory, capped at 50 000 documents.)

```ts
const { exportCollection } = useMongocampExportAll()

const controller = new AbortController()
const result = await exportCollection({
  collection: 'customers',
  format: 'csv',                 // 'json' | 'ndjson' | 'csv'
  filter: 'country:"DE"',        // optional Lucene filter
  expected: 1834,                // optional: the count you know, to detect a cut-short file
  signal: controller.signal,
  onProgress: ({ bytes, lines }) => (received.value = bytes),
})

if (result.incomplete) toast('The server stopped early — the file is incomplete')
```

## Options

| Option | Meaning |
|---|---|
| `collection`, `format` | what to export and as what |
| `filter`, `sort`, `projection` | as for the document list; `projection: ['_id', 'name']` limits the fields and, for a CSV, **is** its columns, in that order (`columns` is the old name for it). The filter travels in the URL: over ~1 800 encoded characters it throws `FilterTooLongError` — the export endpoint has no POST variant |
| `maxRows` | the server's `limit`: stop after this many documents (default: all) |
| `expected` | how many documents you expect (the count of the filter): a file with fewer is reported as `incomplete` |
| `onProgress`, `signal` | `onProgress({ bytes, lines })` after every chunk of the stream; aborting **rejects** with an `AbortError` and downloads nothing |
| `filename` | default `<collection>-<yyyymmdd>-<hhmm>.<format>` (the name made safe for a file) |
| `download` | `false` only returns the blob instead of handing it to the browser |

Returns `{ blob, filename, mimeType, format, bytes, documents?, incomplete }`.

**`incomplete` means the file is cut short.** The server writes the stream while the database delivers it, so a failure midway ends the stream — with a normal `200`. The file is therefore checked: JSON must end with `]`; NDJSON and CSV must hold at least the expected number of documents (capped by `maxRows`). The file is still handed to the browser, so always tell the user. `documents` is exact for NDJSON (one per line) and the expected count for a complete JSON or CSV file.

## The formats

| Format | Content |
|---|---|
| `json` | one array of documents |
| `ndjson` | one compact document per line — what `mongoimport` and most tools read, and what the import wizard now reads too |
| `csv` | a header row and one row per document; nested values as JSON, a text with a comma, a quote or a line break in quotes. The columns are the `projection`, by default the fields of the first 1 000 documents |

Values are plain JSON as the server writes them: ids as text, dates as ISO text (`2026-01-01T00:00:00Z` — a zero millisecond part is dropped). (The endpoint also takes `extendedJson` for explicit types; this composable does not use it.)

### Large integers

An integer beyond ±(2^53 − 1) keeps **every digit**: the server writes it as a bare number (`"big":9007199254740993`, verified live), and the browser only passes the bytes on — it never calls `JSON.parse` on the file, so nothing is rounded.

## Importing it again

Export as **NDJSON** and the [import wizard](/components/mongocamp-import) sends that file back to the server as it is. JSON arrays and CSV go through the wizard's own parser and type inference as before.

## Memory and size

The bytes flow through a counting `TransformStream` into a `Blob` (`new Response(stream).blob()`), which the browser may keep on disk — the page does not hold the file as JavaScript strings or objects. Pick `projection` and `filter` to export less.

## Related

- [`useMongocampExport`](/composables/use-mongocamp-export) — `rowsToCsv`, `downloadTextFile` and `downloadBlob`
- [`useMongocampImport`](/composables/use-mongocamp-import) — the other direction
