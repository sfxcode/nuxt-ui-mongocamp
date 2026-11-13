import { bucketNameOf, isBucketMemberCollection } from './collectionProtection'

export interface CollectionNameGroups {
  /** Ordinary collections: not MongoCamp's own, not half of a GridFS bucket. */
  collections: string[]
  /** GridFS bucket names (`images` for `images.files` / `images.chunks`), each once. */
  buckets: string[]
  /** MongoCamp's own `mc_*` collections. */
  system: string[]
}

/**
 * Splits a collection list the way every navigation shows it. Each group is sorted and free of duplicates; a `mc_*` name is
 * always `system`, also when it looks like a bucket half. A bucket is listed when either of its halves is present.
 */
export function groupCollectionNames(names: readonly string[]): CollectionNameGroups {
  const collections = new Set<string>()
  const buckets = new Set<string>()
  const system = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || !name) continue
    if (name.startsWith('mc_')) system.add(name)
    else if (isBucketMemberCollection(name)) buckets.add(bucketNameOf(name)!)
    else collections.add(name)
  }
  const sorted = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b))
  return { collections: sorted(collections), buckets: sorted(buckets), system: sorted(system) }
}
