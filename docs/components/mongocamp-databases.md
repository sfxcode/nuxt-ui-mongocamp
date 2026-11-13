# MongocampDatabases

Read-only table of all databases on the running MongoCamp server: size, collection count, and empty status.

## Usage

```vue
<template>
  <MongocampDatabases />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `hideHeading` | `boolean` | `false` | Hide the component's own heading, e.g. when the page around it already shows a title. The toolbar stays. |
| `hideRefresh` | `boolean` | `false` | Hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header. |

## In a page with its own header

The component can hand its toolbar to the page around it:

- **`refresh()`** is exposed — call it through a template ref from your own reload button, and set `hideRefresh` to drop the built-in one.
- **`toolbar` slot** — your own buttons, placed beside the built-in ones.

```vue
<script setup lang="ts">
const list = useTemplateRef<{ refresh: () => void }>('list')
</script>

<template>
  <header>
    <h1>My title</h1>
    <UButton icon="i-lucide-refresh-cw" @click="list?.refresh()" />
  </header>
  <MongocampDatabases ref="list" hide-heading hide-refresh>
    <template #toolbar>
      <UButton>Mine</UButton>
    </template>
  </MongocampDatabases>
</template>
```

## Columns

| Column | Description |
|---|---|
| Database | Sortable, database name |
| Size (KB) | Sortable, `sizeOnDisk` converted from bytes |
| Collections | Badge with the collection count — fetched per database via `listCollectionsByDatabase` |
| Empty | Badge shown only when the database is empty |

This component is **read-only** — there is no delete action. See [`useMongocampSystem`](/composables/use-mongocamp-system) for why `deleteDatabase` isn't wrapped.

## Chart

With two or more databases a collapsed **Chart** section shows the size on disk per database, biggest first, from the rows already loaded.

## Related composables

- [`useMongocampSystem`](/composables/use-mongocamp-system)
