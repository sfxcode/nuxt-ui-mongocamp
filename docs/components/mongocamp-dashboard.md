# MongocampDashboard

Landing page for admins: a welcome heading with the connected server name/version, three linked stat cards (collections, users, roles), a refresh button, and an error alert with retry when counting fails. Content for your own app goes in the default slot, below the cards.

Counting calls `listUsers`, `listRoles` and `listCollections`, so it needs an admin session (or an api key in [server proxy mode](/guide/server-proxy-auth)) — wrap it in your own role check.

## Usage

```vue
<template>
  <MongocampDashboard v-if="isAdmin" />
</template>
```

With extra content, and a re-count after your own code changes data:

```vue
<script setup>
const dashboard = ref(null)
async function afterImport() {
  await dashboard.value?.refresh()
}
</script>

<template>
  <MongocampDashboard ref="dashboard" users-path="/admin/people">
    <MyImportCard @done="afterImport" />
  </MongocampDashboard>
</template>
```

The component brings no outer padding (it had `py-8` up to 1.5.1) — the page around it decides the spacing, as with every other component.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `collectionsPath` | `string` | `/secured/admin/collections` | Link target of the Collections card |
| `usersPath` | `string` | `/secured/admin/users` | Link target of the Users card |
| `rolesPath` | `string` | `/secured/admin/roles` | Link target of the Roles card |
| `autoRefresh` | `number` | `0` | Reloads every N seconds (at least 1; `0` = off, the default) through [`useMongocampAutoRefresh`](/composables/use-mongocamp-auto-refresh): pauses while the tab is hidden, never overlaps a running load and slows down after failures. A failed background reload keeps what is on screen and shows the error banner. |
| `hideHeading` | `boolean` | `false` | Hide the component's own heading, e.g. when the page around it already shows a title. The toolbar stays. The subtitle goes with it. |
| `hideRefresh` | `boolean` | `false` | Hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header. |

## Slots

| Slot | Description |
|---|---|
| default | Rendered below the stat cards |

## Exposed

| Member | Description |
|---|---|
| `refresh()` | Re-counts and updates the cards |

## Related

- [`MongocampVersion`](/components/mongocamp-version)
- [`MongocampErrorAlert`](/components/mongocamp-error-alert)
