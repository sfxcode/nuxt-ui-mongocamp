import {
  AdminApi,
  ApplicationApi,
  AuthApi,
  BucketApi,
  CollectionApi,
  DatabaseApi,
  DocumentApi,
  FileApi,
  IndexApi,
  InformationApi,
  JobsApi,
} from '@sfxcode/nuxt-mongocamp-server/api'
import type { Configuration } from '@sfxcode/nuxt-mongocamp-server/api'

// This module's own equivalent of the dependency's private `createMongocampApis` — that
// helper isn't part of the dependency's public export surface (only `.` and `./api` are
// exported), so the 11 API classes are constructed here directly instead. Import from the
// `./api` subpath specifically, not the package root (`.`) — the root resolves to the Nuxt
// module definition file (`defineNuxtModule`, pulling in `@nuxt/kit` and other build-time-only
// code), which Nuxt's client-bundle guard ("impound") replaces with an empty stub, breaking
// this file's imports at runtime with "does not provide an export named 'AdminApi'".
export function createProxyMongocampApis(configuration: Configuration) {
  return {
    adminApi: new AdminApi(configuration),
    applicationApi: new ApplicationApi(configuration),
    authApi: new AuthApi(configuration),
    bucketApi: new BucketApi(configuration),
    collectionApi: new CollectionApi(configuration),
    databaseApi: new DatabaseApi(configuration),
    documentApi: new DocumentApi(configuration),
    fileApi: new FileApi(configuration),
    indexApi: new IndexApi(configuration),
    informationApi: new InformationApi(configuration),
    jobApi: new JobsApi(configuration),
  }
}
