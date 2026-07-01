# Components

All components are auto-imported — no manual import needed once the module is registered.

| Component | Purpose |
|---|---|
| [`MongocampLogin`](/components/mongocamp-login) | FormKit schema-driven login form |
| [`MongocampUsers`](/components/mongocamp-users) | Full CRUD table for users |
| [`MongocampRoles`](/components/mongocamp-roles) | Full CRUD table for roles |
| [`MongocampRoleGrants`](/components/mongocamp-role-grants) | Per-role collection grant management |
| [`MongocampCollections`](/components/mongocamp-collections) | Table of all collections, with links to info/data pages |
| [`MongocampCollectionInfos`](/components/mongocamp-collection-infos) | Stat cards + inferred schema for one collection |
| [`MongocampCollectionData`](/components/mongocamp-collection-data) | Paginated, filterable, sortable document table |
| [`MongocampJobs`](/components/mongocamp-jobs) | Full CRUD table for scheduled background jobs |
| [`MongocampAccount`](/components/mongocamp-account) | Current-user account page: profile, password change, API key |
| [`MongocampVersion`](/components/mongocamp-version) | Server name/version badge |

`UTable` columns with custom cells (badges, icon buttons, actions) are built with `h()` + `resolveComponent()` rather than `<template>` slots — see the component source for the pattern if you're building your own tables against the same composables.
