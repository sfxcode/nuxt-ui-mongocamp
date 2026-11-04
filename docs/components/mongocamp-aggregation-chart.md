# MongocampAggregationChart

Charts the rows an aggregation page already holds — **no request**. Used by [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder)'s **Table | Chart** switch, usable on its own:

```vue
<MongocampAggregationChart :rows="rows" />
```

The columns are chosen automatically and can be changed in three selects (label, up to 6 value columns, type):

- **Label:** `_id` when present, else the first column with a non-number. A `$bucketAuto` range `{ min, max }` is written `min–max`, a compound `_id` as `key=value` pairs, `null` as `(none)`.
- **Values:** every column with a number in it.
- **Type:** a donut for 2–6 non-negative slices of one value, an area for date-like labels (`2025-01…`), otherwise bars.

At most 100 rows of the page are charted and the component says so; rows without a number in the chosen columns are left out and counted. With no numeric column it says that instead of drawing an empty chart. Every chart has the data table as a text alternative ([`MongocampChart`](/components/mongocamp-chart)).

Pure part: `utils/resultChart.ts` (`buildResultChart`, `labelText`, `defaultKind`, `valueColumns`) and `utils/chartData.ts` (`topNWithOther`, `shortenLabel`).
