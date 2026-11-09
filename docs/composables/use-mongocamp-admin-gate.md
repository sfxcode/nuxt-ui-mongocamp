# useMongocampAdminGate

For components that only make sense for an administrator and call admin endpoints on mount. `blocked` is `true` when the signed-in user is known **not** to be an administrator, so the component can show `message` ("This area is for administrators only.") **without sending a request** the server has to refuse.

```ts
const { blocked, message } = useMongocampAdminGate()

if (!blocked.value) loadUsers()
```

```vue
<MongocampEmptyState v-if="blocked" icon="i-lucide-shield-alert" :title="message" />
<div v-else> … </div>
```

| Value | |
|---|---|
| `blocked` | `computed<boolean>`: the profile's `isAdmin` is `false` and the app is not in [server proxy mode](/guide/server-proxy-auth) |
| `message` | the translated "administrators only" text |

It is a **UI hint, not a guard** — the server stays the authority (a missing grant is answered by the server anyway, see [`useMongocampClientApi`](/composables/use-mongocamp-client-api#a-missing-grant-is-not-a-dead-session)). It **fails open**: server proxy mode (the api key's power decides), no profile yet and a profile without an `isAdmin` flag are never blocked.

Used by [`MongocampUsers`](/components/mongocamp-users), [`MongocampRoles`](/components/mongocamp-roles), [`MongocampRoleGrants`](/components/mongocamp-role-grants), [`MongocampJobs`](/components/mongocamp-jobs), [`MongocampDatabases`](/components/mongocamp-databases), [`MongocampDashboard`](/components/mongocamp-dashboard) and [`MongocampServerOverview`](/components/mongocamp-server-overview) (and, in its own way, `MongocampSettings`). For a blocked user they show the message (a `data-test="admin-only"` empty state), make **no request** — also none from `autoRefresh` — and the dashboard keeps only its heading and version.
