# MongocampRoleGrants

Per-role collection grant management — lists collection grants for a named role, with add/edit/delete. The collection picker in the "Add Grant" form excludes collections that already have a grant.

## Usage

```vue
<template>
  <MongocampRoleGrants role-name="myRole" />
</template>
```

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `roleName` | `string` | yes | Name of the role whose grants are being managed |

## Columns

| Column | Description |
|---|---|
| Collection | The granted collection name |
| Type | `grantType` badge — `COLLECTION` for grants created through this UI |
| Read / Write | Boolean badges |
| Admin | Boolean badge (red when enabled) |

## Behavior

- **Add** — picks a collection (excluding already-granted ones) and toggles `read`/`write`/`administrate`; new grants are created with `grantType: 'COLLECTION'`.
- **Edit** — toggle permissions for an existing grant.
- **Delete** — removes the grant immediately (no confirmation modal).
- Every save calls `updateRole(roleName, isAdmin, grants)` — the API replaces the **entire** grants array, so this component always shallow-clones grants from the role before editing to avoid mutating the source object in place.
- **The table only changes after a confirmed save.** Add, edit and remove build the new grant list as a *copy*, save it, and then reload the role from the server. If the server refuses, nothing in the table changes (it still shows what the server really has) and the reason is shown: inside the dialog for add/edit, which stays open so your input isn't lost, or as a "Failed to save grants" alert above the table for a remove. The alert clears on the next save, reload or dialog open. Edit and remove buttons are disabled while a save is running.
- A failed load shows [`MongocampErrorAlert`](/components/mongocamp-error-alert) with retry; no grants shows an empty state.

## Related composables

- [`useMongocampAdmin`](/composables/use-mongocamp-admin)
