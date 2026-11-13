# useMongocampProxyMode

Tells you whether the module runs in [server proxy mode](/guide/server-proxy-auth) (module option `useServerProxy`).

```ts
const isProxyMode = useMongocampProxyMode() // boolean
```

It returns a plain boolean, not a ref: the option is fixed when the app is built.

In proxy mode nobody logs in. There is no token and no profile, and the server-side api key decides what a request may do. Code that reads the profile (`isAdmin`, roles, grants) needs to know this, or it hides everything from a user who is in fact allowed.

```vue
<script setup lang="ts">
const isProxyMode = useMongocampProxyMode()
</script>

<template>
  <!-- No login, so no account page and no logout -->
  <UButton v-if="!isProxyMode" to="/account" label="Account" />
</template>
```

For "may this user see the admin area" use `canSeeAdmin` / `canSeeManagement` from [`useMongocampRoles`](/composables/use-mongocamp-roles), which already include this check.

## Related

- [`useMongocampRoles`](/composables/use-mongocamp-roles) — `canSeeAdmin`, `canSeeManagement`
- [`useMongocampAdminGate`](/composables/use-mongocamp-admin-gate) and [`useMongocampPermissions`](/composables/use-mongocamp-permissions) — never block in proxy mode
- [`useMongocampClientApi`](/composables/use-mongocamp-client-api) — picks the proxy or the session client
