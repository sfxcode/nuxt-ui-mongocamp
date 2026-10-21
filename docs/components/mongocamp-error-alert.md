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
| `filterRejected` | `boolean` | `false` | Set by a parent that has shown the request only fails because of the filter it sent (a retry without it worked). Replaces the message with "The filter could not be applied" and the Retry button with **Clear filters** |

## Telling a dead session from a dead server

A token the server refuses is a `401` without CORS headers, which the browser reports exactly like a dead network. So for a network failure the alert asks [`useMongocampSession().diagnoseFailure()`](/composables/use-mongocamp-session) (a shared, rate-limited check; none at all in server proxy mode) and picks the message:

| Diagnosis | Message | Button |
|---|---|---|
| Session ended — the token has expired, or the server refuses it; also a readable `401` | "Your session has expired. Please log in again." | **Log in again** |
| The server is up and accepts the token, but refused this request | "The server is reachable and your session is valid, but it refused this request…" | **Retry** |
| Inconclusive (server down, no token, proxy mode) | "The server could not be reached, or your session has expired…" | **Retry** |

Until the check answers, and if it throws, the plain network message stands. A parent that has already proven the failure was a rejected filter passes `filterRejected` and no check is made.

**Log in again** first clears the stored session (through the dependency's `logout()`) and only then navigates to `loginPath`. The order matters: while the cookie still holds the dead token the app believes it is logged in, and a login page that redirects logged-in users would bounce straight back.

## Events

| Event | Description |
|---|---|
| `retry` | Retry button clicked (not shown for 401 or when `filterRejected`) |
| `clearFilters` | **Clear filters** clicked (only shown when `filterRejected`) |
