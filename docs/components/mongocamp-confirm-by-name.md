# MongocampConfirmByName

Confirmation modal for destructive actions: the confirm button stays disabled until the user types an exact name (for example the collection that is about to be dropped). Used by [`MongocampCollections`](/components/mongocamp-collections) for clear/drop and for the bucket clear/delete actions.

## Usage

```vue
<script setup lang="ts">
const open = ref(false)

async function drop() {
  await myApi.dropThing('orders') // a rejection keeps the modal open and shows the reason
}
</script>

<template>
  <UButton label="Drop" @click="open = true" />
  <MongocampConfirmByName
    v-model:open="open"
    name="orders"
    title="Drop Collection"
    description="This permanently deletes the collection."
    confirm-label="Drop Collection"
    :on-confirm="drop"
  />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` (`v-model:open`) | `boolean` | `false` | Whether the modal is shown |
| `name` | `string` | — | The exact text the user has to type |
| `title` | `string` | — | Modal title |
| `description` | `string` | — | Text above the input; say what is lost |
| `confirmLabel` | `string` | — | Label of the confirm button |
| `confirmColor` | `'error' \| 'warning'` | `'error'` | Colour of the confirm button |
| `confirmIcon` | `string` | `i-lucide-trash-2` | Icon of the confirm button |
| `onConfirm` | `() => Promise<void>` | — | The action to run once the name matches |

## Behavior

- **Matching:** the typed text is trimmed, then compared to `name` **case-sensitively**. A pasted trailing space is forgiven; `Orders` does not match `orders`.
- **Enter** runs the same guarded handler as the button, so it can never bypass the name check.
- **Failure:** when `onConfirm` rejects, the modal stays open and shows the reason (mapped by [`useMongocampError`](/composables/use-mongocamp-error)); the user can retry or cancel.
- **Success:** the modal closes after `onConfirm` resolves.
- **Busy:** while `onConfirm` runs, the input and Cancel are disabled and the modal cannot be dismissed.
- **Reopening** starts with an empty field and no stale error.
