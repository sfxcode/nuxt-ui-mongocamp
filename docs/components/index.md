# Components

All components are auto-imported — no manual import needed once the module is registered.

| Component | Purpose |
|---|---|
| [`MongocampLogin`](/components/mongocamp-login) | FormKit schema-driven login form |
| [`MongocampUsers`](/components/mongocamp-users) | Full CRUD table for users |
| [`MongocampRoles`](/components/mongocamp-roles) | Full CRUD table for roles |
| [`MongocampRoleGrants`](/components/mongocamp-role-grants) | Per-role collection grant management |
| [`MongocampCollections`](/components/mongocamp-collections) | Table of all collections, with links to info/data pages |
| [`MongocampCollectionInfos`](/components/mongocamp-collection-infos) | Stat cards + inferred schema (and the server's JSON schema) for one collection |
| [`MongocampCollectionData`](/components/mongocamp-collection-data) | Paginated, filterable, sortable document table |
| [`MongocampBucketFiles`](/components/mongocamp-bucket-files) | Paginated, filterable GridFS bucket file browser with upload/download/delete/rename |
| [`MongocampJobs`](/components/mongocamp-jobs) | Full CRUD table for scheduled background jobs |
| [`MongocampAccount`](/components/mongocamp-account) | Current-user account page: profile, password change, API key |
| [`MongocampDatabases`](/components/mongocamp-databases) | Read-only table of all databases (size, collection count) |
| [`MongocampVersion`](/components/mongocamp-version) | Server name/version badge |
| [`MongocampFilterBuilder`](/components/mongocamp-filter-builder) | Visual filter builder: type-aware conditions, match all/any, emits a Lucene query |
| [`MongocampBulkDelete`](/components/mongocamp-bulk-delete) | Selection bar + confirmation modal for bulk delete (used by Users, Roles, CollectionData) |
| [`MongocampBulkEdit`](/components/mongocamp-bulk-edit) | Dialog to set one field to one value on every selected document (used by CollectionData) |
| [`MongocampImport`](/components/mongocamp-import) | Dialog to import documents from a JSON or CSV file in batches (part of CollectionData's toolbar) |
| [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder) | Build and run an aggregation pipeline (stage editor or JSON), page through and export the result |
| [`MongocampDashboard`](/components/mongocamp-dashboard) | Admin landing page: linked collection/user/role counts, server version, slot for extra content |
| [`MongocampGrantList`](/components/mongocamp-grant-list) | Read-only grants table (used by the user and role detail drawers) |
| [`MongocampConfirmByName`](/components/mongocamp-confirm-by-name) | Type-the-name confirmation modal for destructive actions (clear/drop collection, bucket clear/delete) |
| [`MongocampErrorAlert`](/components/mongocamp-error-alert) | Failed-load banner with retry / log-in-again |
| [`MongocampEmptyState`](/components/mongocamp-empty-state) | Icon + message for empty tables |

`UTable` columns with custom cells (badges, icon buttons, actions) are built with `h()` + `resolveComponent()` rather than `<template>` slots — see the component source for the pattern if you're building your own tables against the same composables.
