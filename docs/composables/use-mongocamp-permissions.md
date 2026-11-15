# useMongocampPermissions

What the signed-in user may do with a collection — answered by the server (`GET /auth/permissions`, server 1.7.0) once `load()` ran — so a component can hide an action the server would refuse instead of letting the click fail.

```ts
const { canRead, canWrite, canAdminister, readableCollections, load } = useMongocampPermissions()

await load('customers')                         // ask the server (no argument: every collection that has a grant)

canWrite('customers')                           // false for a read-only grant
readableCollections(['customers', 'orders'])    // only the ones the user may read
```

| Function | Answers |
|---|---|
| `canRead(collection)` | the user's grant for it has `read: true` |
| `canWrite(collection)` | `write: true` |
| `canAdminister(collection)` | `administrate: true` |
| `readableCollections(names)` | `names` filtered to the readable ones, same order |
| `load(collection?)` | asks the server for the signed-in user's rights (one collection, or all with a grant) and keeps the answer for the synchronous checks above; never throws, a failure leaves the earlier answers (or fail-open); administrators are never asked |

## UI-level only

This is gating for the interface, like [route protection](/guide/route-protection): the server stays the authority and refuses a write without a grant anyway (a missing grant is answered with a `401` that this module turns into a `403`, so it never logs the user out — see [`useMongocampClientApi`](/composables/use-mongocamp-client-api#a-missing-grant-is-not-a-dead-session)). The helper only removes buttons that could not work.

## The server answer wins

After `load()` the checks answer from the server, which resolves roles, grants and the user itself (it also works in server proxy mode, which has no profile at all). The answers are cached per signed-in user (`useState`) and merged across calls; a different user starts empty.

After a **full** `load()` (no argument) the list is complete: a collection the server did not list has no grant, so every check is **no** for it. After a single-collection `load()` only that collection is known.

## Grants never come from the session

Grants are not read from the token or from the profile stored in the session cookie. Since MongoCamp server 1.9 the token carries only `user` and `isAdmin` (plus `exp`, `iat`, `jti`, `iss`), and the session cookie should not carry the grant list either — a user with many grants would push it past the browser's 4 KB cookie limit and the session would silently be lost. `GET /auth/permissions` is the only source, and it is always current (the server evaluates grants live). `MongocampCollectionData` loads its own collection, `MongocampCommandPalette` loads all on first open.

## It fails open

When it cannot know, the answer is **yes** and the server decides:

- the user is an **administrator** (everything is allowed);
- [server proxy mode](/guide/server-proxy-auth) — there is no user, the api key's power is the server's decision;
- the server has **not answered yet**, the request failed, or only other single collections were asked;
- there is **no profile** (not signed in);
- the collection is a **GridFS bucket member** (`<bucket>.files` / `.chunks`) — what a bucket grant is called and typed was not verified.

A full server answer is taken at its word: a collection missing from it means no permission, and an empty answer means none at all.

## How a grant is matched

The server does the matching; verified on MongoCamp server 1.6.3 with a throwaway non-admin user (2026-11-03):

- the grant's `name` is compared with the collection name **exactly but ignoring case** — there are **no wildcards** (`cust*` gave no access to `customers`) and no prefixes. The helper trims the name, too;
- `read`, `write` and `administrate` are independent: none implies another;
- several grants for one name add up — any one that allows it is enough.

The cached answers are looked up by collection name ignoring case as well.

## Where the module uses it

[`MongocampCollectionData`](/components/mongocamp-collection-data#without-a-write-grant): without `write` the table is read-only — no insert, import, edit, delete or row selection (so no bulk edit or delete either). Rows, filtering, sorting and export stay.

## Related

- [`useMongocampRoles`](/composables/use-mongocamp-roles) — `isAdmin`, `isManager` and the route-pattern checks
- [`MongocampRoleGrants`](/components/mongocamp-role-grants) — where the grants are edited
