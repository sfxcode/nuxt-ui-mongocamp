# MongocampRoles

Full CRUD table for managing roles — create, edit (admin flag, collection grants), and delete. Includes a server-side debounced search input and sortable column headers. The key icon on each row links to the grant management page.

## Usage

```vue
<template>
  <MongocampRoles grants-path="/secured/admin/roles" />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `grantsPath` | `string` | `/secured/admin/roles` | Base path the key icon links to: `<grantsPath>/<roleName>` |

## Behavior

- **List** — fetched via `useMongocampAdmin().listRoles(filter)`, debounced 300ms on the search input.
- **Add / Edit** — name, `isAdmin` flag.
- **Delete** — confirmation modal before calling `deleteRole`.
- Grant management itself lives in [`MongocampRoleGrants`](/components/mongocamp-role-grants), reached via the key icon.

## Related composables

- [`useMongocampAdmin`](/composables/use-mongocamp-admin)
