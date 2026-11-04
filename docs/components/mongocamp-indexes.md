# MongocampIndexes

The indexes of one collection with their **size** and **how often each was used**, plus creating and dropping them. It is the index card of [`MongocampCollectionInfos`](/components/mongocamp-collection-infos) as a component of its own.

## Usage

```vue
<template>
  <MongocampIndexes
    collection-name="orders"
    :fields="['status', 'customerId', 'createdAt']"
    @changed="reloadStats"
  />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `collectionName` | `string` | — | Required. The component loads and reloads by itself when it changes |
| `canManage` | `boolean` | `true` | `false` hides **Create Index** and the drop buttons (a read-only view). It is a UI hint: the server decides what is allowed |
| `fields` | `string[]` | `[]` | Field names offered while typing a field of a new index |

## Events and methods

| Name | When |
|---|---|
| `changed` | after an index was created or dropped, so a parent can refresh its own numbers (the info cards do) |
| `refresh()` | exposed: reloads indexes, sizes and usage |

## The table

| Column | Shows |
|---|---|
| Index | the name |
| Keys | the fields **in index order** (`country: ↑, age: ↓`); a text index shows its fields as `body (text)` |
| Type | `standard`, `unique`, `text`, `expire <seconds>` |
| Size | bytes per index from the collection information |
| Usage | `12 uses since 11/1/2026`, or a **never used since …** badge |

::: tip Why the order comes from the name
The server lists an index's keys as an unordered map, so for a compound index the order only survives in its name (`c_1_b_1`). The component reads the order from the standard name and falls back to the listed order for a custom name. Order matters: queries must filter on the first field.
:::

::: warning "Never used" is a hint
Usage comes from MongoDB's `$indexStats`, a counter that **starts again whenever the database server restarts** — an index can look unused only because the server restarted recently. The `_id_` index is never flagged. If the usage numbers cannot be read, the indexes are still listed with a note.
:::

## Charts

When two or more indexes have a size (or a use count), a collapsed **Charts** section shows the index size and the uses per index as bars, built from the numbers the table already holds (no request). Each chart has its data table as a text alternative.

## Creating

**Create Index** opens a dialog:

| Type | Fields | Notes |
|---|---|---|
| Standard | 1–8, each ascending or descending | compound when there are several |
| Unique | 1–8 | compound unique works too; fails when existing documents repeat the values |
| Text | one | |
| Expiring | one (a date field) | *Expire after*: a number and `s`, `m`, `h` or `d` — `3600s`, `7d` |

A standard or unique index can get a name. The form says what is missing (empty or repeated field, bad duration, too many fields) before anything is sent. Creating an index that already exists is a no-op on the server, not an error; an index with the same fields but other options is refused and the server's message is shown. A unique index over duplicate data answers with a readable "the existing documents repeat values of these fields" instead of MongoDB's raw error.

## Dropping

The trash button asks for the **index name** (the same typed confirmation as dropping a collection, [`MongocampConfirmByName`](/components/mongocamp-confirm-by-name)). The `_id_` index has no drop button and the component refuses it as well.
