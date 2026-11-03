import { useRuntimeConfig } from '#app'
import { Configuration } from '@sfxcode/nuxt-mongocamp-server/api'
import { createProxyMongocampApis } from '../utils/createProxyMongocampApis'
import { permissionDeniedMiddleware } from '../utils/permissionDenied'

// Client-side drop-in for the dependency's session-authenticated `useMongocampApi()`: same
// returned shape (`{ adminApi, documentApi, ... }`), but pointed at this module's local proxy
// route instead of the real MongoCamp URL — no token/api key needed here, since phase 2's
// server handler injects the api key server-side.
export function useMongocampProxyApi() {
  const config = useRuntimeConfig()
  const serverProxyPath = config.public.nuxtUiMongocampOptions.serverProxyPath ?? '/api/_mongocamp'
  // no session to clear here, but the same 401 for a missing grant would read as "session expired"
  const configuration = new Configuration({ basePath: serverProxyPath, middleware: [permissionDeniedMiddleware] })
  return createProxyMongocampApis(configuration)
}
