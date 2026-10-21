# MongocampSettings

Read-only viewer for the MongoCamp server's settings: the loaded plugins and a searchable, paged table of every configuration (key, value, type, whether a change needs a restart). Administrators only.

## Usage

```vue
<template>
  <MongocampSettings />
</template>
```

## Props

None.

## Behavior

- **Admins only** — for anyone else (`useMongocampRoles().isAdmin` is false) the component shows a short notice and asks the server nothing. Like the other role checks it is UI-level gating; the server decides what a token may read.
- **Plugins** — the route, file and ignored plugins the server reports.
- **Configurations** — sorted by key; the grey line under a key is the server's own comment. Search matches key, comment, type and the *visible* value, client-side. The table is paged ten rows at a time with a pager that only appears when needed.
- **Errors** — a failed load shows [`MongocampErrorAlert`](/components/mongocamp-error-alert) with retry; the refresh button reloads both requests.
- **Read-only** — there is no way to change a setting or stop the server from here. `shutdown` and `updateConfiguration` are not wrapped anywhere in this module.

## Secrets are never shown

The server's configuration list contains real secrets — on a stock MongoCamp 1.5.10 the auth secret, the database user name and password, and the database host. A value is **masked** (shown as a "••••••••" badge) when its key looks secret (`pass`, `secret`, `token`, `api key`, `credential`, `private`, `username`, `host`) and the value is text or a non-empty list. Switches and numbers stay visible even under such a key (`AUTH_TOKEN` is just a boolean, `AUTH_APIKEYLENGTH` just a number), and an unset secret shows "—".

Masking happens while the rows are built, before anything is rendered: the original value is never copied into a row, so it cannot reach the page, the search box or a copy/paste, and **there is no reveal button**. The key-based rule is a heuristic — a secret stored under an innocent-looking key would be shown, so treat the page as admin-only regardless. The `/system/settings` response repeats the whole configuration map; it is dropped, only its plugin lists are used.

## Related composables

- [`useMongocampSystem`](/composables/use-mongocamp-system) — `getSettings`, `listConfigurations`
- [`useMongocampRoles`](/composables/use-mongocamp-roles) — the admin check
