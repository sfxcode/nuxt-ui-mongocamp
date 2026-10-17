# MongocampErrorAlert

Error banner for a failed load. Turns whatever the MongoCamp client threw into a readable message (via [`useMongocampError`](/composables/use-mongocamp-error)) and offers **Retry**, or **Log in again** when the session has expired (HTTP 401). Renders nothing while `error` is empty. Used by every list component in this module.

## Usage

```vue
<script setup lang="ts">
const loadError = ref<unknown>(null)
async function load() {
  loadError.value = null
  try { /* ... */ }
  catch (e) { loadError.value = e }
}
</script>

<template>
  <MongocampErrorAlert :error="loadError" @retry="load" />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `error` | `unknown` | — | The caught error; falsy hides the alert |
| `title` | `string` | `Failed to load data` | Alert title |
| `loginPath` | `string` | `/` | Target of the **Log in again** button |
| `filterRejected` | `boolean` | `false` | Set by a parent that has shown the request only fails because of the filter it sent (a retry without it worked). Replaces the message with "The filter could not be applied" and the Retry button with **Clear filters** |

## Events

| Event | Description |
|---|---|
| `retry` | Retry button clicked (not shown for 401 or when `filterRejected`) |
| `clearFilters` | **Clear filters** clicked (only shown when `filterRejected`) |
