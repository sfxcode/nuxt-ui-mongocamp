# Changelog


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

