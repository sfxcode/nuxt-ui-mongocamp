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
| `downloadTextFile(filename, content, mimeType)` | Saves text as a file through a temporary download link (browser only) |
