# MongocampUserAccess

Shows the signed-in user what they may do: four counts and a table with one row per collection and a Yes/No for read, write and administrate. A landing page for users who are not administrators.

The server works the answer out from the user's roles and grants (`GET /auth/permissions`, MongoCamp server 1.7.0), so the table shows what the server will actually allow.

## Usage

```vue
<template>
  <MongocampUserAccess />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `hideHeading` | `boolean` | `false` | Hide the "Your access" heading |
| `hideRefresh` | `boolean` | `false` | Hide the reload button, e.g. when the page calls `refresh()` from its own header |
| `hideStats` | `boolean` | `false` | Hide the four count cards |

## Slots

| Slot | Description |
|---|---|
| `toolbar` | Your own buttons, right after the reload button |

## Exposed

| Method | Description |
|---|---|
| `refresh()` | Ask the server again |

## Behaviour

- **Administrators** see a note that they may do everything. No request is sent.
- MongoCamp's own `mc_*` collections are left out.
- A user without any grant sees an empty state that tells them to ask an administrator.
- A failed request shows the usual error banner with Retry; an expired session offers **Log in again**.
- It works in [server proxy mode](/guide/server-proxy-auth): the table then shows what the api key may do.

## Related

- [`useMongocampPermissions`](/composables/use-mongocamp-permissions) — `canRead` / `canWrite` / `canAdminister` for one collection
- [`MongocampPermissionMatrix`](/components/mongocamp-permission-matrix) — the administrator's view: every user against every collection
