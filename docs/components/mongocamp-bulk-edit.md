# MongocampBulkEdit

The dialog behind **Edit selected** in [`MongocampCollectionData`](/components/mongocamp-collection-data): set one field to the same value on every selected document. It is the dialog only — the trigger button lives in the selection bar of [`MongocampBulkDelete`](/components/mongocamp-bulk-delete) (through its `actions` slot) and the parent runs the update, so a failed update keeps the dialog open even though the table reloads and the bar disappears.

You normally don't use it directly. It is documented for apps that build their own table with the same behaviour.

## Props

| Prop | Type | Description |
|---|---|---|
| `open` (`v-model:open`) | `boolean` | Whether the dialog is open |
| `selected` | `number` | How many documents are selected (shown in the title and the confirm button) |
| `fields` | `{ key: string, type: 'string' \| 'number' \| 'boolean' \| 'date-time' \| 'json' }[]` | Fields the user can choose from; each field's `type` is the starting value type |
| `saving` | `boolean` | The parent is running the update — disables the buttons and shows a spinner |
| `error` | `string` | Shown in the dialog, which then stays open |

## Events

| Event | Payload | Description |
|---|---|---|
| `apply` | `{ field: string, value: unknown }` | The user confirmed — run the update now |

The dialog closes by itself when `saving` goes back to `false` and there is no `error`.

## The value

The user picks the field, the value type and types the value; a boolean uses a true/false select. The value is converted with the same rules as an [import](/components/mongocamp-import#csv-column-types): numbers must be plain numbers, dates ISO 8601 (read as UTC, stored as an ISO string with milliseconds), JSON must parse. An invalid or missing value shows the reason and disables **Update**. An empty text is a valid value only for a Text field.

## How `MongocampCollectionData` applies it

- **Which fields** — the scalar fields of the loaded rows (text, number, boolean, date). Never `_id`, the `metaData` object, arrays/objects, or names starting with `$` or containing a dot.
- **One request per 100 documents** — `documentApi.updateMany` with the filter `{ $or: [{ _id: "<id>" }, …] }` and the document `{ field: value }`. The server merges that document into every match, so other fields (including nested ones) are untouched. An empty id list is refused before any request: an empty filter would update the whole collection.
- **Failures are reported, never hidden** — if a request fails, or `updateMany` matches fewer documents than the chunk held (some were deleted meanwhile), that chunk counts as failed: its rows that are still on screen stay selected and the dialog says `N of M could not be updated: <reason>`. Everything else is updated.
- **Ids the server cannot address** — a document whose `_id` is not a 24-character hex string cannot be updated through this API (neither bulk nor single); those rows fail immediately with a message and no request.
- **`metaData` is not touched** — a bulk edit does not change `createdBy`/`updatedBy`/timestamps.

## Related

- [`MongocampBulkDelete`](/components/mongocamp-bulk-delete) — the selection bar the trigger sits in
- Strings live under `nuxtUiMongocamp.bulk.edit*` in the English and German locale files
