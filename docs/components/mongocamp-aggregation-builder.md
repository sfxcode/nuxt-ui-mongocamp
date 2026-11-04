# MongocampAggregationBuilder

Build and run an aggregation pipeline on a collection without leaving the UI: group and count, compute fields, sort and limit — then page through the result and export it. Two views of the same pipeline: a **Stages** editor and a plain **JSON** view.

## Usage

```vue
<template>
  <MongocampAggregationBuilder collection-name="myCollection" />
</template>
```

The playground has it at `/secured/admin/collections/<name>/aggregate`, linked from the collection's data and info pages.

## Props

| Prop | Type | Description |
|---|---|---|
| `collectionName` | `string` | Required. Collection the pipeline runs on. Changing it clears the shown result. |

## The two views

**Stages** — a list of stages, each the JSON text of its value. Add a stage by type (`$match`, `$group`, `$sort`, `$project`, `$limit`, `$unwind`, `$addFields`, `$count`, `$bucketAuto`), move it up or down, or remove it. A new stage starts with a sensible example (`$group` → `{ "_id": "$field", "count": { "$sum": 1 } }`). The text is kept as typed, so a half-written value is never lost.

| Stage | Value | Notes |
|---|---|---|
| `$match` | an object | filter documents (MongoDB query syntax, not Lucene) |
| `$group` | an object with `_id` | `{ "_id": "$field", "n": { "$sum": 1 } }`; `"_id": null` groups everything |
| `$sort` | an object of `1` / `-1` | `{ "n": -1 }` |
| `$project` | an object | pick or compute fields |
| `$limit` | a whole number ≥ 1 | a typed `"10"` is sent as the number 10 |
| `$unwind` | a field path, or an object with `path` | `"$tags"` — one document per array item; `{ "path": "$tags", "preserveNullAndEmptyArrays": true }` keeps documents without items |
| `$addFields` | an object | `{ "double": { "$multiply": ["$price", 2] } }` — add computed fields |
| `$count` | the name of the result field | `"total"` — no `$`, no dot; the result is one document `{ "total": 12 }` |
| `$bucketAuto` | an object with `groupBy` and a whole `buckets` ≥ 1 | `{ "groupBy": "$price", "buckets": 5, "output": { "n": { "$sum": 1 } } }` — ranges chosen by the server |

A stage with nothing in it (`{}` or empty) is left out of the request.

**JSON** — the pipeline as the usual array, `[ { "$match": { … } }, { "$limit": 10 } ]`. Any stage the server understands can be typed here, including ones the stage editor has no form for (`$sample`, `$facet`, `$set`, …).

Switching is guarded in both directions: a stage with a mistake blocks leaving the stage editor, and a pipeline using a stage the editor has no form for keeps you in the JSON view. Both say why.

## Mistakes are caught before the server sees them

Live, under the stage or the JSON: not valid JSON; a stage value that is not an object; a `$limit` that is not a whole number of 1 or more; a `$sort` direction other than `1`/`-1`; a `$group` without `_id`; in the JSON view also "not an array", "more than 50 stages", and a stage that is not an object with exactly one `$`-named key (the message names the stage number). **Run** stays disabled while there is any mistake.

## What is not allowed, and why

These operators are refused **anywhere in a pipeline** — as a stage or nested inside another stage's value (a `$function` hides inside `$addFields`, a `$lookup` inside a `$facet`):

| Operator | Why |
|---|---|
| `$function`, `$accumulator`, `$where` | run JavaScript on the database server |
| `$out`, `$merge` | write to collections |
| `$lookup`, `$unionWith`, `$graphLookup` | read other collections (the server enforces grants for them and refuses a collection without one; the builder still refuses them up front) |
| `$collStats`, `$indexStats` | the server includes the database server's address (`host`) and namespace in every result row |

Since server 1.6.3 the server also refuses `$function`, `$accumulator`, `$where`, `$out`, `$merge` and `$currentOp` itself (`403`, code `4031`), even when nested; if one ever got past the check above, the alert reads "This pipeline uses $function, which is not allowed here." instead of a permission error. `$lookup`, `$unionWith`, `$graphLookup` and `$collStats` are still accepted by the server, which is why the client check stays.

The refusal names the operator (and the stage in the JSON view). It exists because MongoCamp servers up to 1.5.x **did not restrict aggregation stages**: a `$function` stage executed JavaScript, and `$lookup`/`$unionWith` read other collections (whether the user's per-collection grants apply to them was not tested). Server 1.6.3 now refuses the JavaScript and write operators itself, but still runs the cross-collection stages, so the check stays. The same check runs again in [`useMongocampAggregation().runAggregation`](/composables/use-mongocamp-aggregation), so nothing that bypasses this component can send such a pipeline either. Only keys count: a string value or field name such as `"$out"` or `merge` is just data. (`$out` and `$merge` could never run on 1.5.x either: the server answered that they must be the final stage, and its own paging stages always follow.)

## Preview after a stage

Each stage has **Preview after this stage**: it runs the stages up to and including that one, cut by a `$limit` of 5, and shows those documents right under the stage — so you see what a `$group` or `$unwind` really produced before adding the next one. It runs when opened and again, **debounced (500 ms)**, when you edit any stage it depends on; an older request is **cancelled**. A closed preview makes no request. A stage with a mistake blocks the preview of itself and of every later stage until it is fixed, and a server error is shown with MongoDB's own message. The preview never replaces the real result.

## Templates

**Templates** adds the stages for a common question; every stage stays editable:

| Template | Stages |
|---|---|
| Count by field | `$group` by the field with a count, `$sort` by the count |
| Most common values | the same, then `$limit` (10 by default, 1–1000) |
| Documents per month or day | `$group` by `$dateToString` of a date field (`%Y-%m` or `%Y-%m-%d`), `$sort` by the period |
| Sum and average by group | `$group` by a field with `total`, `avg` and `count` of a number field, `$sort` by the group |

The field names of the collection are offered while typing (the server's field list; if it cannot be read you can still type). The stages go **after** the stages that are already there; an editor that still holds only the untouched first stage is replaced. Field names must not contain `$`.

## Saved pipelines

**Saved pipelines** keeps named pipelines of this collection **in this browser only** (50 per collection, [`useMongocampSavedPipelines`](/composables/use-mongocamp-saved-pipelines)). *Save current pipeline* stores what would run (it must be valid and not empty); clicking a saved one puts it into the stage editor, or into the JSON view when it uses a stage the editor has no form for. A stored pipeline is checked like one typed into the JSON view, so edited browser storage cannot bring back a denied operator.

## Running and results

**Run** sends the pipeline and shows the first page.

- Paging is done by the server: the page-size select (10 / 20 / 50 / 100, default 20) and the pager re-run the pipeline **that produced the result**, not whatever has been typed since. Changing the page size goes back to page 1. A run that is overtaken by a newer one is ignored.
- The table has one column per key found in the first rows, `_id` first (a `$group`'s key). Objects and arrays show as compact JSON with the full text as a tooltip; very long values are shortened.
- The header shows the total number of results. **Export** (download icon) saves the **current page** as JSON or CSV — raise the page size first for more.
- A pipeline with no results shows an empty state, not an error.
- Results are plain JSON: dates arrive as ISO text (without milliseconds) and whole numbers beyond 2^53 are shown as text with every digit (the response is read from its text, because the generated client's `JSON.parse` would round them) — a note under the table says so.

## When it fails

A failed run shows an alert with the reason and **Retry** (or **Log in again** when the session has expired). For a command MongoDB rejects, only MongoDB's own message is shown — the server's raw error also contains the address of the database server, which is never displayed. A request blocked on its way to the server (an intermittent `405` was seen) is reported as retryable.

## Not included

Sharing pipelines between browsers, charts, and stages beyond the nine forms (use the JSON view). Pipelines are read-only by design — nothing here writes data.

## Related

- [`useMongocampAggregation`](/composables/use-mongocamp-aggregation) — the calls behind it
- Strings live under `nuxtUiMongocamp.aggregation.*` in the English and German locale files
