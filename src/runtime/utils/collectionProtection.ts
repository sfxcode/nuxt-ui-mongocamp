// A GridFS bucket is a `<name>.files` / `<name>.chunks` pair; neither half is managed on its own.
export const BUCKET_COLLECTION_SUFFIX = /\.(?:files|chunks)$/

export function isBucketMemberCollection(collectionName: string): boolean {
  return BUCKET_COLLECTION_SUFFIX.test(collectionName)
}

/** `fs` for `fs.files` / `fs.chunks`; `null` for a collection that is not half of a GridFS bucket. */
export function bucketNameOf(collectionName: string): string | null {
  return isBucketMemberCollection(collectionName) ? collectionName.replace(BUCKET_COLLECTION_SUFFIX, '') : null
}

// Collections that must never be offered for clear/drop: MongoCamp's own `mc_*` collections, and the
// halves of a GridFS bucket (those go through the bucket actions, which handle both).
export function isProtectedCollection(collectionName: string): boolean {
  return collectionName.startsWith('mc_') || isBucketMemberCollection(collectionName)
}
