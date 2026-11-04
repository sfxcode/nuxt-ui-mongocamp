# MongocampCollectionCharts

How the values of **one field** are distributed, drawn with Nuxt UI's [`UChart`](https://ui.nuxt.com/docs/components/chart). The chart kind follows the field's type; the numbers come from one aggregation on the server. [`MongocampCollectionInfos`](/components/mongocamp-collection-infos) shows it in its **Distribution** card.

## Usage

```vue
<template>
  <MongocampCollectionCharts collection-name="orders" field="status" />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `collectionName` | `string` | — | Required |
| `field` | `string` | — | Required. A top-level field or a nested path (`address.city`). No `$`, no empty segments |
| `kind` | `'values' \| 'dates' \| 'numbers'` | detected | Force a chart kind instead of detecting it from a sample of 200 documents |
| `top` | `number` | `10` | Values: how many of the most common values are shown |
| `buckets` | `number` | `10` | Numbers: how many ranges |

## The three charts

| Field type | Chart | Aggregation |
|---|---|---|
| text, true/false | **Most common values** — bars | `$group` by the field, `$sort` by the count; one page of `top` rows. The page total is the number of distinct values, so the note says *The 10 most common of 214 values.* Documents without a value are the bar `(none)` |
| date | **Documents over time** — bars (up to 36 periods) or an area chart; a **Per** year / month / day selector | `$match` on `$type: 'date'`, `$group` by `$dateToString`, `$sort` by period; at most 100 periods (the note says if more were cut) |
| number | **Distribution of numbers** — bars | `$match` on `$type: 'number'`, then `$bucketAuto`: ranges that each hold about the same number of documents; the labels are `min–max`, a number beyond 2^53 keeps every digit |

Arrays, objects and fields that are only ever empty get a message instead of a chart. The `$type` matches matter: a text value in a number field would otherwise end up as a range bound, and `$dateToString` fails on a non-date.

## Accessibility

- The chart has an `aria-label` (*Most common values: status*) and an `aria-description` with the number of bars and the highest one.
- **Show the data as a table** opens the same numbers as a table, so nothing depends on seeing the bars.
- The colour carries no meaning on its own: every bar is labelled on the axis.

## Requirements and styling

- `UChart` needs the package [`@tanstack/charts`](https://tanstack.com/charts) — this module depends on it, so it is installed with the module.
- Nuxt UI's stylesheet defines the series colours `--ui-chart-1…6`; where they are missing (the UnoCSS preset), the bars use `--ui-primary`.
- `UChart` fades in with a Tailwind v4-only variant (`in-data-measured:`) that the UnoCSS preset never generates, which would leave the chart invisible; the component overrides that one class, so it shows in both setups (without the fade).
- Loading, an error with **Try again**, and a request that is cancelled when the field changes or the component goes away are handled for you.
