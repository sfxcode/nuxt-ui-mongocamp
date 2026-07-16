import { useRuntimeConfig } from '#app'
import { useMongocampApi } from '#imports'
import { useMongocampProxyApi } from './useMongocampProxyApi'

// Drop-in for the dependency's `useMongocampApi()` that every other composable/component in
// this module should call instead: picks the browser-session client (the default) or this
// module's local-proxy client, based on the `useServerProxy` module option, so the same call
// sites work unmodified in either auth mode.
export function useMongocampClientApi() {
  const config = useRuntimeConfig()
  const useServerProxy = config.public.nuxtUiMongocampOptions?.useServerProxy ?? false
  return useServerProxy ? useMongocampProxyApi() : useMongocampApi()
}
