# useMongocampRoles

Role- and route-pattern-based access checks, built on top of `@sfxcode/nuxt-mongocamp-server`'s `useMongocampAuth()`/`useMongocampStorage()`. Powers the global navigation guard registered by this module's runtime [plugin](https://github.com/sfxcode/nuxt-ui-mongocamp/blob/main/src/runtime/plugin.ts).

```ts
const {
  isLoggedIn,           // ComputedRef<boolean> — from useMongocampAuth()
  isAdmin,              // ComputedRef<boolean>
  isManager,            // ComputedRef<boolean>
  notAllowedPath,       // string — where the plugin's middleware redirects on disallow
  isAllowedPathForRoute, // (route: string) => boolean
} = useMongocampRoles()
```

## Configuration

Reads five options from `nuxtUiMongocamp` (this module's own config key, distinct from the `mongocamp` key that passes through to `@sfxcode/nuxt-mongocamp-server`) via `useRuntimeConfig().public.nuxtUiMongocampOptions`:

```ts
export default defineNuxtConfig({
  nuxtUiMongocamp: {
    notAllowedPath: '/login',                               // redirect target on disallow (default '/')
    managerRoles: ['support'],                              // profile.roles granting manager status (default [])
    securedRouteParts: ['/secured/**'],                      // requires isLoggedIn (default [])
    managementRouteParts: ['/secured/manage/**'],            // requires isManager (default [])
    adminRouteParts: ['/secured/admin/**'],                  // requires isAdmin (default [])
  },
})
```

Route parts are glob patterns matched with [`minimatch`](https://www.npmjs.com/package/minimatch), not plain string prefixes — `/secured/admin/**` matches nested pages like `/secured/admin/users`. It also matches `/secured/admin` itself (the directory's own `index.vue`): `minimatch` alone wouldn't match that bare route since `**` needs at least one more path segment after the trailing `/`, so this composable also tries the route with a trailing slash appended before giving up on a pattern.

**Nothing is protected by default** — an app that doesn't set any of the route-part options gets an `isAllowedPathForRoute` that returns `true` for every route. This is a deliberate opt-in design: the module no longer assumes any particular URL convention (earlier versions hardcoded `/admin`/`/secured` prefixes directly in the plugin). Set `securedRouteParts`/`managementRouteParts`/`adminRouteParts` to whatever your app's actual protected routes are — see the playground's `nuxt.config.ts` for a working example.

## `isAdmin` / `isManager`

- `isAdmin` reflects `useMongocampStorage().value.profile.isAdmin` directly (`false` if the profile is missing).
- `isManager` is `true` when the logged-in profile's `roles` includes at least one entry from `managerRoles`, **or** when `isAdmin` is `true` — an admin always counts as a manager, even with no matching role.

## `isAllowedPathForRoute`

```ts
isAllowedPathForRoute('/secured/admin/users') // false, true, ... depending on isLoggedIn/isManager/isAdmin
```

`notAllowedPath` is always allowed, checked before anything else — this is what stops the plugin's own redirect target from ever being disallowed and looping back on itself, even if it happens to also match one of the route-part patterns below.

Otherwise, checks route parts in order, each gate independent of the others:

1. `!isLoggedIn.value` + matches `securedRouteParts` → disallowed
2. `!isManager.value` + matches `managementRouteParts` → disallowed
3. `!isAdmin.value` + matches `adminRouteParts` → disallowed
4. Otherwise allowed

Because a route can match more than one pattern set (e.g. `/secured/admin/**` is also covered by `/secured/**`), the **first** matching gate that fails wins — a logged-out user hitting an admin route is blocked by the secured check before the admin check ever runs.

## Consumed by the runtime plugin

```ts
const { notAllowedPath, isAllowedPathForRoute } = useMongocampRoles()

addRouteMiddleware('global-auth', (to) => {
  if (to.path === '/logout') {
    logout()
    return navigateTo(notAllowedPath)
  }
  if (!isAllowedPathForRoute(to.path)) {
    return navigateTo(notAllowedPath)
  }
}, { global: true })
```

Redirect target on both logout and disallow is always `notAllowedPath` (default `'/'`; set it to e.g. `'/login'` for apps that gate everything behind a login page). This middleware only registers when `useGlobalAuthMiddleware` (also under `nuxtUiMongocamp`, defaults to `false`) is explicitly enabled.

## Related

- `@sfxcode/nuxt-mongocamp-server`'s `useMongocampAuth()` / `useMongocampStorage()` — the underlying login state and stored profile this composable reads
- [`useMongocampAccount`](/composables/use-mongocamp-account) — profile self-service, not access control