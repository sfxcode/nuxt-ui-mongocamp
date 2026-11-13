import { useMongocampClientApi } from '#imports'
import type { ClusterMemberInformation, DatabaseInfo } from '@sfxcode/nuxt-mongocamp-server'
import { buildConfigRows } from '../utils/configRows'
import type { ConfigRow } from '../utils/configRows'

const REQUEST_TIMEOUT_MS = 15000

// The generated API client has no built-in request timeout, so a hung server
// response leaves callers' promises pending forever (neither resolved nor
// rejected). Passing an AbortSignal via initOverrides bounds every call here
// so a dead endpoint surfaces as a rejected promise instead of an infinite hang.
function withTimeout(): RequestInit {
  return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
}

export interface ServerCluster {
  coordinator: ClusterMemberInformation
  members: ClusterMemberInformation[]
}

export interface ServerInfo {
  /** Version of the MongoDB server the MongoCamp server is connected to, e.g. `9.0.4`. */
  mongoDbVersion: string
  /** The same version as numbers (`[9, 0, 4, 0]`), empty if the server sent none. */
  mongoDbVersionArray: number[]
}

export interface ServerPlugins {
  routesPlugins: string[]
  filePlugins: string[]
  ignoredPlugins: string[]
}

/**
 * Read-only wrapper for databaseApi, applicationApi and the cluster view of systemApi. Deliberately read-only —
 * deleteDatabase, shutdown and updateConfiguration are out of scope (cross-cutting, highly
 * destructive) and not exposed. The server's settings and configuration payloads contain real secrets
 * (auth secret, database credentials and host), so the settings methods never hand them out:
 * `getSettings` returns the plugin lists only, and the configuration methods return rows that are
 * already masked (see utils/configRows.ts).
 */
export function useMongocampSystem() {
  const { databaseApi, applicationApi, systemApi } = useMongocampClientApi()

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

  // The response also repeats the whole configuration map, secrets included — dropped on purpose.
  async function getSettings(): Promise<ServerPlugins> {
    const settings = await applicationApi.settings(withTimeout())
    return {
      routesPlugins: settings.routesPlugins ?? [],
      filePlugins: settings.filePlugins ?? [],
      ignoredPlugins: settings.ignoredPlugins ?? [],
    }
  }

  async function listConfigurations(): Promise<ConfigRow[]> {
    return buildConfigRows(await applicationApi.listConfigurations(withTimeout()))
  }

  async function getConfig(configurationKey: string): Promise<ConfigRow> {
    const [row] = buildConfigRows([await applicationApi.getConfig({ configurationKey }, withTimeout())])
    if (!row) throw new Error(`The server returned no usable configuration for "${configurationKey}"`)
    return row
  }

  // `members` is optional in the API type; a node that lists none is still its own (only) member.
  async function getCluster(): Promise<ServerCluster> {
    const cluster = await systemApi.viewCluster(withTimeout())
    return { coordinator: cluster.coordinator, members: cluster.members?.length ? cluster.members : [cluster.coordinator] }
  }

  // `GET /system/info` (server 1.9.0, needs a login): the version of the MongoDB server behind MongoCamp.
  async function getServerInfo(): Promise<ServerInfo> {
    const info = await systemApi.systemInfo(withTimeout())
    return { mongoDbVersion: info.mongoDbVersion, mongoDbVersionArray: info.mongoDbVersionArray ?? [] }
  }

  return { getCluster, getServerInfo, listDatabases, getDatabaseInfos, getDatabaseInfo, listCollectionsByDatabase, getSettings, listConfigurations, getConfig }
}
