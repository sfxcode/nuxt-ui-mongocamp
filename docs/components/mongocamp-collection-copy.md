# MongocampCollectionCopy

Copies the documents of one collection into a **new** collection — the only way to duplicate one, because the server blocks `$out` and `$merge`. It has a **quick backup** that picks a timestamped name for you. A dialog without a trigger: the parent owns `v-model:open`. [`MongocampCollections`](/components/mongocamp-collections) opens it from the **Copy collection** button (administrators, ordinary collections only).

## Usage

```vue
<script setup lang="ts">
const open = ref(false)
</script>

<template>
  <UButton label="Copy" @click="open = true" />
  <MongocampCollectionCopy v-model:open="open" source="orders" @done="reload" />
</template>
```

## Props and events

| Name | Type | Description |
|---|---|---|
| `v-model:open` | `boolean` | Whether the dialog is open; the names and the document count are read fresh every time it opens |
| `source` | `string` | The collection to copy |
| `filter` | `string` | Optional Lucene filter: copy only the matching documents |
| `done` | `{ target, copied }` | Emitted after documents were written (also a partial copy), so a list can reload |

## What it does

1. **Copy** — type the name of the new collection (letters, digits and `_ - .`, at most 100 characters; not `mc_*`, `*.files`, `*.chunks`, `system.*`, the source itself or any collection that exists, ignoring case; the form says which rule fails).
2. **Quick backup** — one click, no name: the new collection is called `<source>_backup_<yyyymmdd>_<hhmmss>` (local time; `_2`, `_3`, … when that name exists). Odd characters in the source name become `_` and a long name is shortened.
3. The source is read in pages of 1 000 (progress, **Stop**), then written in batches of 1 000 (progress, **Stop**). Documents are copied exactly as the server gives them, `_id` included.
4. **Also create the same indexes** (a checkbox, on by default; it applies to the copy and to the quick backup): after the documents are written, every index of the source except `_id_` is created on the new collection — same name, same field order, unique flag, expiry (TTL) and one-field text indexes. The result lists what was created and what could not be copied (see below).
5. The finished copy is **counted by the server** and compared with what was sent; a difference is shown as a warning.

::: warning What is not copied
Grants, the schema and the files of a GridFS bucket are never copied — only documents and, if ticked, indexes. The copy is **not atomic and not a snapshot**: if the source changes while it is read, the dialog says the copy may miss or repeat a document.
:::

## Indexes that cannot be copied

Nothing is approximated; these are listed as *Not copied* with the reason:

- a **text index over several fields**, or with custom weights;
- a **compound index with a custom name** — the server lists its fields in an arbitrary order, so the order is not known;
- other key types (geo, hashed, …).

Partial filters, sparse flags and collations are not part of what the server lists, so they are not copied either. An index the server refuses on the new collection is listed as *Could not create …* and the others are still created. Indexes are only created when **every batch was written**: after a failed batch or a stop the copy is incomplete, and after a successful **Retry** they are created then. If the indexes of the source cannot be read, the documents are still copied and the dialog says so.

Verified on server 1.6.3: single, compound unique (with its field order), custom-named, expiring (3600 s) and text indexes came out identical on the copy.

## Limits and failures

- At most **50 000 documents** (everything is held in memory). A larger collection is refused up front with its count; nothing is read or written.
- The name is checked again right before writing; if another session took it, nothing is written and the form asks for another name (a quick backup chooses a new name once more by itself).
- **Stopped while reading**: nothing was written. **Stopped while writing**: the dialog says how many were copied and how many were not sent, and that the new collection is incomplete.
- A **failed batch** is listed with its document numbers (`Documents 1001–2000: …`). **Retry failed batches** sends only those rows. A batch that did not fail with a plain rejection may have been partly written; retrying can then fail on documents that already exist — drop the new collection and copy again.

Verified on server 1.6.3: dates, 64-bit integers and ids come out with the same types and the documents read back identically (2 000 documents compared one by one).
