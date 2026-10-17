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

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `collectionsPath` | `string` | `/secured/admin/collections` | Link target of the Collections card |
| `usersPath` | `string` | `/secured/admin/users` | Link target of the Users card |
| `rolesPath` | `string` | `/secured/admin/roles` | Link target of the Roles card |

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
