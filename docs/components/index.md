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
| [`MongocampCollectionData`](/components/mongocamp-collection-data) | Paginated, filterable, sortable document table; edit sends only the changed fields |
| [`MongocampBucketFiles`](/components/mongocamp-bucket-files) | Paginated, filterable GridFS bucket file browser with upload (multi-file, drag and drop)/preview/download/delete/rename (JSON metadata editor) |
| [`MongocampJobs`](/components/mongocamp-jobs) | Full CRUD table for scheduled background jobs |
| [`MongocampAccount`](/components/mongocamp-account) | Current-user account page: profile, password change, API key |
| [`MongocampSettings`](/components/mongocamp-settings) | Read-only server settings: plugins and a searchable, paged configuration table with secrets masked (admins only); `hide*` props toggle its parts |
| [`MongocampDatabases`](/components/mongocamp-databases) | Read-only table of all databases (size, collection count) |
| [`MongocampVersion`](/components/mongocamp-version) | Server name/version badge |
| [`MongocampFilterBuilder`](/components/mongocamp-filter-builder) | Visual filter builder: type-aware conditions, match all/any, emits a Lucene query |
| [`MongocampBulkDelete`](/components/mongocamp-bulk-delete) | Selection bar + confirmation modal for bulk delete (used by Users, Roles, CollectionData) |
| [`MongocampBulkEdit`](/components/mongocamp-bulk-edit) | Dialog to set one field to one value on every selected document (used by CollectionData) |
| [`MongocampImport`](/components/mongocamp-import) | Dialog to import documents from a JSON or CSV file in batches (part of CollectionData's toolbar) |
| [`MongocampAggregationBuilder`](/components/mongocamp-aggregation-builder) | Build and run an aggregation pipeline (stage editor or JSON), page through and export the result |
| [`MongocampDashboard`](/components/mongocamp-dashboard) | Admin landing page: linked collection/user/role counts, server version, slot for extra content |
| [`MongocampGrantList`](/components/mongocamp-grant-list) | Read-only grants table (used by the user and role detail drawers) |
| [`MongocampCommandPalette`](/components/mongocamp-command-palette) | ⌘K "Go to…" palette for collections, buckets, users, roles, jobs and actions, permission-aware, lazy and cached |
| [`MongocampFilePreview`](/components/mongocamp-file-preview) | Drawer previewing a bucket file: image, PDF, JSON/CSV/text with size caps, otherwise metadata + download |
| [`MongocampConfirmByName`](/components/mongocamp-confirm-by-name) | Type-the-name confirmation modal for destructive actions (clear/drop collection, bucket clear/delete) |
| [`MongocampDocumentView`](/components/mongocamp-document-view) | Read-only typed tree / JSON view of one document with copy of path and value (opened from the data table's View button) |
| [`MongocampQueryBar`](/components/mongocamp-query-bar) | Filter + sort + fields to load + history and saved queries in one bar (used by the data table) |
| [`MongocampIndexes`](/components/mongocamp-indexes) | Indexes of a collection with size and usage, compound/unique/text/expiring create, typed drop (the info page's index card) |
| [`MongocampCollectionCharts`](/components/mongocamp-collection-charts) | Distribution of one field as a chart (top values, documents over time, number ranges) with Nuxt UI's `UChart` |
| [`MongocampChart`](/components/mongocamp-chart) | `UChart` with series-colour fallbacks, the UnoCSS visibility fix and a text/table alternative (the base of the module's charts) |
| [`MongocampServerOverview`](/components/mongocamp-server-overview) | Admin overview: totals, biggest collections (chart + ranked links), share of storage, databases, cluster, next jobs |
| [`MongocampPermissionMatrix`](/components/mongocamp-permission-matrix) | Read-only users × collections matrix of effective read/write/administrate rights from the roles' grants, with filters, quick views and CSV export |
| [`MongocampCollectionCopy`](/components/mongocamp-collection-copy) | Copy a collection into a new one, or a one-click timestamped backup (dialog; opened from the collection list) |
| [`MongocampExportAll`](/components/mongocamp-export-all) | Export every matching document as JSON/NDJSON/CSV with progress and cancel (dialog; opened from the data table's export menu) |
| [`MongocampErrorAlert`](/components/mongocamp-error-alert) | Failed-load banner with retry / log-in-again |
| [`MongocampEmptyState`](/components/mongocamp-empty-state) | Icon + message for empty tables |

`UTable` columns with custom cells (badges, icon buttons, actions) are built with `h()` + `resolveComponent()` rather than `<template>` slots — see the component source for the pattern if you're building your own tables against the same composables.
