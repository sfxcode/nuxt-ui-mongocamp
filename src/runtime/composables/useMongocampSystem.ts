import { useMongocampClientApi } from '#imports'
import type { DatabaseInfo } from '@sfxcode/nuxt-mongocamp-server'

const REQUEST_TIMEOUT_MS = 15000

// The generated API client has no built-in request timeout, so a hung server
// response leaves callers' promises pending forever (neither resolved nor
// rejected). Passing an AbortSignal via initOverrides bounds every call here
// so a dead endpoint surfaces as a rejected promise instead of an infinite hang.
function withTimeout(): RequestInit {
  return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
}

/**
 * Read-only wrapper for databaseApi. Deliberately scoped to databases only —
 * deleteDatabase is out of scope (cross-cutting, highly destructive), and
 * applicationApi (settings/configuration) is not wrapped here at all for now.
 */
export function useMongocampSystem() {
  const { databaseApi } = useMongocampClientApi()

  async function listDatabases(): Promise<string[]> {
    return databaseApi.listDatabases(withTimeout())
  }

  async function getDatabaseInfos(): Promise<DatabaseInfo[]> {
    return databaseApi.databaseInfos(withTimeout())
  }

  async function getDatabaseInfo(databaseName: string): Promise<DatabaseInfo> {
    return databaseApi.getDatabaseInfo({ databaseName }, withTimeout())
  }

  async function listCollectionsByDatabase(databaseName: string): Promise<string[]> {
    return databaseApi.listCollectionsByDatabase({ databaseName }, withTimeout())
  }

  return { listDatabases, getDatabaseInfos, getDatabaseInfo, listCollectionsByDatabase }
}
