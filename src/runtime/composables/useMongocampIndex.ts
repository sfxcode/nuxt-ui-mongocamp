import { useMongocampClientApi } from '#imports'
import type { IndexCreateResponse, IndexDropResponse, IndexInfo, IndexOptionsRequest, MongoIndex } from '@sfxcode/nuxt-mongocamp-server'

const REQUEST_TIMEOUT_MS = 15000

// The generated client has no timeout; a hung server would leave a quick action spinning forever.
function withTimeout(): RequestInit {
  return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
}

export function useMongocampIndex() {
  const { indexApi } = useMongocampClientApi()

  async function listIndexes(collectionName: string): Promise<MongoIndex[]> {
    return indexApi.listIndices({ collectionName })
  }

  /**
   * The indexes with everything the server knows (`GET …/index/details`, server 1.8.1): the keys as an **ordered** array
   * `{ field, direction: '1' | '-1' | 'text' }`, `unique`, `sparse`, `hidden`, `weights`, `defaultLanguage`,
   * `expireAfterSeconds`, `collation`. (`partialFilterExpression` is listed but garbled by the server.)
   */
  async function listIndexDetails(collectionName: string): Promise<IndexInfo[]> {
    return indexApi.indexDetails({ collectionName }, withTimeout())
  }

  async function createIndex(collectionName: string, keys: Record<string, number>, options?: IndexOptionsRequest): Promise<IndexCreateResponse> {
    return indexApi.createIndex({ collectionName, indexCreateRequest: { keys, indexOptionsRequest: options } })
  }

  /**
   * Creates an index from **ordered** keys (compound order is kept; `direction` is `'1'`, `'-1'` or `'text'`, any other is a
   * 400) with the options of the newer servers: `unique`, `sparse`, `hidden`, `name`, `partialFilterExpression`, `weights`,
   * `defaultLanguage`, `collation`. A text index may span several fields. Sparse together with a partial filter is a 400.
   */
  async function createOrderedIndex(collectionName: string, orderedKeys: Array<{ field: string, direction: string }>, options?: IndexOptionsRequest): Promise<IndexCreateResponse> {
    return indexApi.createIndex({ collectionName, indexCreateRequest: { orderedKeys, indexOptionsRequest: options } })
  }

  // One call for a plain single-field index; a duplicate or incompatible existing index is refused by
  // the server and the error reaches the caller.
  async function createIndexForField(collectionName: string, fieldName: string, sortAscending: boolean = true): Promise<IndexCreateResponse> {
    return indexApi.createIndexForField({ collectionName, fieldName, sortAscending }, withTimeout())
  }

  async function createUniqueIndex(collectionName: string, fieldName: string, sortAscending?: boolean): Promise<IndexCreateResponse> {
    return indexApi.createUniqueIndex({ collectionName, fieldName, sortAscending })
  }

  async function createTextIndex(collectionName: string, fieldName: string): Promise<IndexCreateResponse> {
    return indexApi.createTextIndex({ collectionName, fieldName })
  }

  async function createExpiringIndex(collectionName: string, fieldName: string, duration: string): Promise<IndexCreateResponse> {
    return indexApi.createExpiringIndex({ collectionName, fieldName, duration })
  }

  async function deleteIndex(collectionName: string, indexName: string): Promise<IndexDropResponse> {
    return indexApi.deleteIndex({ collectionName, indexName })
  }

  return { listIndexes, listIndexDetails, createIndex, createOrderedIndex, createIndexForField, createUniqueIndex, createTextIndex, createExpiringIndex, deleteIndex }
}
