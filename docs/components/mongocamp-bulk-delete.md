# MongocampBulkDelete

The selection bar and confirmation modal behind bulk delete in [`MongocampUsers`](/components/mongocamp-users), [`MongocampRoles`](/components/mongocamp-roles) and [`MongocampCollectionData`](/components/mongocamp-collection-data). It is shown only while rows are selected: "N selected", **Delete selected**, **Clear selection**. **Delete selected** opens a modal that lists up to five of the selected names; nothing is deleted until the modal is confirmed.

You normally don't use it directly. It is documented for apps that build their own table with the same behaviour — pair it with `createSelectColumn` (checkbox column for `UTable`'s `v-model:row-selection`) and `runBulkDelete` (see [`useMongocampBulkDelete`](/composables/use-mongocamp-bulk-delete)).

## Props

| Prop | Type | Description |
|---|---|---|
| `selected` | `string[]` | Display names of the selected rows; the parent owns the selection |
| `deleting` | `boolean` | Parent is running the deletion — disables Cancel and shows a spinner on confirm |
| `error` | `string` | Shown in the modal, which then stays open (e.g. a partial-failure message) |

## Events

| Event | Description |
|---|---|
| `confirm` | User confirmed the deletion — run it now |
| `clear` | User asked to clear the selection |
| `open` | The confirmation modal is about to open — a good moment to reset a stale `error` |

The modal closes by itself when `deleting` goes back to `false` and there is no `error`.

## Built-in safety rules

- The selection is dropped on every reload, page change, filter or sort, so rows that are no longer on screen can never be deleted.
- `MongocampUsers` does not allow selecting the signed-in user (also not via select-all).
- `MongocampCollectionData` offers no selection on GridFS bucket collections (`*.files` / `*.chunks`) — manage those through [`MongocampBucketFiles`](/components/mongocamp-bucket-files).
- Failures don't stop the run: everything that could be deleted is deleted, the rest stays selected and the modal reports how many failed and why.
