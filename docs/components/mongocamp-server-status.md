# MongocampServerStatus

A compact block that says which server the app talks to and how it is doing: a coloured dot, the server's name, the MongoCamp and MongoDB versions, connections in use and the uptime. Made for the foot of a sidebar. For the full picture use [`MongocampServerInfo`](/components/mongocamp-server-info).

## Usage

```vue
<template>
  <MongocampServerStatus />
</template>
```

In a sidebar that can collapse, show only the dot:

```vue
<MongocampServerStatus :collapsed="collapsed" />
```

The component brings no padding or border — set them with `class`.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `collapsed` | `boolean` | `false` | Show only the coloured dot; the health text is its tooltip and its accessible name |
| `autoRefresh` | `number` | `30` | Reload every N seconds; `0` turns it off. Pauses while the browser tab is hidden and slows down while the server does not answer |
| `detailsPath` | `string` | module option [`paths.server`](/guide/configuration#paths) | Where the block links to. `''` removes the link |

## What it shows

| Health | Dot | When |
|---|---|---|
| Server reachable | green | Everything that was asked answered |
| Server reachable, some details unavailable | amber | A request failed or the server refused it, or the load came without connection numbers (the database user lacks MongoDB's `clusterMonitor` role) |
| Server not reachable | red | No request got any answer (network error, timeout) |

The health is always there as text too (visually hidden next to the dot), so it does not depend on colour.

As a link, the block is named by what it shows (so voice control can use the visible server name), followed by visually hidden "Server status details".

What appears depends on who is looking:

| Viewer | Shown | Requests |
|---|---|---|
| Not signed in | Server name and MongoCamp version (from the runtime plugin) | none |
| Signed in, not an administrator | plus the MongoDB version | `GET /system/info` |
| Administrator, or [server proxy mode](/guide/server-proxy-auth) | plus connections, a usage meter and the uptime; the block is a link to the server page | `GET /system/info`, `GET /system/stats` |

Both endpoints need MongoCamp server 1.9.0. An older server answers them with an error: the block then shows the name and version and "some details unavailable".

## Exposed

| Method | Description |
|---|---|
| `refresh()` | Load again now. Never rejects |

## Related

- [`MongocampServerInfo`](/components/mongocamp-server-info) — the full server status page
- [`MongocampVersion`](/components/mongocamp-version) — the versions as badges
- [`useMongocampSystem`](/composables/use-mongocamp-system) — `getStats()`, `getServerInfo()`
