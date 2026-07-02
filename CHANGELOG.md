# Changelog


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

