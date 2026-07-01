# MongocampLogin

FormKit schema-driven login form. Persists the last entered user ID in a cookie (`mongocamp_login`, 30 days) and redirects to `/secured` on success.

## Usage

```vue
<template>
  <MongocampLogin />
</template>
```

## Props

None.

## Behavior

- Fields: `userId` (email, required) and `password` (required, min length 3), rendered via `nuxtUIInput`.
- Calls `login(userId, password)` from `useMongocampAuth()` (provided by `@sfxcode/nuxt-mongocamp-server`).
- On success: saves `userId` to the `mongocamp_login` cookie and navigates to `/secured`.
- On failure: shows the error message returned by the API inline.
