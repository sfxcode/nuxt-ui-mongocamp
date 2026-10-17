# MongocampUsers

Full CRUD table for managing users — create, edit (roles via a transfer listbox, password change), and delete, all via modal dialogs. Includes a server-side debounced search input and sortable column headers.

## Usage

```vue
<template>
  <MongocampUsers />
</template>
```

## Props

None.

## Behavior

- **List** — fetched via `useMongocampAdmin().listUsers(filter)`, debounced 300ms on the search input.
- **Add** — FormKit modal for `userId`, `password`, and roles (`nuxtUIListbox` in `displayMode: 'transfer'`).
- **Edit** — change roles and reset the password from separate modals.
- **Delete** — confirmation modal before calling `deleteUser`. If the server refuses, the dialog stays open and shows why (network/session, permission, or the server's own message) so you can try again or cancel; the list is only reloaded after a successful delete.
- **Sorting** — clickable column headers via `sortHeader()`.
- **Bulk delete** — a checkbox column (with select-all) and a selection bar; confirming deletes the selected users a few at a time via `deleteUser` ([`MongocampBulkDelete`](/components/mongocamp-bulk-delete)). The signed-in user can't be selected, not even through select-all (the checkbox is disabled and says why), since deleting yourself would end your own session. The selection is cleared on every reload; failures are reported and stay selected.
- **Errors / empty** — a failed load shows [`MongocampErrorAlert`](/components/mongocamp-error-alert) with retry; no rows shows an empty state.

## Related composables

- [`useMongocampAdmin`](/composables/use-mongocamp-admin)
