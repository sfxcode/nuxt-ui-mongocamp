// A GridFS bucket is a `<name>.files` / `<name>.chunks` pair; neither half is managed on its own.
export const BUCKET_COLLECTION_SUFFIX = /\.(?:files|chunks)$/

export function isBucketMemberCollection(collectionName: string): boolean {
  return BUCKET_COLLECTION_SUFFIX.test(collectionName)
}

// Collections that must never be offered for clear/drop: MongoCamp's own `mc_*` collections, and the
// halves of a GridFS bucket (those go through the bucket actions, which handle both).
export function isProtectedCollection(collectionName: string): boolean {
  return collectionName.startsWith('mc_') || isBucketMemberCollection(collectionName)
}
