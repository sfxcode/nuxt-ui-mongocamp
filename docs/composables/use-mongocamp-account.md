# useMongocampAccount

Wraps the `authApi` methods **not** already surfaced by `@sfxcode/nuxt-mongocamp-server`'s own `useMongocampAuth()` (`login`, `logout`, `isAuthenticated`, `isLoggedIn`, `userRoles`, `userGrants`). Powers the account self-service component.

```ts
const {
  changingPassword, // Ref<boolean>
  fetchProfile,     // () => Promise<UserProfile>
  changePassword,   // (password: string) => Promise<boolean>
  regenerateApiKey, // () => Promise<string>
} = useMongocampAccount()
```

## `fetchProfile`

Returns the full `UserProfile` (`user`, `isAdmin`, `apiKey?`, `roles?`, `grants?`) of the currently logged-in user via `authApi.userProfile()`.

## `changePassword`

```ts
const success = await changePassword('new-password')
```

Follows the same convention as `useMongocampBucket`'s `uploadFile`: owns its own loading flag (`changingPassword`), shows a success/error toast, and returns a boolean.

## `regenerateApiKey`

```ts
const newKey = await regenerateApiKey()
```

Calls `authApi.generateNewApiKey()` and returns the raw key string. **This is the only time the new key is retrievable** — the server doesn't expose it again afterward, so the UI must display it prominently once rather than just toasting a generic "success" message.

## No manual "refresh session" method

`@sfxcode/nuxt-mongocamp-server`'s `useMongocampAuth()` already runs a background `setInterval` that calls `authApi.refreshToken()` automatically (gated by the module's `refreshToken`/`tokenRefreshIntervall` options, both defaulted to `true`/`5000` in this module's `moduleDependencies`) for as long as the user is logged in. A manual refresh method here would just duplicate that — there's intentionally no `refreshSession()` export.
