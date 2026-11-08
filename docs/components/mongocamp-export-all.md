# MongocampExportAll

Exports **every** document of a collection — or every one a filter matches — as JSON, NDJSON or CSV, not only the page on screen. A dialog without a trigger: the parent owns `v-model:open`. [`MongocampCollectionData`](/components/mongocamp-collection-data) opens it from the export menu (**Export all matching…**) with the filter, sort and fields of the list.

## Props

| Prop | Type | Description |
|---|---|---|
| `v-model:open` | `boolean` | Whether the dialog is open |
| `collection` | `string` | The collection to export |
| `filter` | `string` | Lucene filter of the list (empty = all documents) |
| `sort` | `string[]` | Sort keys of the list |
| `projection` | `string[]` | Fields of the list (empty = all fields) |
| `total` | `number` | How many documents match, when known — shown before the export starts |

## Behavior

- Choose **JSON**, **NDJSON** or **CSV**, then **Export**; the server streams the file and it is downloaded when it has arrived (see [`useMongocampExportAll`](/composables/use-mongocamp-export-all)).
- **No document cap.** The dialog shows the bytes received and **Cancel**: nothing is downloaded after a cancel.
- The server ends a failing stream with a normal `200`, so the file is checked against the count (`total`): a file that is cut short is reported as **incomplete** (the server stopped before the end — try again). Without a count the dialog names the file size instead of a document count.
- The filter travels in the URL; a filter over ~1 800 encoded characters is refused with a message.
