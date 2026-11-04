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

- Choose **JSON**, **NDJSON** or **CSV**, then **Export**; the file is downloaded when everything is read (see [`useMongocampExportAll`](/composables/use-mongocamp-export-all)).
- Progress while reading and **Cancel**: nothing is downloaded after a cancel.
- At most **50 000** documents. If more match, the file holds the first ones and the dialog says in a warning that **the file is incomplete** and how many of how many it holds — narrow the filter.
- If documents were added or removed while reading, the dialog says the file may miss or repeat one.
