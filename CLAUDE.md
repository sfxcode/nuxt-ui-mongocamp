# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A Nuxt module (`nuxt-ui-mongocamp`) that wraps `@sfxcode/nuxt-mongocamp-server` with ready-made UI components, composables, and a runtime plugin. Consumers add the module to their Nuxt app and get MongoCamp auth, user/role management, and collection access out of the box.

## Commands

```bash
# Install dependencies
pnpm install

# Build stubs + prepare the playground (run once after clone, and after module source changes)
pnpm run dev:prepare

# Start playground dev server (hot-reloads module changes)
pnpm run dev

# Lint
pnpm run lint

# Run tests (Vitest + @nuxt/test-utils e2e against the fixture app)
pnpm run test
pnpm run test:watch

# Type-check
pnpm run test:types

# Build for publishing
pnpm run prepack
```

The playground reads `playground/.env` for `MONGOCAMP_URL`, `MONGOCAMP_ADMIN_USER`, and `MONGOCAMP_ADMIN_PASSWORD`. Optional vars demo server proxy auth mode: `MONGOCAMP_API_KEY`, `MONGOCAMP_USE_SERVER_PROXY=true`, and `MONGOCAMP_PROXY_SHARED_SECRET` (activates the example guard hook in `playground/server/plugins/mongocamp-proxy-guard.ts`) — see `docs/guide/server-proxy-auth.md`.

## Architecture

### Module entry — `src/module.ts`

Declares `moduleDependencies` for `@nuxt/ui`, `unocss-nuxt-ui`, `@formkit/nuxt`, `@sfxcode/nuxt-ui-formkit`, and `@sfxcode/nuxt-mongocamp-server`. On setup it registers:
- The runtime plugin (`src/runtime/plugin.ts`)
- All components in `src/runtime/components/` (auto-imported)
- All composables in `src/runtime/composables/` (auto-imported)
- The server proxy catch-all route (`src/runtime/server/handlers/mongocampProxy.ts`), unconditionally — like the auth middleware below, it's always registered but internally gated by a runtime option (`useServerProxy`, default `false`)

Also warns at build time (via `consola`) if `useServerProxy` and `useGlobalAuthMiddleware` are both enabled — server proxy mode has no login, so `securedRouteParts`/`managementRouteParts`/`adminRouteParts` could never unlock.

### Runtime plugin — `src/runtime/plugin.ts`

Runs on app boot. Fetches the MongoCamp server version via `informationApi.version()` and provides it as `$mongocampVersion`. If the module's `useGlobalAuthMiddleware` option is `true` (default `false` — opt-in), registers a global `global-auth` route middleware built on `useMongocampRoles()`:
- Gates routes by glob pattern against `securedRouteParts` (requires login), `managementRouteParts` (requires manager/admin), and `adminRouteParts` (requires admin) — all configured under the module's own `nuxtUiMongocamp` key, all defaulting to `[]` (nothing protected until configured)
- Calls `logout()` on `/logout`, then redirects to `logoutRedirectPath` (module option, default `'/'`)
- Redirects to `notAllowedPath` (module option, default `'/'`) on any other disallowed route
- Both redirect targets are always themselves treated as allowed, so neither can ever loop

See `src/module.ts`'s `ModuleOptions` for the full option list and `docs/guide/route-protection.md` for behavior details.

### Server proxy mode — `src/runtime/server/handlers/mongocampProxy.ts`

A second, optional auth mode for consumers who only have a MongoCamp api key and never want it reaching the browser (`mongocamp.apiKey`, the dependency's own config key — stored server-side only). When `useServerProxy` is `true`:
- A catch-all route at `serverProxyPath` (default `/api/_mongocamp`) reverse-proxies any request to the real MongoCamp server via `h3`'s `proxyRequest`, injecting the api key as an `X-AUTH-APIKEY` header and neutralizing any caller-supplied `Authorization` header
- Before forwarding, it calls a Nitro hook (`mongocamp-proxy:authorize`, via `useNitroApp().hooks.callHook(...)`) that a consumer can tap from their own `server/plugins/*.ts` to reject unauthorized callers — unregistered, it's a no-op (the route is otherwise unguarded, since reaching it grants the api key's full power)
- `useMongocampClientApi()` (composable, see below) picks this mode or the default session mode per-call, so every built-in composable/component works unmodified in either mode

See `docs/guide/server-proxy-auth.md` for the full guide, including the guard-hook contract and example.

### Components — `src/runtime/components/`

| Component | Purpose |
|---|---|
| `MongocampLogin` | FormKit schema-driven login form; persists last userId in a cookie |
| `MongocampUsers` | Full CRUD table for users — add/edit (with role transfer listbox) / delete via UModal |
| `MongocampRoles` | Full CRUD table for roles — add/edit / delete via UModal; key icon links to grant management page (configurable via `grantsPath` prop) |
| `MongocampRoleGrants` | Per-role grant CRUD — lists collection grants for a named role, add/edit/delete; filters available collections to exclude already-granted ones |
| `MongocampBucketFiles` | Paginated/filterable GridFS bucket file browser — list/download/upload/delete/rename via `useMongocampBucket`; reached from `MongocampCollections`' bucket rows via `bucketFilesPath` |
| `MongocampVersion` | Badge showing live server name/version from the injected `$mongocampVersion` |

UTable columns with custom cells use `h()` + `resolveComponent()` (not `<template>`) — see existing components for the pattern.

### Composables — `src/runtime/composables/`

- **`useMongocampAdmin`** — wraps `adminApi` and `collectionApi` from `useMongocampApi()` for user and role CRUD (`listUsers`, `addUser`, `deleteUser`, `updateUserRoles`, `updateUserPassword`, `listRoles`, `addRole`, `updateRole`, `deleteRole`, `listCollections`)
- **`useMongocampCollection`** — reactive state for paginated collection queries: `filter`, `sort`, `projection`, `pagination` (pageIndex + pageSize), `total`
- **`useMongocampDocument`** — helpers for document-level operations: `ensureMetaData` (stamps `createdBy`/`updatedBy`/timestamps from the logged-in user) and `updateFromPartial`
- **`useMongocampSchema`** — exports `useJsonSchema()` with `schemaToColumnDefinition(definition, fields)` for mapping a `JsonSchemaDefinition` to UTable column configs; sorts `_id` first, then id-containing fields, then others; detects `date-time` and `number` types
- **`useMongocampRoles`** — `isAdmin`/`isManager` (admin always counts as manager) and `isAllowedPathForRoute(route)`, backing the runtime plugin's global auth middleware; reads the module's `nuxtUiMongocamp` options (`managerRoles`, `securedRouteParts`, `managementRouteParts`, `adminRouteParts`, `notAllowedPath`, `logoutRedirectPath`) from `useRuntimeConfig().public.nuxtUiMongocampOptions`
- **`useMongocampClientApi`** — the drop-in every other composable/component calls instead of the dependency's `useMongocampApi()`; switches between session mode and `useMongocampProxyApi()` based on `useServerProxy`
- **`useMongocampProxyApi`** — session-mode-shaped API client (`adminApi`, `documentApi`, ...) pointed at the local server proxy route instead of the real MongoCamp URL; builds the 11 API classes itself via `src/runtime/utils/createProxyMongocampApis.ts`, since the dependency's own `createMongocampApis` factory isn't part of its public export surface

### FormKit / @sfxcode/nuxt-ui-formkit conventions

Forms use FormKit schema arrays (not template markup). The key custom input types are `nuxtUIInput`, `nuxtUISwitch`, `nuxtUIListbox`, and `nuxtUISelectMenu` — all provided by `@sfxcode/nuxt-ui-formkit`. The `FUDataEdit` component wraps schema + submit logic. See `playground/formkit.config.ts` for how inputs are registered.

Listbox in transfer mode requires `displayMode: 'transfer'` and options as `{ value, label }` objects. SelectMenu options can be plain strings. Use `options` (not `items`) as the schema key for both `nuxtUIListbox` and `nuxtUISelectMenu` — set it directly on the schema node object. Inputs are bulk-registered via `nuxtUIInputs` and `nuxtUIOutputs` spreads from `@sfxcode/nuxt-ui-formkit/definitions` — see `playground/formkit.config.ts`.

### Playground — `playground/`

SSR is disabled (`ssr: false`). The playground registers the module directly via the local import (`import NuxtUIMongocamp from '..'`). Its `nuxt.config.ts` sets `nuxtUiMongocamp: { useGlobalAuthMiddleware: true, securedRouteParts: ['/secured/**'], managementRouteParts: ['/secured/manager/**'], adminRouteParts: ['/secured/admin/**'], managerRoles: ['manager'] }` so pages under `/secured/`, `/secured/manager/`, and `/secured/admin/` are protected — this is opt-in and not automatic for consumers of the module. The `mongocamp` config key in `nuxt.config.ts` passes through to `@sfxcode/nuxt-mongocamp-server`.

### Tests — `test/`

`vitest.config.ts` defines three projects. `pnpm run test` explicitly runs only the first two (`--project unit --project components`) — a bare `vitest run` would otherwise also sweep in `e2e-auth`, which needs Playwright browsers that aren't installed in CI:
- **`unit`** — `test/*.test.ts`, plain Node environment, composables mocked via `vi.mock` (relative-path imports) or by faking `#imports` entirely — see `brain/patterns/testing-nuxt-auto-import-composables.md`. E2e smoke coverage lives here too (`test/basic.test.ts`, via `@nuxt/test-utils/e2e`'s `setup()`+`$fetch`).
- **`components`** — `test/components/**/*.test.ts`, a real booted Nuxt environment (`happy-dom`, via `@nuxt/test-utils/runtime`'s `mountSuspended`) against the `test/fixtures/basic/` fixture (which also needs a `pages/` dir and `formkit.config.ts` for this to work — see `brain/patterns/component-testing-nuxt-environment.md` for the full list of gotchas: `UApp` wrapper, teleported `UModal` content, FormKit id/validation timing).
- **`e2e-auth`** — `test/e2e-auth/**/*.test.ts`, real-browser (Playwright, via `@nuxt/test-utils/e2e`'s `createPage`) coverage for the global auth/role middleware. Run manually with `pnpm run test:e2e:auth` after a one-time `npx playwright install chromium` — deliberately **not** part of `pnpm run test`/CI, since Playwright needs installed browser binaries. See `brain/patterns/e2e-browser-testing.md` for why `$fetch`/SSR alone can't prove role-based redirect behavior (session state lives in `sessionStorage`, which SSR never sees).

Run a single test file with `pnpm vitest run test/basic.test.ts` or `pnpm vitest run --project components test/components/MongocampRoles.test.ts`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`.  
Scope is optional but useful (e.g. `feat(users)`, `fix(plugin)`, `docs(readme)`).

Examples:
```
feat(roles): add collection grant management to MongocampRoles
fix(plugin): redirect to / instead of /secured on logout
docs: add CLAUDE.md with architecture overview
chore: bump @nuxt/ui to 4.9.0
```
