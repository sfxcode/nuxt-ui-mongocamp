# MongocampCollectionCopy

Copies the documents of one collection into a **new** collection, inside the database (server 1.8.1) — `$out` and `$merge` stay blocked. It has a **quick backup** that picks a timestamped name for you. A dialog without a trigger: the parent owns `v-model:open`. [`MongocampCollections`](/components/mongocamp-collections) opens it from the **Copy collection** button (administrators, ordinary collections only).

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
| `done` | `{ target, copied }` | Emitted after the new collection exists (also when the dialog was closed meanwhile), so a list can reload |

## What it does

1. **Copy** — type the name of the new collection (letters, digits and `_ - .`, at most 100 characters; not `mc_*`, `*.files`, `*.chunks`, `system.*`, the source itself or any collection that exists, ignoring case; the form says which rule fails).
2. **Quick backup** — one click, no name: the new collection is called `<source>_backup_<yyyymmdd>_<hhmmss>` (local time; `_2`, `_3`, … when that name exists). Odd characters in the source name become `_` and a long name is shortened.
3. **One request.** The server copies the documents (the count is shown beforehand; a filtered dialog copies only the matches). While it runs the dialog shows a progress bar without numbers and **cannot be dismissed**, because the work happens on the server.
4. **Also create the same indexes** (a checkbox, on by default; it applies to the copy and to the quick backup): the server recreates every index except `_id_` from the real index definitions — compound order, unique, expiry, partial filters, text weights, collations. The result says how many were created.

::: warning What is not copied
Grants, the schema and the files of a GridFS bucket are never copied — only documents and, if ticked, indexes.
:::

## Limits and failures

- **No document cap** (the old browser-side copy stopped at 50 000).
- If another session took the name meanwhile, the server answers `409`; the form says so and asks for another name (a quick backup chooses a new name by itself, up to three tries).
- Any other refusal shows the server's message and keeps the form.
