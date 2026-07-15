# nuxt-ui-mongocamp

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]
[![Docs][docs-src]][docs-href]

A Nuxt module that wraps [`@sfxcode/nuxt-mongocamp-server`](https://www.npmjs.com/package/@sfxcode/nuxt-mongocamp-server) with ready-made UI components, composables, and a runtime plugin. Add the module to your Nuxt app and get MongoCamp authentication, user/role management, and collection access out of the box — built on [Nuxt UI](https://ui.nuxt.com) and [FormKit](https://formkit.com).

- [✨ Release Notes](/CHANGELOG.md)

## Features

- **Auth middleware** — global route guard that protects `/secured/**` (login required) and `/admin/**` (admin role required)
- **Ready-made components** — login form, user/role management tables, collection browser with stats and paginated data table, server version badge
- **FormKit-powered forms** — schema-driven forms via `@sfxcode/nuxt-ui-formkit` with `nuxtUIInput`, `nuxtUISwitch`, `nuxtUIListbox`, and `nuxtUISelectMenu` inputs
- **Composables** — `useMongocampAdmin`, `useMongocampCollection`, `useMongocampDocument`, `useMongocampSchema` auto-imported into your app
- **Zero extra config** — peer modules (`@nuxt/ui`, `@formkit/nuxt`, `unocss-nuxt-ui`) are declared as `moduleDependencies` and configured automatically

## Module Dependencies

These modules are declared as `moduleDependencies` and are automatically set up — you do not need to add them manually to your `nuxt.config.ts`:

| Module | Purpose |
|---|---|
| [`@nuxt/ui`](https://ui.nuxt.com) | Component library (UTable, UModal, UBadge, UPageCard, …) |
| [`unocss-nuxt-ui`](https://www.npmjs.com/package/unocss-nuxt-ui) | UnoCSS preset that matches Nuxt UI's design tokens |
| [`@formkit/nuxt`](https://formkit.com/getting-started/installation#with-nuxt) | FormKit core integration for Nuxt |
| [`@sfxcode/nuxt-ui-formkit`](https://www.npmjs.com/package/@sfxcode/nuxt-ui-formkit) | Nuxt UI input types for FormKit (`nuxtUIInput`, `nuxtUISwitch`, `nuxtUIListbox`, `nuxtUISelectMenu`) |
| [`@sfxcode/nuxt-mongocamp-server`](https://www.npmjs.com/package/@sfxcode/nuxt-mongocamp-server) | MongoCamp REST API client, auth state, and `useMongocampApi()` / `useMongocampAuth()` composables |

## Quick Setup

```bash
npm install nuxt-ui-mongocamp
```

Add the module to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-ui-mongocamp'],

  mongocamp: {
    url: process.env.MONGOCAMP_URL,
  },
})
```

The `mongocamp` key is forwarded to `@sfxcode/nuxt-mongocamp-server`. Set `MONGOCAMP_URL` (and optionally `MONGOCAMP_ADMIN_USER` / `MONGOCAMP_ADMIN_PASSWORD`) in your `.env` file.

## Components

All components are auto-imported.

### `<MongocampLogin />`

FormKit schema-driven login form. Persists the last user ID in a cookie (`mongocamp_login`) and redirects to `/secured` on success.

```vue
<template>
  <MongocampLogin />
</template>
```

### `<MongocampUsers />`

Full CRUD table for managing users — create, edit (roles via transfer listbox, password change), and delete, all via modal dialogs. Includes a server-side debounced search input and sortable column headers.

```vue
<template>
  <MongocampUsers />
</template>
```

### `<MongocampRoles />`

Full CRUD table for managing roles — create, edit (admin flag, collection grants), and delete. Includes a server-side debounced search input and sortable column headers.

```vue
<template>
  <MongocampRoles />
</template>
```

### `<MongocampRoleGrants />`

Per-role collection grant management — lists grants for a named role, with add/edit/delete. Filters the collection picker to exclude already-granted collections.

```vue
<template>
  <MongocampRoleGrants role-name="myRole" />
</template>
```

### `<MongocampCollections />`

Table of all collections with document count, storage size, and index count. Each row links to the collection info and data pages. Includes a client-side filter input and sortable column headers.

| Prop | Type | Default | Description |
|---|---|---|---|
| `infoPath` | `string` | `/secured/admin/collections` | Base path for the info page link |
| `dataPath` | `string` | `/secured/admin/collections` | Base path for the data page link (`<dataPath>/<name>/data`) |

```vue
<template>
  <MongocampCollections />
</template>
```

### `<MongocampCollectionInfos />`

Stat-card grid for a single collection — document count, data size, storage size, avg doc size, index count, total index size, and a per-index size table.

```vue
<template>
  <MongocampCollectionInfos collection-name="myCollection" />
</template>
```

### `<MongocampCollectionData />`

Schema-driven paginated data table for a collection.

- **Columns** derived from the collection's JSON schema; falls back to first-row key derivation when no schema properties exist. Column order: `_id` first, `metaData` last, all others sorted A–Z.
- **Sorting** — clickable column headers trigger server-side sort via the MongoCamp API (`field` / `-field`).
- **Filtering** — debounced search input sends a Lucene query (`col1: *term* OR col2: *term*`) across all string-typed columns to the API; disabled until the schema is loaded.
- **Cell rendering**:
  - `date-time` columns and MongoDB `$date` extended JSON → locale-formatted date string
  - MongoDB `$oid` → monospaced ID string
  - `metaData` objects (with `created`/`updated` fields) → structured `created / updated / by` rows
  - All other objects and arrays → icon button (`{}` / list); click opens a modal with pretty-printed JSON in a `<pre>` tag
- Includes a reload button and paginated footer.

```vue
<template>
  <MongocampCollectionData collection-name="myCollection" />
</template>
```

### `<MongocampVersion />`

Displays the connected MongoCamp server name and version as a `UBadge`. Shows a neutral "unavailable" badge when the server cannot be reached.

```vue
<template>
  <MongocampVersion />
</template>
```

## Composables

All composables are auto-imported.

### `useMongocampAdmin()`

Wraps the `adminApi` and `collectionApi` for user and role management.

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
} = useMongocampAdmin()
```

### `useMongocampCollection()`

Reactive state for paginated collection queries.

```ts
const {
  filter,     // Ref<string | undefined>       — MongoDB filter expression
  sort,       // Ref<string[] | undefined>      — sort fields
  projection, // Ref<string[] | undefined>      — field projection
  pagination, // Ref<{ pageIndex: number, pageSize: number }>
  total,      // Ref<number>                    — total document count
} = useMongocampCollection()
```

### `useMongocampDocument()`

Helpers for document-level operations.

```ts
const {
  ensureMetaData,   // <T>(data: T) => T  — stamps createdBy/updatedBy/timestamps from logged-in user
  updateFromPartial, // <T>(obj: T, updates: Partial<T>) => T
} = useMongocampDocument()
```

### `useMongocampSchema()`

Converts a `JsonSchemaDefinition` to typed table column definitions. Used internally by `MongocampCollectionData`.

```ts
const { schemaToColumnDefinition } = useMongocampSchema()

// schemaToColumnDefinition(definition, fields) => ColumnDefinition[]
// ColumnDefinition: { columnName, columnKey, columnType }
// columnType: 'string' | 'number' | 'date-time'
```

Fields are sorted with `_id` first, `metaData` last, and all other fields alphabetically.

## Route Protection

Route protection is opt-in and config-driven via `useMongocampRoles()`. Set `useGlobalAuthMiddleware: true` and list your protected route globs under `nuxtUiMongocamp` — nothing is protected by default. See [Route Protection](https://sfxcode.github.io/nuxt-ui-mongocamp/guide/route-protection) for the full behavior.

| Path pattern | Requirement |
|---|---|
| Matches `securedRouteParts` | User must be logged in |
| Matches `managementRouteParts` | User must be a manager (`managerRoles`, or admin) |
| Matches `adminRouteParts` | User must be an admin |
| `/logout` | Calls `logout()` |

On any unmet requirement (or `/logout`), the middleware redirects to `notAllowedPath` (default `'/'`), which is always itself allowed so it can never cause a redirect loop.

## Runtime Plugin

The plugin provides `$mongocampVersion` (a `Ref` to the server's version info) via `useNuxtApp()`:

```ts
const { $mongocampVersion } = useNuxtApp()
// $mongocampVersion.value?.name
// $mongocampVersion.value?.version
```

## Configuration

The module's own config key is `nuxtUiMongocamp` — it configures the route middleware described above:

```ts
nuxtUiMongocamp: {
  useGlobalAuthMiddleware: true,                // default: false
  notAllowedPath: '/login',                     // default: '/'
  managerRoles: ['support'],                    // default: []
  securedRouteParts: ['/secured/**'],           // default: []
  managementRouteParts: ['/secured/manage/**'], // default: []
  adminRouteParts: ['/secured/admin/**'],       // default: []
}
```

See [Configuration](https://sfxcode.github.io/nuxt-ui-mongocamp/guide/configuration) for details on each option.

The MongoCamp server is configured separately, under the `mongocamp` key (provided by `@sfxcode/nuxt-mongocamp-server`):

```ts
mongocamp: {
  url: 'https://your-mongocamp-server',
  paginationSize: 500,   // default: 500
  refreshToken: true,    // default: true
  tokenRefreshIntervall: 5000, // ms, default: 5000
}
```

## Contribution

```bash
# Install dependencies
pnpm install

# Build stubs + prepare the playground (run once after clone)
pnpm run dev:prepare

# Start playground dev server
pnpm run dev

# Lint
pnpm run lint

# Run tests (Vitest + @nuxt/test-utils e2e)
pnpm run test
pnpm run test:watch

# Type-check
pnpm run test:types

# Build for publishing
pnpm run prepack
```

The playground reads `playground/.env` for `MONGOCAMP_URL`, `MONGOCAMP_ADMIN_USER`, and `MONGOCAMP_ADMIN_PASSWORD`.

## Documentation

Full documentation (guides, components, composables) lives in `docs/` and is built with [VitePress](https://vitepress.dev):

```bash
# Start the docs dev server
pnpm run docs:dev

# Build the static site
pnpm run docs:build

# Preview the built site
pnpm run docs:preview
```

## License

[MIT](./LICENSE)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@sfxcode/nuxt-ui-mongocamp/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@sfxcode/nuxt-ui-mongocamp

[npm-downloads-src]: https://img.shields.io/npm/dm/@sfxcode/nuxt-ui-mongocamp.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/@sfxcode/nuxt-ui-mongocamp

[license-src]: https://img.shields.io/npm/l/@sfxcode/nuxt-ui-mongocamp.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@sfxcode/nuxt-ui-mongocamp

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com

[docs-src]: https://img.shields.io/badge/docs-vitepress-020420.svg?style=flat&colorA=020420&colorB=00DC82
[docs-href]: https://sfxcode.github.io/nuxt-ui-mongocamp/
