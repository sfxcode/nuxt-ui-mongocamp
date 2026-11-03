import { useRuntimeConfig } from '#app'
import { useMongocampApi } from '#imports'
import { installPermissionDeniedMiddleware } from '../utils/permissionDenied'
import { useMongocampProxyApi } from './useMongocampProxyApi'

// Drop-in for the dependency's `useMongocampApi()` that every other composable/component in
// this module should call instead: picks the browser-session client (the default) or this
// module's local-proxy client, based on the `useServerProxy` module option, so the same call
// sites work unmodified in either auth mode.
export function useMongocampClientApi() {
  const config = useRuntimeConfig()
  const useServerProxy = config.public.nuxtUiMongocampOptions?.useServerProxy ?? false
  // session mode: a missing grant answers 401, which the dependency would take for a dead session and log the user out
  // for; the middleware turns exactly that 401 into the 403 it should be (utils/permissionDenied.ts)
  return useServerProxy ? useMongocampProxyApi() : installPermissionDeniedMiddleware(useMongocampApi())
}
