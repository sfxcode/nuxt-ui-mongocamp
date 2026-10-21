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

Declares `moduleDependencies` for `@nuxt/ui`, `unocss-nuxt-ui`, `@formkit/nuxt`, `@sfxcode/nuxt-ui-formkit`, `@sfxcode/nuxt-mongocamp-server`, and `@nuxtjs/i18n` (see [Internationalization](#internationalization--srcruntimelocales) below). On setup it registers:
- The runtime plugin (`src/runtime/plugin.ts`)
- All components in `src/runtime/components/` (auto-imported)
- All composables in `src/runtime/composables/` (auto-imported)
- The server proxy catch-all route (`src/runtime/server/handlers/mongocampProxy.ts`), unconditionally — like the auth middleware below, it's always registered but internally gated by a runtime option (`useServerProxy`, default `false`)

Also warns at build time (via `consola`) if `useServerProxy` and `useGlobalAuthMiddleware` are both enabled — server proxy mode has no login, so `securedRouteParts`/`managementRouteParts`/`adminRouteParts` could never unlock.

### Runtime plugin — `src/runtime/plugin.ts`

Runs on app boot. Fetches the MongoCamp server version via `informationApi.version()` and provides it as `$mongocampVersion`. If the module's `useGlobalAuthMiddleware` option is `true` (default `false` — opt-in), registers a global `global-auth` route middleware built on `useMongocampRoles()`:
- Gates routes by glob pattern against `securedRouteParts` (requires login), `managementRouteParts` (requires manager/admin), and `adminRouteParts` (requires admin) — all configured under the module's own `nuxtUiMongocamp` key, all defaulting to `[]` (nothing protected until configured)
- Awaits `logout()` on `logoutPath` (module option, default `'/logout'`), then redirects to `logoutRedirectPath` (module option, default `'/'`)
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

Kept in sync with `docs/components/index.md` (the canonical, per-component-documented list) — check there first if this table looks stale.

| Component | Purpose |
|---|---|
| `MongocampLogin` | FormKit schema-driven login form; persists last userId in a cookie |
| `MongocampUsers` | Full CRUD table for users — add/edit (with role transfer listbox) / delete via UModal; per-row **Details** drawer (`USlideover`, built from a *copy* of the list row — `getUser` returns the same object — never shows `apiKey`) and **Regenerate API key** (not on the signed-in user's row; confirm → key shown once → dropped on close; list reloaded) |
| `MongocampRoles` | Full CRUD table for roles — add/edit / delete via UModal; key icon links to grant management page (configurable via `grantsPath` prop); per-row **Details** drawer with the role's grants (copy of the row, `getRole` adds nothing) |
| `MongocampRoleGrants` | Per-role grant CRUD — lists collection grants for a named role, add/edit/delete; filters available collections to exclude already-granted ones |
| `MongocampCollections` | Table of all collections, with links to info/data pages; admins get **Clear**/**Drop** on ordinary collections (never `mc_*` or GridFS members — `isProtectedCollection`), behind `MongocampConfirmByName`; `canManage` prop hides them, `changed` event after a success; the bucket clear/delete use the same confirmation |
| `MongocampCollectionInfos` | Stat cards + indexes + inferred schema for one collection, plus a **JSON schema** modal (the server's own `getJsonSchema`, loaded on first open, copy/download) and an on-demand **Field statistics** card computed client-side from a `$sample` (`analyzeSamples`; never the server's `getSchemaAnalysis`, which leaks state across collections) |
| `MongocampCollectionData` | Paginated, filterable, sortable document table; managers get an **Index this field** menu (asc/desc, `createIndexForField`) in each data column header — not for buckets, `_id` or `metaData`; `infoPath` prop for the "View indexes" toast link; re-creating an existing index is a server no-op, not an error |
| `MongocampBucketFiles` | Paginated/filterable GridFS bucket file browser — list/download/upload/delete/rename via `useMongocampBucket`; reached from `MongocampCollections`' bucket rows via `bucketFilesPath` |
| `MongocampJobs` | Full CRUD table for scheduled background jobs |
| `MongocampAccount` | Current-user account page: profile, password change, API key |
| `MongocampDatabases` | Read-only table of all databases (size, collection count) |
| `MongocampVersion` | Badge showing live server name/version from the injected `$mongocampVersion` |
| `MongocampFilterBuilder` | Visual filter editor (v-model `FilterGroup` + `fields`), emits `apply(lucene)`; logic lives in `useMongocampFilterBuilder`. Wired into `MongocampCollectionData` (Filters button, chips, AND with the quick search) |
| `MongocampBulkDelete` | Selection bar + confirm modal for bulk delete; Users/Roles/CollectionData use it with `createSelectColumn` (`src/runtime/utils/`) and `runBulkDelete`. Selection is cleared on every reload; the signed-in user and GridFS bucket collections are never selectable. Has an `actions` slot in its bar (hosts the **Edit selected** button); in `MongocampCollectionData` it deletes via one `deleteMany` (`$or` of hex ids) with a per-item fallback |
| `MongocampBulkEdit` | Dialog only (`v-model:open`, `selected`, `fields`, `saving`, `error`, emits `apply({ field, value })`): set one scalar field on every selected document. Its trigger lives in `MongocampBulkDelete`'s `actions` slot and the dialog sits *outside* that bar, which unmounts when a reload clears the selection. `MongocampCollectionData` applies it with `updateMany` (`$or` of hex ids, 100 per request) |
| `MongocampImport` | Trigger button + wizard dialog (file → preview → batched import → result/retry) importing JSON/CSV into a collection; part of `MongocampCollectionData`'s toolbar, hidden for GridFS bucket collections; emits `imported(count)` |
| `MongocampAggregationBuilder` | Stage editor (`$match/$group/$sort/$project/$limit` as JSON text) + raw JSON view of one pipeline; server-side paging, plain-JSON result table, page export; deny-listed operators (`$out $merge $function $accumulator $where $lookup $unionWith $graphLookup`) are refused at any depth in the UI and again in `runAggregation`. Playground page `…/collections/[name]/aggregate` |
| `MongocampDashboard` | Admin landing page: linked collection/user/role counts + server version; default slot for app-specific content; exposes `refresh()` |
| `MongocampGrantList` | Read-only grants table (`grants: Grant[]`: collection, type, read/write/administrate badges, empty state); used by the user and role detail drawers |
| `MongocampConfirmByName` | Type-the-name confirm modal (`name`, `title`, `description`, `confirmLabel`, `onConfirm: () => Promise<void>`, `v-model:open`): confirm disabled until the trimmed input equals `name` (case-sensitive), Enter goes through the same guard, a rejection keeps it open with the `useMongocampError` message |
| `MongocampErrorAlert` | Failed-load banner (retry, or log-in-again on 401); used by every list component |
| `MongocampEmptyState` | Icon + message for `UTable`'s `#empty` slot |

UTable columns with custom cells use `h()` + `resolveComponent()` (not `<template>`) — see existing components for the pattern.

### Composables — `src/runtime/composables/`

Kept in sync with `docs/composables/index.md` (the canonical, per-composable-documented list) — check there first if this list looks stale.

- **`useMongocampAdmin`** — wraps `adminApi` and `collectionApi` from `useMongocampApi()` for user and role CRUD (`listUsers`, `addUser`, `deleteUser`, `updateUserRoles`, `updateUserPassword`, `listRoles`, `addRole`, `updateRole`, `deleteRole`, `listCollections`, `clearCollection`, `deleteCollection`, `getJsonSchema`, `getUser`, `getRole`, `regenerateUserApiKey` (returns the plain key; the misspelled client method `gnerateNewApiKeyForUser` is called only there) — the last six with a 15 s timeout; clear/delete are irreversible and unguarded, so callers put them behind `MongocampConfirmByName` and `isProtectedCollection`)
- **`useMongocampCollection`** — reactive state for paginated collection queries: `filter`, `sort`, `projection`, `pagination` (pageIndex + pageSize), `total`
- **`useMongocampDocument`** — helpers for document-level operations: `ensureMetaData` (stamps `createdBy`/`updatedBy`/timestamps from the logged-in user) and `updateFromPartial`
- **`useMongocampSchema`** — exports `useJsonSchema()` with `schemaToColumnDefinition(definition, fields)` for mapping a `JsonSchemaDefinition` to UTable column configs; sorts `_id` first, then id-containing fields, then others; detects `date-time` and `number` types
- **`useMongocampBucket`** — GridFS bucket detection, file-id resolution, upload/download/delete/rename
- **`useMongocampIndex`** — create/list/delete MongoDB indexes (standard, unique, text, expiring) plus `createIndexForField(collection, field, ascending = true)` (plain single-field index, 15 s timeout)
- **`useMongocampJobs`** — list/register/update/execute/delete scheduled background jobs
- **`useMongocampAccount`** — account self-service: profile, password change, API key regeneration
- **`useMongocampSystem`** — read-only database viewer (list, per-database info, collections)
- **`useMongocampFilterBuilder`** — pure `buildFilterQuery(group, fieldTypes)` / `buildCondition`: filter rows (field, operator, value) → one Lucene string; operators depend on field type, incomplete rows are skipped, range bounds only accept plain numbers/ISO dates (the query helpers don't escape them); operator set is limited to what a real server was verified to handle (no `_id`, nothing for arrays/objects/boolean existence); it delegates ranges and existence to `useMongocampQuery`, which closes open ranges with far bounds, widens bare dates and writes `exists` per value type because the server has no working `_exists_`/`[x TO *]` — see its docs page
- **`useMongocampExport`** — `rowsToCsv` / `downloadTextFile` for exporting the rows already on screen (used by `MongocampCollectionData`'s export menu)
- **`useMongocampBulkDelete`** — `runBulkDelete(items, remove, concurrency, removeMany?)`: limited-concurrency deletes returning `{ deleted, failed }` per item; optional `removeMany` (`run`, `canHandle`, `chunkSize`) deletes in chunks with one request each and re-deletes a failed/short chunk one by one (never calls `run` with an empty chunk — an empty filter wipes a collection)
- **`useMongocampImport`** — `importRows(collection, rows, { batchSize, stampMetadata, signal, onProgress })`: sequential `documentApi.insertMany` batches, per-batch failure report (`mayBePartial` is false only for a 400), 60 s timeout per batch; the parsing/validation lives in `utils/importRows.ts` + `importPipeline.ts` (`prepareImport`), batching in `utils/batchInsert.ts`, id chunking in `utils/bulkEdit.ts` (`runBulkUpdate`, `buildIdFilter`), `utils/objectId.ts`; server behaviour in `brain/project/mongocamp-bulk-endpoints-server-behavior.md`
- **`useMongocampAggregation`** — `runAggregation(collection, pipeline, { page, rowsPerPage })` (`aggregateRaw`, pagination headers, `allowDiskUse: false`, throws `ForbiddenPipelineError` before any request; the server's `500 "Index 0 out of bounds…"` for an empty result becomes an empty page), `listDistinct` (scalars only, drops `null`; feeds the filter builder's value suggestions), `sampleDocuments` (`$sample`, one page), `describeAggregationError` (only MongoDB's own message — the raw error contains the database host:port). Helpers in `utils/aggregationPipeline.ts` (`buildPipeline`, `parsePipeline`, `findForbidden`, `validateStages`, …), `aggregationErrors.ts`, `aggregationResult.ts`, `analyzeSamples.ts`, `filterSuggestions.ts`; server behaviour in `brain/project/mongocamp-aggregation-server-behavior.md`
- **`useMongocampError`** — `describeError(e)` maps API errors (`FetchError` → network, 401, 403, other) to i18n messages for `MongocampErrorAlert`
- **`useMongocampQuery`** — high-level Lucene query helpers (`equals`, `like`, `inRange`, `and`, `or`, …)
- **`useMongocampQueryBuilder`** — low-level Lucene syntax builder used by `useMongocampQuery`
- **`useMongocampExtendedJson`** — converts MongoDB extended-JSON documents to/from the plain values `FUAutoForm` binds to
- **`useMongocampRoles`** — `isAdmin`/`isManager` (admin always counts as manager) and `isAllowedPathForRoute(route)`, backing the runtime plugin's global auth middleware; reads the module's `nuxtUiMongocamp` options (`managerRoles`, `securedRouteParts`, `managementRouteParts`, `adminRouteParts`, `notAllowedPath`, `logoutRedirectPath`, `logoutPath`) from `useRuntimeConfig().public.nuxtUiMongocampOptions`
- **`useMongocampClientApi`** — the drop-in every other composable/component calls instead of the dependency's `useMongocampApi()`; switches between session mode and `useMongocampProxyApi()` based on `useServerProxy`
- **`useMongocampProxyApi`** — session-mode-shaped API client (`adminApi`, `documentApi`, ...) pointed at the local server proxy route instead of the real MongoCamp URL; builds the 11 API classes itself via `src/runtime/utils/createProxyMongocampApis.ts`, since the dependency's own `createMongocampApis` factory isn't part of its public export surface

**Auto-import surface:** the whole `src/runtime/composables/` directory is registered with `addImportsDir`, so *every named export there becomes a global in consumer apps*. Keep exports to `use*` functions (types are fine) and put pure helpers in `src/runtime/utils/` (not scanned; imported relatively) — e.g. `utils/filterBuilder.ts`, `bulkDelete.ts`, `exportRows.ts`, `escapeFieldName.ts`, `isoDate.ts`, `createSelectColumn.ts`, `collectionProtection.ts`, `importRows.ts`, `importPipeline.ts`, `batchInsert.ts`, `bulkEdit.ts`, `objectId.ts`, `aggregationPipeline.ts`, `aggregationErrors.ts`, `aggregationResult.ts`, `analyzeSamples.ts`, `filterSuggestions.ts`; the matching composables just return them. (`unwrapExtendedJson`/`wrapExtendedJson` predate this rule and stay exported.) Check with `grep "src/runtime/composables" playground/.nuxt/types/imports.d.ts`.

### Internationalization — `src/runtime/locales/`

`@nuxtjs/i18n` is a `moduleDependency` (registered unconditionally, like `@nuxt/ui`) so every consumer app gets it whether or not they use i18n themselves. Every user-facing string in this module's own components/composables goes through `useI18n()`'s `t()`, keyed under a single top-level `nuxtUiMongocamp` namespace (e.g. `t('nuxtUiMongocamp.login.heading')`) — this avoids colliding with a consumer app's own translation keys, which live in their own namespaces.

- `en.json` (default) and `de.json` live in `src/runtime/locales/` and ship inside the published package.
- Registered via `nuxt.hook('i18n:registerModule', ...)` in `src/module.ts`'s `setup()`, **not** via `moduleDependencies['@nuxtjs/i18n'].defaults` — `@nuxtjs/i18n` reads `nuxt.options.i18n` during its own module setup, which runs *before* this module's `setup()` (moduleDependencies install first), so mutating `nuxt.options.i18n` directly is too late for `locales`/`langDir`. `i18n:registerModule` is the hook `@nuxtjs/i18n` exposes specifically for other modules to contribute locale files into its merged registry, independent of setup order. Flat, top-level options like `defaultLocale` merge fine through `moduleDependencies[...].defaults`, though.
- Adding a new component string: add the key to *both* `en.json` and `de.json` under `nuxtUiMongocamp.<component>.<key>`, then reference it via `t('nuxtUiMongocamp.<component>.<key>')`. Keep the English value identical to what it replaces — component/unit tests assert against rendered English text under the default locale, so a mismatched value breaks them even though the app still runs fine.
- Composables that show toasts (`useMongocampBucket`, `useMongocampAccount`) call `useI18n()` themselves; components layer their own `t()` on top for template/schema strings. Table `columns` are a `computed()` (the static-string `header: t(...)` entries need it), so headers re-translate live when the locale changes without a remount — keep new static column arrays `computed` too. `MongocampCollectionData`'s columns are derived from data keys, not translated, so they stay a `ref`.
- **Never put a literal `{`/`}` (or `@`, `|` outside a plural) in a locale string** — vue-i18n reads braces as a placeholder, and one bad string makes the *whole* locale fail to load (every component test then fails with `Failed to load messages for locale "en" … Invalid token in placeholder`). Put JSON/code examples in the component as a constant, or reword.
- Unit tests that mock `#imports` entirely (see `useMongocampAccount.test.ts`, `useMongocampBucket.test.ts`) need `useI18n: () => ({ t: (key: string) => key })` in the mock, or the composable throws immediately on the first `t()` call.

### FormKit / @sfxcode/nuxt-ui-formkit conventions

Forms use FormKit schema arrays (not template markup). The key custom input types are `nuxtUIInput`, `nuxtUISwitch`, `nuxtUIListbox`, and `nuxtUISelectMenu` — all provided by `@sfxcode/nuxt-ui-formkit`. The `FUDataEdit` component wraps schema + submit logic. See `playground/formkit.config.ts` for how inputs are registered.

Listbox in transfer mode requires `displayMode: 'transfer'` and options as `{ value, label }` objects. SelectMenu options can be plain strings. Use `options` (not `items`) as the schema key for both `nuxtUIListbox` and `nuxtUISelectMenu` — set it directly on the schema node object. Inputs are bulk-registered via `nuxtUIInputs` and `nuxtUIOutputs` spreads from `@sfxcode/nuxt-ui-formkit/definitions` — see `playground/formkit.config.ts`.

### Playground — `playground/`

SSR is disabled (`ssr: false`). The playground registers the module directly via the local import (`import NuxtUIMongocamp from '..'`). Its `nuxt.config.ts` sets `nuxtUiMongocamp: { useGlobalAuthMiddleware: true, securedRouteParts: ['/secured/**'], managementRouteParts: ['/secured/manager/**'], adminRouteParts: ['/secured/admin/**'], managerRoles: ['manager'] }` so pages under `/secured/`, `/secured/manager/`, and `/secured/admin/` are protected — this is opt-in and not automatic for consumers of the module. The `mongocamp` config key in `nuxt.config.ts` passes through to `@sfxcode/nuxt-mongocamp-server`.

### Tests — `test/`

`vitest.config.ts` defines three projects. `pnpm run test` explicitly runs only the first two (`--project unit --project components`) — a bare `vitest run` would otherwise also sweep in `e2e-auth`, which needs Playwright browsers that aren't installed in CI:
- **`unit`** — `test/*.test.ts`, plain Node environment, composables mocked via `vi.mock` (relative-path imports) or by faking `#imports` entirely — see `brain/patterns/testing-nuxt-auto-import-composables.md`. E2e smoke coverage lives here too (`test/basic.test.ts`, via `@nuxt/test-utils/e2e`'s `setup()`+`$fetch`).
- **`components`** — `test/components/**/*.test.ts`, a real booted Nuxt environment (`happy-dom`, via `@nuxt/test-utils/runtime`'s `mountSuspended`) against the `test/fixtures/basic/` fixture (which also needs a `pages/` dir and `formkit.config.ts` for this to work — see `brain/patterns/component-testing-nuxt-environment.md` for the full list of gotchas: `UApp` wrapper, teleported `UModal` content, FormKit id/validation timing).
- **`e2e-auth`** — `test/e2e-auth/**/*.test.ts`, real-browser (Playwright, via `@nuxt/test-utils/e2e`'s `createPage`) coverage for the global auth/role middleware. Run manually with `pnpm run test:e2e:auth` after a one-time `npx playwright install chromium` — deliberately **not** part of `pnpm run test`/CI, since Playwright needs installed browser binaries. The session is seeded as the `mongocamp-session` **cookie** (`test/fixtures/auth/e2e-helpers.ts`); the suite was last run green (16/16) on 2026-10-17. A Playwright upgrade can require `pnpm exec playwright install chromium` again. See `brain/patterns/e2e-browser-testing.md`.

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
