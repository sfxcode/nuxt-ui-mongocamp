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
| Type | `standard`, or the badges `unique`, `text` (+ its default language), `expire <seconds>`, `sparse`, `partial`, `hidden`, `collation` |
| Size | bytes per index from the collection information |
| Usage | `12 uses since 11/1/2026`, or a **never used since …** badge |

::: tip The order is the server's
The indexes come from `GET …/index/details` (server 1.8.1), which lists the keys as an **ordered** array — so the order is right for a custom-named compound index too (before 1.8.1 it only survived in the standard name `c_1_b_1`). Order matters: queries must filter on the first field.
:::

::: warning A partial filter is shown as a flag only
The server lists an index's `partialFilterExpression` garbled (`{ "n": { "underlying": null } }`), so the table only says that there **is** a partial filter, never what it is. Creating one works.
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
| Text | 1–8 | one text index may cover several fields (a collection has at most one); the direction is not used |
| Expiring | one (a date field) | *Expire after*: a number and `s`, `m`, `h` or `d` — `3600s`, `7d` |

Every kind but expiring can get a **name**, be **sparse** (only documents that have the field), **hidden** (kept up to date but not used by queries) and have an optional **partial filter** (a MongoDB filter as JSON — only matching documents are indexed; not together with sparse, the form refuses the combination). Compound order is kept: the keys go to the server as an ordered list. The form says what is missing (empty or repeated field, bad duration, a partial filter that is not a JSON object, too many fields) before anything is sent. Creating an index that already exists is a no-op on the server, not an error; an index with the same fields but other options is refused and the server's message is shown. A unique index over duplicate data answers with a readable "the existing documents repeat values of these fields" instead of MongoDB's raw error.

## Dropping

The trash button asks for the **index name** (the same typed confirmation as dropping a collection, [`MongocampConfirmByName`](/components/mongocamp-confirm-by-name)). The `_id_` index has no drop button and the component refuses it as well.
