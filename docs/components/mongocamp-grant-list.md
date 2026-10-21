# MongocampGrantList

Read-only table of grants — collection, type, and whether each allows read, write and administrate. Used by the details drawers of [`MongocampUsers`](/components/mongocamp-users) and [`MongocampRoles`](/components/mongocamp-roles). Editing grants stays in [`MongocampRoleGrants`](/components/mongocamp-role-grants).

## Usage

```vue
<script setup lang="ts">
const grants = [
  { name: 'orders', grantType: 'COLLECTION', read: true, write: true, administrate: false },
]
</script>

<template>
  <MongocampGrantList :grants="grants" />
</template>
```

## Props

| Prop | Type | Description |
|---|---|---|
| `grants` | `Grant[]` | Required. The grants to list (the `Grant` type from `@sfxcode/nuxt-mongocamp-server`) |

## Behavior

- Columns: **Collection**, **Type** (the `grantType`, e.g. `COLLECTION`), and **Read** / **Write** / **Admin** as Yes/No badges.
- An empty list shows the "No grants yet" empty state.
- It only displays what it is given: nothing is fetched and the array is not modified, so pass a copy if the source must stay untouched (the drawers do).
