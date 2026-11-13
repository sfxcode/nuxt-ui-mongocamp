# Changelog


## v1.5.3

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.5.2...v1.5.3)

### 🚀 Enhancements

- **module:** Public utils export, useMongocampProxyMode and proxy-aware role flags ([e9026ef](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e9026ef))
- **module:** Paths option and useMongocampPaths for all link targets ([84cf5fd](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/84cf5fd))
- **composables:** Shared collection-name list and groupCollectionNames ([b913c71](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b913c71))
- **components:** Server status, user access, navigation and breadcrumb data ([7aa4980](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/7aa4980))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.5.2

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.5.1...v1.5.2)

### 🚀 Enhancements

- **components:** HideHeading prop for the list components and the dashboard ([348be73](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/348be73))
- **components:** Page-owned toolbars and changed events ([93b2314](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/93b2314))
- **components:** Theme-friendly colours, tabular figures and login options ([75fb588](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/75fb588))
- **module:** Default FormKit config and styles, consumer setup docs ([de9f57a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/de9f57a))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.5.1

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.5.0...v1.5.1)

### 🚀 Enhancements

- **chart:** Update series colors to use theme variables and improve visibility handling ([b7bb733](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b7bb733))
- **version:** Show the MongoDB server version ([2f37d36](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2f37d36))
- **playground:** Dashboards for every role ([3059ebd](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/3059ebd))
- **server-info:** MongocampServerInfo panel for MongoDB version, load and capabilities ([badb278](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/badb278))

### 🩹 Fixes

- **release:** Update changelogen command to use patch versioning ([5745256](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/5745256))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.5.0

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.4.0...v1.5.0)

### 🚀 Enhancements

- **collection-data:** Bulk by filter, server permissions, POST search and typed reads ([f2097c1](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f2097c1))
- **collections:** Batch collection info, server-side copy and rename ([18735be](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/18735be))
- **indexes:** Ordered index details and create options, field details, aggregation filter ([f5a78ef](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f5a78ef))
- **import-export:** Ordered inserts, NDJSON import and streamed export ([6973792](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6973792))
- **extended-json:** Type hints for writing typed values ([bcd5914](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/bcd5914))
- **field-types:** UseMongocampFieldTypes over fields/detail ([b7b0135](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b7b0135))
- **collection-data:** Filter builder fields from the server's field analysis ([5f35ac3](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/5f35ac3))
- **bulk-edit:** Write the field's real BSON type ([cee8dc0](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/cee8dc0))
- **collection-data:** Insert with the collection's field types ([1dfa9fb](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1dfa9fb))
- **compare:** Compare the typed documents ([39383e3](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/39383e3))
- **collection-data:** Chart a field of the matching documents ([7191cd3](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/7191cd3))
- **aggregation:** Start the builder from the table's filter ([c56ae66](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c56ae66))
- **admin:** Show "administrators only" without a request ([341c3f4](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/341c3f4))
- **settings:** Hint while a missing grant is answered with 401 ([22a5d20](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/22a5d20))
- **bucket:** Distribution chart of the stored files ([6991177](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6991177))

### 📖 Documentation

- Server 1.8.1 baseline, guide and index entries ([36d4a02](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/36d4a02))
- Correct the $lookup and relaxed extendedJson notes ([e738857](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e738857))
- Reword 1.6.x claims as dated, mark API the module no longer uses ([091dac3](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/091dac3))

### ✅ Tests

- **locales:** Guard test for translation keys, drop 16 orphaned keys ([a2bd03f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a2bd03f))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.4.0

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.3.5...v1.4.0)

### 🚀 Enhancements

- **settings:** Add hide* props to MongocampSettings ([6fa2eed](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6fa2eed))
- **settings:** Show cluster members ([93d49c4](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/93d49c4))
- **session:** Optional server check in the session guard ([cc1eb29](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/cc1eb29))
- **collection-data:** Send partial updates on edit ([8430bf0](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8430bf0))
- **bucket:** Reject filters too long for the server URI ([6ffb8cc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6ffb8cc))
- **query:** Negate AND groups with De Morgan ([43e5a7f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/43e5a7f))
- **errors:** Show the server's own error message and code ([3825a59](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/3825a59))
- **aggregation:** Deny stats stages and strip the database host from their results ([7d8c69c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/7d8c69c))
- **infos:** Analyze all documents with the server's field analysis ([31932cf](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/31932cf))
- **permissions:** UseMongocampPermissions and a read-only data table ([a042595](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a042595))
- **query:** ById, isTrue, arrayContains, hasItems and onDay helpers ([7fa8b3f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/7fa8b3f))
- **fetch:** UseMongocampFetchAll reads every page with a cap, progress and abort ([25499a2](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/25499a2))
- **export:** UseMongocampExportAll and exact long integers in exports ([764a855](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/764a855))
- **state:** UseMongocampPersistedState and remembered table state ([ab8ff95](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/ab8ff95))
- **queries:** UseMongocampSavedQueries with validated, capped browser storage ([871bafd](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/871bafd))
- **refresh:** UseMongocampAutoRefresh and an autoRefresh prop for dashboard and jobs ([b1d8436](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b1d8436))
- **stats:** UseMongocampCollectionStats and document path tools ([e42a2cc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e42a2cc))
- **document:** MongocampDocumentView and a View action in the data table ([27b4309](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/27b4309))
- **query:** MongocampQueryBar with sort, fields to load, history and saved queries ([06f402a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/06f402a))
- **indexes:** MongocampIndexes with usage, compound and unique indexes and a typed drop ([2633ba4](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2633ba4))
- **bulk:** Select all matching documents with a cap, progress, stop and typed confirmation ([1ee1901](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1ee1901))
- **copy:** MongocampCollectionCopy with quick backup and the same indexes, and MongocampExportAll ([928b237](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/928b237))
- **aggregation:** Previews, templates, saved pipelines and four more stages in the builder ([354b5a2](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/354b5a2))
- **charts:** MongocampCollectionCharts with Nuxt UI's UChart and a Distribution card ([b38b70d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b38b70d))
- **overview:** MongocampServerOverview and a shared MongocampChart ([ccc256d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/ccc256d))
- **permissions:** MongocampPermissionMatrix ([b538888](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b538888))
- **files:** Bucket file preview, multi-file drag-and-drop upload and JSON metadata editor ([b24182e](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b24182e))
- **palette:** MongocampCommandPalette ([57213bb](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/57213bb))
- **compare:** MongocampDocumentCompare and Compare selected in the data table ([48f89e6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/48f89e6))
- **playground:** Admin shell reference with collection sidebar, tabs and palette ([8cf6b04](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8cf6b04))
- **charts:** Chart an aggregation result and index size/usage ([b6a6fe7](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b6a6fe7))
- **charts:** Collapsed charts in collections, databases and field statistics ([4ccdace](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/4ccdace))

### 🔥 Performance

- **charts:** Load the chart library only when a chart is on screen ([1553854](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1553854))

### 🩹 Fixes

- **numbers:** Keep 64-bit integers exact when reading documents ([cb6531a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/cb6531a))
- **session:** A missing grant is a 403, not a dead session ([f81de4c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f81de4c))
- **document:** Lighter tree rows and a CI-safe timeout for the large-document test ([b8e9ba3](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b8e9ba3))
- **ui:** Chart axis labels, matrix contrast, popover alignment and a clearer playground shell ([2f46999](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2f46999))

### 📖 Documentation

- Remove stale probe descriptions and update indexes ([93f8694](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/93f8694))
- Align behaviour statements with server 1.6.3 ([61f6dfc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/61f6dfc))

### ✅ Tests

- **settings:** Cover hide* props and document them ([b1b9f85](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b1b9f85))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.3.5

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.3.4...v1.3.5)

### 🩹 Fixes

- Support mongocamp server 1.6.3 and drop the collection-drop workaround ([fed2e4a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/fed2e4a))

### 💅 Refactors

- Make mongocamp server 1.6.3 the baseline, drop pre-1.6.3 compat code ([f27f82e](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f27f82e))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.3.4

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.3.3...v1.3.4)

### 🚀 Enhancements

- **filter:** Offer _id in the filter builder (exact operators only) ([cfa5bfc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/cfa5bfc))

### 🩹 Fixes

- **collections:** Treat a dropped collection as dropped despite the 500 from server 1.6.1 ([280ad30](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/280ad30))

### 💅 Refactors

- **aggregation:** Drop the empty-result workaround for server 1.6.1 ([a5fc3e7](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a5fc3e7))

### 📖 Documentation

- **session:** Note that server 1.6.1 sends CORS headers on 401 ([e327c06](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e327c06))
- **filter:** Name the exact negated-group problem and link the server issue ([924b599](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/924b599))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.3.3

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.3.2...v1.3.3)

### 🚀 Enhancements

- **collections:** Add clear/drop/json-schema methods and protection rule ([7d22337](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/7d22337))
- **collections:** Add MongocampConfirmByName type-the-name modal ([ffb6784](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/ffb6784))
- **collections:** Clear and drop collections behind a type-the-name confirm ([a7d1e3a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a7d1e3a))
- **collections:** Add a JSON schema viewer to MongocampCollectionInfos ([d325f51](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/d325f51))
- **admin:** Wrap getUser, getRole, regenerateUserApiKey and createIndexForField ([a2cdf56](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a2cdf56))
- **users:** Let admins regenerate another user's API key ([00ec3c3](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/00ec3c3))
- **admin:** Add read-only detail drawers for users and roles ([d841fa3](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/d841fa3))
- **collection-data:** Add an "Index this field" menu to column headers ([1fe91b8](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1fe91b8))
- **session:** Add a JWT expiry helper ([71f2a19](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/71f2a19))
- **session:** Add useMongocampSession and a rate-limited server probe ([6ab9606](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6ab9606))
- **session:** Add the opt-in sessionGuard route middleware and loginPath ([1c099fc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1c099fc))
- **errors:** Tell a dead session from a dead server in MongocampErrorAlert ([cdee07f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/cdee07f))
- **settings:** Add the read-only MongocampSettings viewer ([1881427](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1881427))

### 🩹 Fixes

- **playground:** Generate .nuxt before the module build on Netlify ([5e16d69](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/5e16d69))
- **playground:** Pin the static Nitro preset on Netlify ([2ece19b](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2ece19b))
- **playground:** Update Netlify configuration for improved build process and environment settings ([021eb56](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/021eb56))
- **aggregation:** Soften the 503 message and offer retry ([8e20583](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8e20583))
- **admin:** Widen the detail drawers so the grants table fits ([c5e36fb](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c5e36fb))

### 📖 Documentation

- **collections:** Document clear/drop, the confirm modal and the JSON schema viewer ([33691f6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/33691f6))
- **admin:** Document API-key regeneration, detail drawers and the index menu ([16b2161](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/16b2161))
- **session:** Add the Session Handling guide ([cdd5db8](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/cdd5db8))

### 🏡 Chore

- **playground:** Add netlify.toml for the playground deploy ([4c8fc1b](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/4c8fc1b))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.3.2

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.3.1...v1.3.2)

### 🚀 Enhancements

- **bulk:** Import documents, bulk edit and one-request bulk delete ([833f552](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/833f552))
- **aggregation:** Aggregation builder, value suggestions and field statistics ([8ca2387](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8ca2387))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.3.1

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.3.0...v1.3.1)

### 🚀 Enhancements

- **roles:** Add functionality to clone roles and grant read-only access to collections ([a0d255b](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a0d255b))

### 🩹 Fixes

- **release:** Update changelogen command to use patch versioning ([ed01ac8](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/ed01ac8))

### ❤️ Contributors

- Sfxcode <tom@sfxcode.com>

## v1.3.0

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.7...v1.3.0)

### 🚀 Enhancements

- Add MongocampErrorAlert and MongocampEmptyState components for improved error handling and empty state messaging ([f474c8f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f474c8f))
- **ui:** Wire error/empty states into remaining lists and make playground nav responsive ([e6cb34d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e6cb34d))
- **collection-data:** Add page size, column toggle, page export and consistent dates ([44e7c07](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/44e7c07))
- **i18n:** Re-translate table headers live and show standard index type ([2e1c41e](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2e1c41e))
- **dashboard:** Add MongocampDashboard component and use it in the playground ([c9a9515](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c9a9515))
- **bulk-delete:** Select and delete multiple users, roles and documents ([45bd247](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/45bd247))
- **filter-builder:** Add useMongocampFilterBuilder for type-aware Lucene filters ([678f978](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/678f978))
- **filter-builder:** Add MongocampFilterBuilder component ([f2d6fe2](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f2d6fe2))
- **collection-data:** Add filter builder panel with chips, verified against a real server ([f15fbc1](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f15fbc1))
- **collection-data:** Tell a rejected filter apart from a dead server ([2297e24](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2297e24))

### 🩹 Fixes

- **query:** Make exists and open-ended range helpers work on a real MongoCamp server ([b833a0d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b833a0d))
- **delete:** Show why a refused single-row delete failed in Users, Roles and Jobs ([b373ab7](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b373ab7))
- **users:** Disable the row delete button for the signed-in user ([78b701e](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/78b701e))
- **role-grants:** Only change the table after the server confirmed the save ([9506ba6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/9506ba6))
- **release:** Update changelogen command to use minor versioning ([0517f77](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/0517f77))

### 📖 Documentation

- Consistency pass for the UI/UX plan; explain the disabled own-user checkbox ([35f7727](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/35f7727))
- Correct where the login session lives and explain the stale-session state ([e1f0bbc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e1f0bbc))

### 🏡 Chore

- **dependencies:** Update @nuxt/ui, @sfxcode/nuxt-ui-formkit, and other dependencies to latest versions ([e366c9f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e366c9f))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.2.7

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.6...v1.2.7)

### 🩹 Fixes

- **playground:** Adapt devtools optimizeDeps entries to @nuxt/devtools 4 ([40da1f5](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/40da1f5))

### 🏡 Chore

- **dependencies:** Update nuxt and related packages to version 4.6.1 ([8574139](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8574139))
- **dependencies:** Update dependencies to latest versions, including @internationalized/date, @nuxt/ui, @sfxcode/nuxt-ui-formkit, and devDependencies ([3e9c4f8](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/3e9c4f8))
- **dependencies:** Update vitest to version 5.0.3 and adjust related dependencies ([754604a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/754604a))
- **dependencies:** Update @nuxt/devtools to version ^4.0.0-beta.4 ([a9bc3a5](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a9bc3a5))

### ❤️ Contributors

- Sfxcode <tom@sfxcode.com>

## v1.2.6

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.5...v1.2.6)

### 🏡 Chore

- **dependencies:** Update dependencies to latest versions, including @internationalized/date, @sfxcode/nuxt-ui-formkit, and nuxt ([47c8e97](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/47c8e97))
- **dependencies:** Update packageManager version to pnpm@11.21.0 ([6bd3f09](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6bd3f09))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.2.5

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.4...v1.2.5)

### 🏡 Chore

- **dependencies:** Update @sfxcode/nuxt-mongocamp-server to ^1.5.2 and refresh pnpm-lock.yaml ([8c3b96b](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8c3b96b))
- **config:** Enable token auto-refresh in nuxt.config.ts ([96f07e6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/96f07e6))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.2.4

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.3...v1.2.4)

### 🏡 Chore

- **dependencies:** Update dependencies to latest minor and patch versions, including Nuxt ecosystem to ^4.5.1 ([728d33c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/728d33c))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.2.3

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.2...v1.2.3)

### 🏡 Chore

- **dependencies:** Update Nuxt ecosystem dependencies to ^4.5.0 and other minor dependency updates ([8f1d248](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8f1d248))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.2.2

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.1...v1.2.2)

### 🏡 Chore

- **dependencies:** Nixt-ui-formkit 1.2.7 ([2261319](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2261319))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.2.1

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.2.0...v1.2.1)

### 🏡 Chore

- **release:** Update changelogen to generate patch releases ([87e1b04](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/87e1b04))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.2.0

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.1.4...v1.2.0)

### 🚀 Enhancements

- **auth:** Add optional server proxy auth mode ([1f665d1](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1f665d1))
- **plugin:** Add logoutRedirectPath module option ([292f639](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/292f639))
- **login:** Add redirectPath prop for the post-login navigation target ([33b72b0](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/33b72b0))
- **i18n:** Add @nuxtjs/i18n with English/German locale files ([409e0eb](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/409e0eb))
- **i18n:** Localize MongocampLogin ([d1817d0](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/d1817d0))
- **i18n:** Localize MongocampUsers ([a01331c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a01331c))
- **i18n:** Localize MongocampRoles and MongocampRoleGrants ([a185c99](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a185c99))
- **i18n:** Localize MongocampCollections and MongocampCollectionInfos ([3b1738a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/3b1738a))
- **i18n:** Localize MongocampCollectionData and MongocampBucketFiles ([60ea497](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/60ea497))
- **i18n:** Localize MongocampJobs, MongocampAccount, MongocampDatabases, MongocampVersion ([007a89c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/007a89c))
- **i18n:** Localize useMongocampBucket and useMongocampAccount toasts ([c140d76](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c140d76))

### 🩹 Fixes

- **login:** Remove debug-data panel leaking plaintext password ([e9dc005](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/e9dc005))
- **module:** Harden server proxy mode and packaging ([dd9a34d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/dd9a34d))
- Surface real error messages in swallowed toast catches ([1a46ecc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/1a46ecc))
- **auth:** Await logout, make the logout trigger path configurable ([9d80727](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/9d80727))
- **proxy:** Import API classes from the /api subpath, not the package root ([c83af92](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c83af92))
- **playground:** Add missing /logout page ([47cadd1](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/47cadd1))
- **auth:** Ensure correct Nuxt app context for `navigateTo` after login ([ace20a9](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/ace20a9))

### 📖 Documentation

- Document the i18n architecture in CLAUDE.md ([b377086](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b377086))

### 🏡 Chore

- Add @iconify-json/lucide so lucide icons bundle at build time ([87989dc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/87989dc))

### ✅ Tests

- **components:** Add MongocampLogin and MongocampRoleGrants coverage ([8ba8a87](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/8ba8a87))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.1.4

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.1.3...v1.1.4)

### 🚀 Enhancements

- **buckets:** Add GridFS bucket file browser (MongocampBucketFiles) ([908f2a0](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/908f2a0))

### 📖 Documentation

- Document nuxtUiMongocamp module options and route protection ([dcc9491](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/dcc9491))
- Fix npm package name and add version/changelog link to nav ([c7df668](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c7df668))

### ✅ Tests

- **components:** Add real component-mounting coverage for the three riskiest components ([9f9d9ad](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/9f9d9ad))
- **e2e:** Add real-browser coverage for the global auth/role middleware ([4bf4e7f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/4bf4e7f))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.1.3

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.1.2...v1.1.3)

### 🚀 Enhancements

- **roles:** Add useMongocampRoles for role/route-based nav guard ([795413e](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/795413e))

### 🩹 Fixes

- **deps:** Declare defu as an explicit dependency ([4c6ad4e](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/4c6ad4e))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.1.2

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.1.1...v1.1.2)

### 🩹 Fixes

- **collection-data:** Drop _id from generated Add/Edit form, restore metaData stamping ([343d289](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/343d289))

### 💅 Refactors

- **collection-data:** Replace hand-rolled dynamic form with FUAutoForm ([6f689a0](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6f689a0))

### 📖 Documentation

- **readme:** Update badge URLs to use `@sfxcode/nuxt-ui-mongocamp` namespace ([6797c4c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6797c4c))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.1.1

[compare changes](https://github.com/sfxcode/nuxt-ui-mongocamp/compare/v1.1.0...v1.1.1)

### 🏡 Chore

- **release:** Update changelogen command to use patch versioning ([bbd18f7](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/bbd18f7))
- **dependencies:** Update pnpm-lock.yaml with updated package versions and enhancements ([819638d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/819638d))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

## v1.1.0


### 🚀 Enhancements

- **schema:** Add useJsonSchema composable with schemaToColumnDefinition ([691b58c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/691b58c))
- **roles:** Add MongocampRoleGrants component and refactor role grant management ([595ac76](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/595ac76))
- **collections:** Add MongocampCollections component ([6e5da63](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/6e5da63))
- **playground:** Add collections admin page and nav link ([779d377](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/779d377))
- **collections:** Add MongocampCollectionInfos and MongocampCollectionData components ([571f330](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/571f330))
- **playground:** Add vertical nav, dark mode, layout split, and collection data improvements ([30468b8](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/30468b8))
- **tables:** Add filter, sort, and object detail modal to all tables ([24278b7](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/24278b7))
- **collection-data:** Server-side Lucene filter and column ordering ([ef2185d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/ef2185d))
- **schema & query:** Implement composables for schema handling and Lucene queries** ([7bb1c1a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/7bb1c1a))
- **playground:** Add sample Cart.json dataset to playground public data** ([ff371d6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/ff371d6))
- **bucket:** Add useMongocampBucket composable for GridFS file upload/download ([94ff199](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/94ff199))
- **index:** Add useMongocampIndex composable ([5b580a1](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/5b580a1))
- **collection-infos:** Add index management UI ([84fc5e9](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/84fc5e9))
- **bucket:** Add bucket-level operations to useMongocampBucket ([d671da6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/d671da6))
- **collections:** Add bucket badge and clear/delete bucket actions ([325749b](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/325749b))
- **ui:** Add tooltips to icon-only action buttons ([99e5ff6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/99e5ff6))
- **jobs:** Add useMongocampJobs composable ([a871020](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a871020))
- **jobs:** Add MongocampJobs component ([c6098e4](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c6098e4))
- **account:** Add useMongocampAccount composable ([b52f8f6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b52f8f6))
- **account:** Add MongocampAccount component ([2a8847d](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2a8847d))
- **system:** Add useMongocampSystem and MongocampDatabases (databases only) ([2b83462](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/2b83462))
- **forms:** Add useMongocampDynamicForm composable ([7dcb0d7](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/7dcb0d7))
- **collection-data:** Replace raw-JSON edit modal with generated FormKit form ([b059f22](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b059f22))
- **config:** Add token refresh interval configuration to Mongocamp options ([0d1981c](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/0d1981c))

### 🩹 Fixes

- Resolve type errors with non-null assertions on schema array access ([3ecb8ad](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/3ecb8ad))
- **DocumentApi:** Resolve `UpdateRequest` type conflict in TypeScript** ([c7705f8](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/c7705f8))
- **playground:** Remove unused catch binding in resetTestData ([067c5ec](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/067c5ec))

### 📖 Documentation

- **claude:** Add conventional commit guidelines ([60c4355](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/60c4355))
- **brain:** Meditate — prune, link, and extract principles ([61ebe4a](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/61ebe4a))
- Update README for filter/sort and collection data cell rendering ([f37488e](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/f37488e))
- Add VitePress documentation site ([3c05c5b](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/3c05c5b))
- Add docs badge to README ([a3174dc](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a3174dc))
- **forms:** Add useMongocampDynamicForm docs, update MongocampCollectionData ([89c8eb5](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/89c8eb5))

### 🏡 Chore

- Untrack brain/ and remove it from git history ([a58582f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/a58582f))
- Fill in missing package.json metadata and add LICENSE ([67e8594](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/67e8594))

### ✅ Tests

- **composables:** Add comprehensive unit tests for `useMongocampQuery`, `useMongocampSchema`, and `useMongocampQueryBuilder`** ([115e84f](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/115e84f))
- **composables:** Add comprehensive unit tests for `useMongocampQuery`, `useMongocampSchema`, and `useMongocampQueryBuilder`** ([10c5d13](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/10c5d13))
- Retrofit coverage for useMongocampAdmin/Collection/Document ([b5d42e6](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/b5d42e6))

### 🎨 Styles

- **playground:** Put class on its own line for two UIcon tags ([dbc56db](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/dbc56db))

### 🤖 CI

- Deploy VitePress docs to GitHub Pages ([de3b768](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/de3b768))
- Bump workflow Node.js to 22 ([0e21b96](https://github.com/sfxcode/nuxt-ui-mongocamp/commit/0e21b96))

### ❤️ Contributors

- Sfxcode ([@sfxcode](https://github.com/sfxcode))

