import { useRuntimeConfig } from '#app'

/**
 * `true` when the module runs in server proxy mode (module option `useServerProxy`): there is no login and no profile, the
 * server-side api key decides what is allowed. A plain boolean — the option is fixed at build time.
 */
export function useMongocampProxyMode(): boolean {
  return useRuntimeConfig().public.nuxtUiMongocampOptions?.useServerProxy ?? false
}
