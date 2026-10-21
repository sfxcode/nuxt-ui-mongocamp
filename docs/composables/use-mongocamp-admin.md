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
  clearCollection,    // (collectionName) => Promise<JsonValueBoolean>  — deletes every document
  deleteCollection,   // (collectionName) => Promise<JsonValueBoolean>  — drops the collection
  getJsonSchema,      // (collectionName) => Promise<JsonSchema>
} = useMongocampAdmin()
```

## Clearing and dropping collections

`clearCollection` and `deleteCollection` are **irreversible** and have no guard of their own. Put them behind a type-the-name confirmation ([`MongocampConfirmByName`](/components/mongocamp-confirm-by-name)) and keep MongoCamp's `mc_*` collections and GridFS `.files`/`.chunks` members out of reach (they belong to the bucket actions — see [`useMongocampBucket`](/composables/use-mongocamp-bucket)); [`MongocampCollections`](/components/mongocamp-collections) does both. The three collection methods are bounded by a 15 s timeout, so a hung server rejects instead of hanging, and a refused call (`403`, ...) is rethrown unchanged.

## `updateRole` replaces the whole grants array

There is no PATCH endpoint for roles — `updateRole(roleName, isAdmin, collectionGrants)` replaces `isAdmin` and the **entire** `collectionGrants` array. When building an edit form:

- Always shallow-clone grants before binding them to the form: `role.collectionGrants.map(g => ({ ...g }))`.
- If your edit form only exposes `isAdmin` (no grant UI), still populate the grants from the role and pass them back on save — otherwise grants are silently wiped.

See [`MongocampRoleGrants`](/components/mongocamp-role-grants) for the full pattern.
