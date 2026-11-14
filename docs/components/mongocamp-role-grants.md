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
| `hideHeading` | `boolean` | no | Hide the component's own heading, e.g. when the page around it already shows a title. The toolbar stays. |
| `hideRefresh` | `boolean` | no | Hide the component's own reload button, e.g. when the page calls the exposed `refresh()` from its own header. |

## In a page with its own header

The component can hand its toolbar to the page around it:

- **`refresh()`** is exposed — call it through a template ref from your own reload button, and set `hideRefresh` to drop the built-in one.
- **`toolbar` slot** — your own buttons, placed beside the built-in ones.
- **`changed` event** — emitted after a grant change was saved, once the component has reloaded. Never on a failed or cancelled action, never on a plain reload.

```vue
<script setup lang="ts">
const list = useTemplateRef<{ refresh: () => void }>('list')
</script>

<template>
  <header>
    <h1>My title</h1>
    <UButton icon="i-lucide-refresh-cw" @click="list?.refresh()" />
  </header>
  <MongocampRoleGrants ref="list" :role-name="name" hide-heading hide-refresh @changed="reloadOtherLists">
    <template #toolbar>
      <UButton>Mine</UButton>
    </template>
  </MongocampRoleGrants>
</template>
```

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
- **Add all read-only** — one click grants `read` (no `write`/`administrate`) on every collection that has no grant yet, in a single save. MongoCamp's own collections (names starting with `mc_`) are skipped and existing grants are left untouched. The button is disabled when there is nothing left to add.
- **The table only changes after a confirmed save.** Add, edit and remove build the new grant list as a *copy*, save it, and then reload the role from the server. If the server refuses, nothing in the table changes (it still shows what the server really has) and the reason is shown: inside the dialog for add/edit, which stays open so your input isn't lost, or as a "Failed to save grants" alert above the table for a remove. The alert clears on the next save, reload or dialog open. Edit and remove buttons are disabled while a save is running.
- A failed load shows [`MongocampErrorAlert`](/components/mongocamp-error-alert) with retry; no grants shows an empty state.
- **Unknown role** — when `roleName` is not among the server's roles (renamed, deleted, a mistyped link), it says "There is no role …" instead of an empty, editable list: no table, no Add buttons.
- **Toasts** — the saves that have no dialog of their own confirm with a success toast: **Remove** ("… no longer has a grant for …") and **Add all read-only** (how many collections were added). Add and edit confirm by closing their dialog.

## Related composables

- [`useMongocampAdmin`](/composables/use-mongocamp-admin)
