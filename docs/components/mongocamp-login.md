# MongocampLogin

FormKit schema-driven login form. Persists the last entered user ID in a cookie (`mongocamp_login`, 30 days) and redirects to `redirectPath` (default `/secured`) on success.

## Usage

```vue
<template>
  <MongocampLogin redirect-path="/dashboard" />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `redirectPath` | `string` | `'/secured'` | Path to navigate to after a successful login. |

## Behavior

- Fields: `userId` (email, required) and `password` (required, min length 3), rendered via `nuxtUIInput`.
- Calls `login(userId, password)` from `useMongocampAuth()` (provided by `@sfxcode/nuxt-mongocamp-server`).
- On success: saves `userId` to the `mongocamp_login` cookie and navigates to `redirectPath`.
- On failure: shows a generic "Wrong Login or Password !" message — not the API's actual error message, so failures never leak server-side details into the UI.
