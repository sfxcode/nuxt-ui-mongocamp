# MongocampCollectionRename

Renames a collection inside the database (server 1.8.1, `POST …/collections/{name}/rename`): the documents and indexes stay, the name changes. A dialog without a trigger: the parent owns `v-model:open`. [`MongocampCollections`](/components/mongocamp-collections) opens it from the **Rename collection** button (administrators, ordinary collections only).

```vue
<script setup lang="ts">
const open = ref(false)
</script>

<template>
  <UButton label="Rename" @click="open = true" />
  <MongocampCollectionRename v-model:open="open" source="orders" @done="reload" />
</template>
```

| Name | Type | Description |
|---|---|---|
| `v-model:open` | `boolean` | Whether the dialog is open; the collection names are read fresh every time it opens |
| `source` | `string` | The collection to rename |
| `done` | `{ source, target }` | Emitted after the rename succeeded (the dialog closes itself) |

## What it does

- **Warns first:** grants are matched by **name**, so every grant for the old name stops applying and none exists for the new one. Grant the new name again ([`MongocampRoleGrants`](/components/mongocamp-role-grants)).
- The new name follows the same rules as a copy's: letters, digits and `_ - .`, at most 100 characters; not `mc_*`, `*.files`, `*.chunks`, `system.*`, the source itself or any collection that exists (ignoring case). The form says which rule fails.
- One request; the dialog cannot be dismissed while it runs. If another session took the name meanwhile (`409`) the form says so and asks for another one; any other refusal shows the server's message.
