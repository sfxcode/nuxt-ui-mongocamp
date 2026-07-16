import { useRuntimeConfig } from '#app'
import { Configuration } from '@sfxcode/nuxt-mongocamp-server'
import { createProxyMongocampApis } from '../utils/createProxyMongocampApis'

// Client-side drop-in for the dependency's session-authenticated `useMongocampApi()`: same
// returned shape (`{ adminApi, documentApi, ... }`), but pointed at this module's local proxy
// route instead of the real MongoCamp URL — no token/api key needed here, since phase 2's
// server handler injects the api key server-side.
export function useMongocampProxyApi() {
  const config = useRuntimeConfig()
  const serverProxyPath = config.public.nuxtUiMongocampOptions.serverProxyPath ?? '/api/_mongocamp'
  const configuration = new Configuration({ basePath: serverProxyPath })
  return createProxyMongocampApis(configuration)
}
