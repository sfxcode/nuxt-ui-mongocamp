# useMongocampPermissions

What the signed-in user may do with a collection, read from the grants in the session profile — so a component can hide an action the server would refuse instead of letting the click fail.

```ts
const { canRead, canWrite, canAdminister, readableCollections } = useMongocampPermissions()

canWrite('customers')                           // false for a read-only grant
readableCollections(['customers', 'orders'])    // only the ones the user may read
```

| Function | Answers |
|---|---|
| `canRead(collection)` | the user's grant for it has `read: true` |
| `canWrite(collection)` | `write: true` |
| `canAdminister(collection)` | `administrate: true` |
| `readableCollections(names)` | `names` filtered to the readable ones, same order |

## UI-level only

This is gating for the interface, like [route protection](/guide/route-protection): the server stays the authority and refuses a write without a grant anyway (a missing grant is answered with a `401` that this module turns into a `403`, so it never logs the user out — see [`useMongocampClientApi`](/composables/use-mongocamp-client-api#a-missing-grant-is-not-a-dead-session)). The helper only removes buttons that could not work.

## It fails open

When it cannot know, the answer is **yes** and the server decides:

- the user is an **administrator** (everything is allowed);
- [server proxy mode](/guide/server-proxy-auth) — there is no user, the api key's power is the server's decision;
- the profile has **no grant list** (not signed in, an older session);
- the collection is a **GridFS bucket member** (`<bucket>.files` / `.chunks`) — what a bucket grant is called and typed was not verified.

A known grant list is taken at its word: no grant for a collection means no permission for it, and an empty list means none at all.

## How a grant is matched

Verified on MongoCamp server 1.6.3 with a throwaway non-admin user (2026-11-03):

- the grant's `name` is compared with the collection name **exactly but ignoring case** — there are **no wildcards** (`cust*` gave no access to `customers`) and no prefixes. The helper trims the name, too;
- `read`, `write` and `administrate` are independent: none implies another;
- several grants for one name add up — any one that allows it is enough;
- only collection grants count (`grantType` `COLLECTION`, or none).

The grants come from the profile the dependency keeps in the session cookie. They are read on every call, so the answers follow the profile when the token refresh brings a new one; until then a grant that was just changed is not reflected (the server evaluates grants live, so a stale profile can show an action the server now refuses, or hide one it now allows — logging in again or the next refresh fixes it).

## Where the module uses it

[`MongocampCollectionData`](/components/mongocamp-collection-data#without-a-write-grant): without `write` the table is read-only — no insert, import, edit, delete or row selection (so no bulk edit or delete either). Rows, filtering, sorting and export stay.

## Related

- [`useMongocampRoles`](/composables/use-mongocamp-roles) — `isAdmin`, `isManager` and the route-pattern checks
- [`MongocampRoleGrants`](/components/mongocamp-role-grants) — where the grants are edited
