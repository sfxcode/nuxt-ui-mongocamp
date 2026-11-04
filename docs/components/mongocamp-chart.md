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

- **Series colours with a fallback.** Nuxt UI's stylesheet defines `--ui-chart-1…6`; an app whose theme comes another way (the UnoCSS preset) has none and the bars would have no colour. Six colours are always passed, each `var(--ui-chart-N, <fallback>)`, the first falling back to `--ui-primary`.
- **Visible without Tailwind v4.** `UChart` hides itself with the variant `in-data-measured:opacity-100`, which the UnoCSS preset never generates, so the chart stayed invisible. `ui.base = 'opacity-100'` wins when the classes merge (the short fade-in is lost). Tracked upstream in [canstand/unocss-nuxt-ui#2](https://github.com/canstand/unocss-nuxt-ui/issues/2); once fixed there, both workarounds can go.
- **Accessible.** The `aria-label`, the `aria-description` and a collapsible table with the same numbers; colour never carries meaning alone.
