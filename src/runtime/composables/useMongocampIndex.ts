import { useMongocampApi } from '#imports'
import type { IndexCreateResponse, IndexDropResponse, IndexOptionsRequest, MongoIndex } from '@sfxcode/nuxt-mongocamp-server'

export function useMongocampIndex() {
  const { indexApi } = useMongocampApi()

  async function listIndexes(collectionName: string): Promise<MongoIndex[]> {
    return indexApi.listIndices({ collectionName })
  }

  async function createIndex(collectionName: string, keys: Record<string, number>, options?: IndexOptionsRequest): Promise<IndexCreateResponse> {
    return indexApi.createIndex({ collectionName, indexCreateRequest: { keys, indexOptionsRequest: options } })
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

  return { listIndexes, createIndex, createUniqueIndex, createTextIndex, createExpiringIndex, deleteIndex }
}
