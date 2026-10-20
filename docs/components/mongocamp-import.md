# MongocampImport

A dialog that imports documents into a collection from a JSON or CSV file: choose a file, check the preview, import in batches, and see exactly what was and wasn't imported. It is part of [`MongocampCollectionData`](/components/mongocamp-collection-data)'s toolbar (the **Import documents** button) for every ordinary collection — you only need it directly if you build your own page.

## Usage

```vue
<template>
  <MongocampImport collection-name="myCollection" @imported="reload" />
</template>
```

The component renders its own trigger button (a file-up icon) and the dialog.

## Props

| Prop | Type | Description |
|---|---|---|
| `collectionName` | `string` | Required. Collection that receives the documents. |

## Events

| Event | Payload | Description |
|---|---|---|
| `imported` | `number` | A run inserted at least one document; the payload is how many *that run* inserted (a retry emits again). Reload your list here. |

## The dialog

1. **Choose a file** — `.json`, `.csv`, `.tsv` or `.txt`. The format is taken from the extension, otherwise from the first character (`[` or `{` means JSON).
2. **Preview** — shows `N of M rows ready to import`, the first five rows, and every row that will be skipped with its row number and the reason (the first ten are listed, the rest counted). For CSV you can change the delimiter (comma, semicolon, tab) and the type of every column; the switches decide whether empty text cells are kept as empty strings and whether created/updated information is added (on by default, like the single-document form).
3. **Import** — runs in batches of 1 000 with a progress bar and a **Stop** button; stopping reports how many rows were not sent (rows already sent stay imported).
4. **Result** — how many rows were imported, and for each failed batch the file rows it covered and the server's own reason. **Retry failed rows** sends only those rows again.

## Files

| | JSON | CSV |
|---|---|---|
| Shape | One array of objects | A header row, then one document per line |
| Quoting | — | RFC 4180: quoted fields may contain delimiters, doubled quotes and line breaks; any line ending; a leading byte-order mark is ignored |
| Header | — | Required; empty or duplicate column names are refused |
| Extended JSON | `{ "$date": … }`, `{ "$oid": … }` and `{ "$number…": … }` are converted to plain values first (dates become ISO strings) | — |

Limits: **10 000 rows** and **5 MB** of text per file. Rows beyond the limit are ignored and the preview says so; a larger file is refused.

### CSV column types

The preview starts with a guess per column, which you can change:

| Type | Accepts | Stored as |
|---|---|---|
| Text | anything | string (an empty cell is left out unless **Keep empty text cells** is on) |
| Number | plain numbers (`3`, `-2.5`, `1e3`); empty cells are left out | number |
| Boolean | `true`/`false`, `yes`/`no`, `1`/`0` (any case) | boolean |
| Date | ISO 8601 (`2024-03-01`, `2024-03-01T10:30:00Z`, with or without offset) — a date without offset is read as **UTC**, a bare date is midnight UTC | ISO string with milliseconds (the server stores these as real dates) |
| JSON | any valid JSON value | that value |

The guess uses boolean words only (`0`/`1` columns are numbers), and keeps integers with a leading zero (`007`) and integers beyond ±(2^53 − 1) as text so no digit changes. **An integer beyond that range chosen as Number is refused** per row rather than silently rounded.

## What is refused

A row is skipped (and listed) when it:

- is not an object (JSON), has more fields than the header (CSV), or has no fields;
- contains a field name starting with `$`, or `__proto__`, at any level — an import only ever adds plain data;
- has an `_id` that is not a 24-character hex string (the server cannot store any other kind through its API);
- has a CSV cell that does not convert to the column's type.

Skipped rows never stop the rest from importing.

## Failures

The server checks a whole batch before writing it, so a batch it rejects (HTTP 400) inserted nothing. Any other failure of a batch may have inserted part of it — the result says so, and retrying such a batch can create duplicates. Batches are independent: a failed one doesn't stop the next.

## Not available for GridFS buckets

`MongocampCollectionData` hides the import button for `*.files` / `*.chunks` collections — importing plain documents there would corrupt files. Use [`MongocampBucketFiles`](/components/mongocamp-bucket-files) to upload files.

## Related

- [`useMongocampImport`](/composables/use-mongocamp-import) — the batch insert behind the dialog
- Strings live under `nuxtUiMongocamp.import.*` in the English and German locale files
