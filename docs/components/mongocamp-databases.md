# MongocampDatabases

Read-only table of all databases on the running MongoCamp server: size, collection count, and empty status.

## Usage

```vue
<template>
  <MongocampDatabases />
</template>
```

## Props

None.

## Columns

| Column | Description |
|---|---|
| Database | Sortable, database name |
| Size (KB) | Sortable, `sizeOnDisk` converted from bytes |
| Collections | Badge with the collection count — fetched per database via `listCollectionsByDatabase` |
| Empty | Badge shown only when the database is empty |

This component is **read-only** — there is no delete action. See [`useMongocampSystem`](/composables/use-mongocamp-system) for why `deleteDatabase` isn't wrapped.

## Related composables

- [`useMongocampSystem`](/composables/use-mongocamp-system)
