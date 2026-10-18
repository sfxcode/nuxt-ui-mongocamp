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
- **Clone** — the copy icon opens a dialog asking for the new role name; the new role gets the source role's admin flag and a copy of all its grants (created with a single `addRole` call). A refused clone (e.g. name already taken) keeps the dialog open with the reason.
- **Add / Edit** — name, `isAdmin` flag.
- **Delete** — confirmation modal before calling `deleteRole`. If the server refuses, the dialog stays open and shows why so you can try again or cancel; the list is only reloaded after a successful delete.
- **Bulk delete** — a checkbox column (with select-all) and a selection bar; confirming deletes the selected roles a few at a time ([`MongocampBulkDelete`](/components/mongocamp-bulk-delete)). The selection is cleared on every reload; failures are reported and stay selected.
- **Errors / empty** — a failed load shows [`MongocampErrorAlert`](/components/mongocamp-error-alert) with retry; no rows shows an empty state.
- Grant management itself lives in [`MongocampRoleGrants`](/components/mongocamp-role-grants), reached via the key icon.

## Related composables

- [`useMongocampAdmin`](/composables/use-mongocamp-admin)
