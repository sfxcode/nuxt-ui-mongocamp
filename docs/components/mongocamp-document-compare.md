# MongocampDocumentCompare

Two documents side by side, compared path by path.

```vue
<MongocampDocumentCompare :left="docA" :right="docB" left-label="v1" right-label="v2" v-model:only-differences="onlyDiff" />
```

| Prop | Description |
|---|---|
| `left`, `right` | The two documents (plain, or with extended-JSON wrappers) |
| `leftLabel`, `rightLabel` | Column headers (default "Left"/"Right") |
| `v-model:onlyDifferences` | Hide the paths both documents agree on (default `false`) |

Each path gets a **text label** (same / changed / added / removed) as well as a colour, plus a count summary. A leaf with the same text but another stored type (`1` vs `"1"`) is *changed* and shows both types; a wrapper next to its plain form (`{ $oid }` vs the id string, `{ $date }` vs an ISO string, an instant written in another zone) is *same*. With documents read typed (`extendedJson=canonical`, as the data table's Compare does) two **exact numeric types** also differ: an `int` 5 and a `long` 5, or a `double` and a `decimal` with the same text; a plain number next to an exact wrapper still does not. Key order is not a difference. Very large documents are cut at the path limit and say so.

## In the data table

`MongocampCollectionData` shows **Compare selected** in the selection bar when exactly two rows on screen are ticked; it opens this component in a dialog, headed by the two `_id`s.

Pure part: `utils/documentCompare.ts` (`compareDocuments`, `compareText`, `plainValue`) over `flattenDocument`.
