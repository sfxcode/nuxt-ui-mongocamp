# MongocampErrorAlert

Error banner for a failed load. Turns whatever the MongoCamp client threw into a readable message (via [`useMongocampError`](/composables/use-mongocamp-error)) and offers **Retry**, or **Log in again** when the session has ended. Renders nothing while `error` is empty. Used by every list component in this module.

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
| `loginPath` | `string` | the module's [`loginPath`](/guide/configuration) option (`/`) | Where **Log in again** goes after clearing the session |
| `filterRejected` | `boolean` | `false` | Set by a parent that knows the request only fails because of the filter it sent (the server answered it with a `400`). Replaces the message with "The filter could not be applied" and the Retry button with **Clear filters** |

## Which message

| Failure | Message | Button |
|---|---|---|
| `401` — the session has ended | "Your session has expired. Please log in again." | **Log in again** |
| Network failure (offline, server down) | "The server could not be reached…" | **Retry** |
| `403`, or any other error | the matching message | **Retry** |
| `filterRejected` | "The filter could not be applied" | **Clear filters** |

No request is made to work this out: since server 1.6.1 a refused token is a readable `401`.

**Log in again** first clears the stored session (through the dependency's `logout()`) and only then navigates to `loginPath`. The order matters: while the cookie still holds the dead token the app believes it is logged in, and a login page that redirects logged-in users would bounce straight back.

## Events

| Event | Description |
|---|---|
| `retry` | Retry button clicked (not shown for 401 or when `filterRejected`) |
| `clearFilters` | **Clear filters** clicked (only shown when `filterRejected`) |
