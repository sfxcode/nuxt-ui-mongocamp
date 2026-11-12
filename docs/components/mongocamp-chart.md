# MongocampChart

Nuxt UI's [`UChart`](https://ui.nuxt.com/docs/components/chart) with what every chart of this module needs, so none of them repeats it. [`MongocampCollectionCharts`](/components/mongocamp-collection-charts) and [`MongocampServerOverview`](/components/mongocamp-server-overview) are built on it; use it for your own charts too. `UChart` needs `@tanstack/charts`, which this module depends on.

```vue
<MongocampChart
  type="bar"
  :data="[{ name: 'orders', value: 900 }, { name: 'users', value: 20 }]"
  index="name"
  :categories="[{ key: 'value', label: 'Size' }]"
  chart-label="Size per collection"
  chart-description="2 collections; the biggest is orders."
  :format="formatBytes"
/>
```

## Axis labels

On a bar or area chart an axis label is cut to 18 characters (`test_order_backup…`): a long name made the axis drop its neighbours' labels, leaving bars without a name. Names that would become identical after cutting keep their full text, and the data table always shows the real names.

## Loading

The chart library (`@tanstack/charts`, about 52 KB gzipped) is its own chunk, fetched through `LazyUChart` only when the chart scrolls into view (an `IntersectionObserver`; without one it draws at once). A chart inside a closed `<details>` — as on the collections, databases, indexes and field-statistics cards — therefore costs nothing until it is opened. Measured on the playground build: before, five route chunks imported the chart chunk statically (it loaded with those pages); now none does. The data table is rendered regardless, so the numbers are never waiting on the library.

## Props

| Prop | Type | Description |
|---|---|---|
| `type` | `'bar' \| 'area' \| 'line' \| 'donut'` | default `bar` |
| `data` | `Record<string, unknown>[]` | one object per bar, point or slice |
| `index` | `string` | the key of the label (x axis; the slice name of a donut) |
| `categories` | `{ key, label }[]` | the numeric keys drawn; a donut uses the first |
| `chartLabel` | `string` | the accessible name (`aria-label` of the chart) |
| `chartDescription` | `string` | the accessible description |
| `indexLabel` | `string` | header of the label column in the table |
| `format` | `(n: number) => string` | axis, tooltip and table numbers; default: the app locale's number format |
| `height` | `number` | default `260` |
| `showTable` | `boolean` | the collapsible data table, default on |
| `legend` | `boolean` | default: shown for a donut or several series |
| `emptyText` | `string` | shown instead of the chart when `data` is empty |

## What it does for you

- **Theme colours.** Six series colours are passed as `var(--ui-chart-N)`, the first being the primary colour. With the UnoCSS preset this needs `unocss-nuxt-ui` 1.3.0 or newer, which defines `--ui-chart-*` and the `in-data-*` variant `UChart` uses to fade in (earlier versions left the chart invisible and uncoloured, canstand/unocss-nuxt-ui#2).
- **Accessible.** The `aria-label`, the `aria-description` and a collapsible table with the same numbers; colour never carries meaning alone.
