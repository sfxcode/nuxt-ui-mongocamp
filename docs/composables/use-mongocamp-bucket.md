# useMongocampBucket

Detection and file operations for GridFS bucket collections. Powers the upload/download support in [`MongocampCollectionData`](/components/mongocamp-collection-data).

```ts
const {
  isBucketCollection, // (collectionName: string) => boolean
  bucketNameFor,      // (collectionName: string) => string
  fileIdForRow,       // (collectionName: string, row: Record<string, unknown>) => string | undefined
  downloadingFileIds, // Ref<Set<string>>
  uploading,          // Ref<boolean>
  downloadFile,       // (collectionName: string, fileId: string) => Promise<void>
  uploadFile,         // (collectionName: string, file: File) => Promise<boolean>
} = useMongocampBucket()
```

## Background: a bucket is two collections

Uploading a file through a GridFS bucket (`fileApi.insertFile`) creates/uses two real Mongo collections: `<bucketName>.files` (one document per file, with `filename`/`length`/`metadata`) and `<bucketName>.chunks` (the binary chunks). Both appear in `collectionApi.listCollections()` like any other collection.

## Detecting and naming buckets

```ts
isBucketCollection('images.files')   // true
isBucketCollection('images.chunks')  // true
isBucketCollection('customers')      // false

bucketNameFor('images.files')        // 'images'
bucketNameFor('images.chunks')       // 'images'
```

## Resolving a file id from a row

Which field holds the file id depends on which half of the bucket you're looking at:

- On a `.files` row, the file id is the row's `_id`.
- On a `.chunks` row, the file id is the row's `files_id` (its own `_id` is the chunk id).

```ts
fileIdForRow('images.files', { _id: { $oid: 'abc123' } })          // 'abc123'
fileIdForRow('images.chunks', { files_id: 'abc123', _id: 'c1' })   // 'abc123'
```

Both `_id` and `files_id` may arrive as a plain string or as extended-JSON `{ $oid: '...' }` — `fileIdForRow` unwraps either shape.

## Downloading a file

```ts
await downloadFile('images.files', fileId)
```

Fetches `fileApi.getFileInformation` (for the real filename) and `fileApi.getFile` (the blob), then triggers a browser download. Falls back to the raw file id as the download name if no filename is known. Tracks in-flight downloads in `downloadingFileIds` (add a `:loading="downloadingFileIds.has(fileId)"` binding on your button) and shows an error toast on failure.

## Uploading a file

```ts
const success = await uploadFile('images.files', file) // file: File
if (success) await fetchDocuments() // refresh the table
```

Uploads via `fileApi.insertFile`, targeting the bucket regardless of whether `collectionName` was the `.files` or `.chunks` half. Tracks the in-flight upload in `uploading` and shows a success/error toast; returns `true`/`false` so the caller knows whether to refresh.
