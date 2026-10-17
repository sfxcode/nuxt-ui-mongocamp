# MongocampEmptyState

Centered icon + message for a table with no rows. Meant for `UTable`'s `#empty` slot.

## Usage

```vue
<UTable :data="rows" :columns="columns">
  <template #empty>
    <MongocampEmptyState title="No jobs found" icon="i-lucide-clock" />
  </template>
</UTable>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `icon` | `string` | `i-lucide-inbox` | Icon name |
| `title` | `string` | `No data` | Main text |
| `description` | `string` | — | Secondary text |

The default slot renders below the text, e.g. for an action button.
