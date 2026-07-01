# MongocampAccount

A "my account" page for the currently logged-in user — view profile, change password, and regenerate the API key. Unlike every other component, this one is scoped to "the current user," not an admin-managed list of other users/resources.

## Usage

```vue
<template>
  <MongocampAccount />
</template>
```

Mount it under `/secured` (not `/secured/admin`) — any logged-in user should be able to reach their own account page, not just admins.

## Props

None — operates on the currently logged-in user via [`useMongocampAccount`](/composables/use-mongocamp-account).

## Profile card

Read-only: `user`, `isAdmin` (as a badge), and `roles` (as a badge list), fetched fresh from `fetchProfile()` on mount.

## Change Password

A single-field `FUDataEdit` form (`inputType: 'password'`, `validation: 'required|length:3'`, matching `MongocampLogin`'s rule).

## API Key

- **Regenerate** is behind a confirmation modal — regenerating immediately invalidates the current key.
- The new key is displayed **once**, in a read-only copyable field with a visible warning that it won't be shown again (mirrors the copy-to-clipboard pattern in [`MongocampCollectionInfos`](/components/mongocamp-collection-infos)'s "Copy as TS Interface" button). A "Dismiss" button clears it from view once you've copied it.
- The component does not display the *current* API key anywhere — the server only returns a usable key at the moment it's (re)generated.

## Related composables

- [`useMongocampAccount`](/composables/use-mongocamp-account)
