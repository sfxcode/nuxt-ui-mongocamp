# MongocampServerInfo

What the server tells about itself, from three read-only endpoints of **MongoCamp server 1.9.0**: the MongoDB version (`GET /system/info`), the database load (`GET /system/stats`) and the capabilities (`GET /system/capabilities`, every logged-in user).

## Usage

```vue
<template>
  <MongocampServerInfo :auto-refresh="30" />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `hideHeading` | `boolean` | `false` | Hide the heading |
| `hideRefresh` | `boolean` | `false` | Hide the refresh button |
| `hideStats` | `boolean` | `false` | Hide the database load card (its request is skipped too) |
| `hideCapabilities` | `boolean` | `false` | Hide the capabilities card (its request is skipped too) |
| `autoRefresh` | `number` | `0` | Reload every N seconds (0 = off); pauses while the tab is hidden, backs off after failures |

Exposes `refresh()`.

## What it shows

- **Server** — MongoCamp name/version, MongoDB version and major version, uptime of the database server, replica set (name, state, healthy members) when there is one.
- **Database load** — connections in use / available (with a bar) / opened since start, and the operation counters (insert, query, update, delete, getmore, command; totals since the database server started). A database user without the `clusterMonitor` role makes the server answer `partial: true` without those numbers — the card says so instead of showing zeros.
- **Capabilities** — feature names, the largest import, the status a missing grant is answered with, and the aggregation operators the server refuses.

The three parts load independently: one that fails is named and leaves the others on screen. A server without the capabilities route is older than 1.9.0 and is reported as such, not as a failure.

## Related

- [`useMongocampSystem`](/composables/use-mongocamp-system) — `getServerInfo`, `getStats`, `getCapabilities`
- [`MongocampVersion`](/components/mongocamp-version) — the compact badge version
