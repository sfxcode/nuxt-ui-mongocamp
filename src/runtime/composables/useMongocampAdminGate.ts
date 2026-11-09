import { useRuntimeConfig } from '#app'
import { useI18n, useMongocampStorage } from '#imports'
import { computed } from 'vue'

/**
 * For components that only make sense for an administrator (they call admin endpoints on mount): `blocked` is true when the
 * signed-in user is known **not** to be an administrator, so the component can show `message` ("administrators only")
 * **without sending a request** that the server must refuse. It is a UI hint, not a guard — the server stays the authority.
 *
 * Fail-open: server proxy mode (the api key's power decides), no profile yet, or a profile without an `isAdmin` flag are never
 * blocked.
 */
export function useMongocampAdminGate() {
  const config = useRuntimeConfig()
  const state = useMongocampStorage()
  const { t } = useI18n()
  const isProxyMode: boolean = config.public.nuxtUiMongocampOptions?.useServerProxy ?? false

  const blocked = computed(() => !isProxyMode && state.value?.profile?.isAdmin === false)
  const message = computed(() => t('nuxtUiMongocamp.common.adminOnly'))

  return { blocked, message }
}
