# useMongocampDocument

Helpers for document-level operations.

```ts
const {
  ensureMetaData,    // <T extends { metaData?: Partial<MetaData> }>(data: T) => T
  updateFromPartial, // <T>(obj: T, updates: Partial<T>) => T
} = useMongocampDocument()
```

## `ensureMetaData`

Stamps a document with `createdBy` / `updatedBy` / `created` / `updated` from the currently logged-in user (via `useMongocampStorage()`):

- If `metaData.createdBy` is not already set, both `createdBy` and `updatedBy` are set to the current user, and `created`/`updated` are set to now.
- If it's already set (i.e. an existing document), `createdBy` and `created` are preserved, and only `updatedBy`/`updated` are refreshed.

```ts
const { ensureMetaData } = useMongocampDocument()

const stamped = ensureMetaData({ name: 'Acme Corp', metaData: existingDoc.metaData })
await documentApi.insert({ collectionName, requestBody: stamped })
```

## `updateFromPartial`

A plain shallow-merge helper: `{ ...obj, ...updates }`. Useful for building the request body of a partial update without mutating the original object.
