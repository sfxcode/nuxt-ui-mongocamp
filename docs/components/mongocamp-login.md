# MongocampLogin

FormKit schema-driven login form. Persists the last entered user ID in a cookie (`mongocamp_login`, 30 days) and redirects to `redirectPath` (default `/`) on success.

## Usage

```vue
<template>
  <MongocampLogin redirect-path="/dashboard" />
</template>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `redirectPath` | `string` | `'/'` | Path to navigate to after a successful login. |
| `hideHeading` | `boolean` | `false` | Hide the heading inside the card, e.g. when the page or the `header` slot already has one. |

## Slots

| Slot | Where |
|---|---|
| `header` | Inside the card, above the form — a logo, a title, a hint. |
| `footer` | Inside the card, below the form and its error message — links, legal text. |

```vue
<template>
  <MongocampLogin
    redirect-path="/secured"
    hide-heading
  >
    <template #header>
      <h2>Sign in to the console</h2>
    </template>
    <template #footer>
      <p>Ask your administrator for an account.</p>
    </template>
  </MongocampLogin>
</template>
```

## Behavior

- Fields: `userId` (email, required) and `password` (required, min length 3), rendered via `nuxtUIInput`. Both fill the card's width.
- Calls `login(userId, password)` from `useMongocampAuth()` (provided by `@sfxcode/nuxt-mongocamp-server`).
- On success: saves `userId` to the `mongocamp_login` cookie and navigates to `redirectPath`.
- On failure: shows a generic "Wrong Login or Password !" message — not the API's actual error message, so failures never leak server-side details into the UI.
