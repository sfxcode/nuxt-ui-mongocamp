# MongocampDocumentView

Read-only view of **one document**, as a typed tree or as JSON — the way to read a document without the edit form. [`MongocampCollectionData`](/components/mongocamp-collection-data) opens it in a drawer from the **View** button of each row; use it on its own wherever you hold a document.

## Usage

```vue
<script setup lang="ts">
const mode = ref<'tree' | 'json'>('tree')
</script>

<template>
  <MongocampDocumentView
    v-model:mode="mode"
    :document="row"
    @copy="({ kind, text }) => log(kind, text)"
  />
</template>
```

## Props

| Prop | Type | Description |
|---|---|---|
| `document` | `Record<string, unknown> \| null` | The document as the data table holds it: plain values plus extended-JSON wrappers (`$oid`, `$date`, `$numberLong`, …). `null` shows an empty message |
| `v-model:mode` | `'tree' \| 'json'` | The view; default `'tree'`. The component has its own Tree / JSON switch |

## Events

| Event | Payload | When |
|---|---|---|
| `copy` | `{ kind: 'path' \| 'value' \| 'document', text }` | after a copy button was used — also when the browser refused the clipboard (a toast tells the user) |

## Behavior

- **Tree:** every node has its key, a **type badge** and its value. Wrappers are shown as what they are — `objectId` (the id), `date` (ISO text, localised on hover), `long` / `int` / `double` / `decimal` (every digit: an integer beyond 2^53 is exact) — and an empty array or object shows `[]` / `{}`; a container shows its size (`[3]`, `{2}`).
- **Copy** per node: the **path** (`address.geo.lat`, `tags.0`, usable in a filter or partial update; a key with a dot is written `a\.b`) and the **value** (a long as every digit, a container as JSON). **Copy document** copies the whole JSON.
- **Collapse:** a document of up to 200 nodes opens its first two levels; a larger one starts collapsed with a note. **Expand all / Collapse all** switches every container. A different `document` starts from its own default.
- **JSON:** indented, wrappers written as plain values (`$oid` → text, `$date` → ISO text), an integer beyond 2^53 as a bare number with all its digits.
- At most 5 000 nodes are built; a larger document shows a notice with the number shown.
- It never changes the document and never makes a request.

## In the data table

- Each row has a **View** (eye) button, shown **without a write grant too** (it is read-only) and for GridFS bucket rows.
- A **Table | JSON** switch in the toolbar shows the current page as one JSON text (exact longs) instead of the table; paging, filter and sort keep working.
