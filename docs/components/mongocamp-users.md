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
- **Delete** — confirmation modal before calling `deleteUser`.
- **Sorting** — clickable column headers via `sortHeader()`.

## Related composables

- [`useMongocampAdmin`](/composables/use-mongocamp-admin)
