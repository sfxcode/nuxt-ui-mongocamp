# useMongocampNavigation

The module's pages as navigation data: translated labels, icons and links, already filtered by what the current user may see. One source for a sidebar, a mobile menu and a set of dashboard cards.

```ts
const { groups, menu } = useMongocampNavigation()
```

Both are computed and follow the login state and the locale.

## A sidebar

`menu` has the shape `UNavigationMenu` takes:

```vue
<script setup lang="ts">
const { menu } = useMongocampNavigation()
</script>

<template>
  <UNavigationMenu orientation="vertical" :items="menu" />
</template>
```

## What you get

| Group | Label | Pages | For |
|---|---|---|---|
| `main` | — | Home, Account | everyone (no Account in [server proxy mode](/guide/server-proxy-auth), where nobody is logged in) |
| `data` | Data | Collections, Databases, Jobs | administrators |
| `access` | Access | Users, Roles, Permissions | administrators |
| `server` | Server | Overview, Server, Settings | administrators |

"Administrators" means `canSeeAdmin` from [`useMongocampRoles`](/composables/use-mongocamp-roles): an administrator, or anyone in proxy mode.

The links come from the module option [`paths`](/guide/configuration#paths). Home is marked `exact: true`, so it is highlighted only on the home page itself.

## Shapes

```ts
groups.value
// [
//   { key: 'main', items: [{ key: 'home', label: 'Home', icon: 'i-lucide-house', to: '/secured', exact: true }, …] },
//   { key: 'data', label: 'Data', items: [{ key: 'collections', label: 'Collections', icon: 'i-lucide-database', to: '/secured/admin/collections' }, …] },
//   …
// ]

menu.value
// [
//   [{ key: 'home', … }, { key: 'account', … }],
//   [{ type: 'label', label: 'Data' }, { key: 'collections', … }, …],
//   …
// ]
```

Each item's `key` is its key in `paths`, so you can pick single pages out.

## Adding your own pages

The module does not know your app's other pages. Add them around its groups:

```ts
const { menu } = useMongocampNavigation()
const { canSeeManagement } = useMongocampRoles()

const items = computed(() => {
  const [main = [], ...admin] = menu.value
  return [
    [...main, ...(canSeeManagement.value ? [{ label: 'Reports', icon: 'i-lucide-chart-bar', to: '/reports' }] : [])],
    ...admin,
  ]
})
```

## It does not protect anything

This decides what is shown. Who may open a route is the job of the [route protection](/guide/route-protection), and what a request may do is decided by the server.

## Related

- [`useMongocampBreadcrumbs`](/composables/use-mongocamp-breadcrumbs) — where the current route sits among these pages
- [`useMongocampPaths`](/composables/use-mongocamp-paths) — the links
- [`MongocampCommandPalette`](/components/mongocamp-command-palette) — jump to a collection, user or role by name
