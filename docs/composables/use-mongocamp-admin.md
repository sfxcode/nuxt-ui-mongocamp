# useMongocampAdmin

Wraps `adminApi` and `collectionApi` (from `useMongocampApi()`) for user and role management.

```ts
const {
  listUsers,          // (filter?: string) => Promise<UserProfile[]>
  addUser,            // (userId, password, apiKey?, roles?) => Promise<UserProfile>
  deleteUser,         // (userId) => Promise<void>
  updateUserRoles,    // (userId, roles) => Promise<UserProfile>
  updateUserPassword, // (userId, password) => Promise<void>
  listRoles,          // (filter?: string) => Promise<Role[]>
  addRole,            // (name, isAdmin?, collectionGrants?) => Promise<Role>
  updateRole,         // (roleName, isAdmin, collectionGrants?) => Promise<Role>
  deleteRole,         // (roleName) => Promise<void>
  listCollections,    // () => Promise<string[]>
} = useMongocampAdmin()
```

## `updateRole` replaces the whole grants array

There is no PATCH endpoint for roles — `updateRole(roleName, isAdmin, collectionGrants)` replaces `isAdmin` and the **entire** `collectionGrants` array. When building an edit form:

- Always shallow-clone grants before binding them to the form: `role.collectionGrants.map(g => ({ ...g }))`.
- If your edit form only exposes `isAdmin` (no grant UI), still populate the grants from the role and pass them back on save — otherwise grants are silently wiped.

See [`MongocampRoleGrants`](/components/mongocamp-role-grants) for the full pattern.
