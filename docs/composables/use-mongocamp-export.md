# useMongocampExport

Plain helpers for exporting rows the table already has in memory — no API calls, so they behave the same in session and server-proxy mode. Used by [`MongocampCollectionData`](/components/mongocamp-collection-data)'s export menu.

```ts
const { rowsToCsv, downloadTextFile } = useMongocampExport()

const csv = rowsToCsv(rows, ['name', 'age']) // header row + one line per row, in the given key order
downloadTextFile('customers.csv', csv, 'text/csv')
```

| Function | Description |
|---|---|
| `rowsToCsv(rows, keys)` | CSV text (`\r\n` line breaks). Cells containing a comma, quote or line break are quoted with inner quotes doubled; `null`/`undefined` become empty; objects and arrays become JSON |
| `formatDocuments(rows, 'json' \| 'ndjson' \| 'csv', options?)`, `toExportRow(row)` | (in `utils/exportDocuments.ts`) the file text for documents, written as the table shows them with every digit of a 64-bit integer beyond 2^53 kept — used by the page export and by [`useMongocampExportAll`](/composables/use-mongocamp-export-all) |
| `downloadTextFile(filename, content, mimeType)` | Saves text as a file through a temporary download link (browser only) |
