import { watch } from 'vue'
import { defineNuxtPlugin, addRouteMiddleware, navigateTo, useAsyncData, useRuntimeConfig } from '#app'
import { useMongocampAuth, useMongocampClientApi, useMongocampStorage } from '#imports'
import { useMongocampRoles } from './composables/useMongocampRoles'
import { useMongocampSession } from './composables/useMongocampSession'
import { useMongocampConnection } from './composables/useMongocampConnection'
import { CONNECTION_CHECK_TIMEOUT_MS, CONNECTION_RETRY_MAX_MS, CONNECTION_RETRY_MS } from './utils/connection'
import { nextDelay } from './utils/autoRefresh'
import { createVerifyCache, runSessionGuard } from './utils/sessionGuard'

export default defineNuxtPlugin(async (_nuxtApp) => {
  const { systemApi } = useMongocampClientApi()

  const config = useRuntimeConfig()
  const useGlobalAuthMiddleware: boolean = config.public.nuxtUiMongocampOptions.useGlobalAuthMiddleware ?? false

  const useServerProxy: boolean = config.public.nuxtUiMongocampOptions.useServerProxy ?? false
  const sessionGuard: boolean = config.public.nuxtUiMongocampOptions.sessionGuard ?? false
  const offline: boolean = config.public.nuxtUiMongocampOptions.offline ?? false

  // Opt-in server check on top of the `exp` check. Client only: on the server the cache would have to live in
  // the request, and the first client navigation re-checks anyway.
  const sessionGuardVerify: boolean = (config.public.nuxtUiMongocampOptions.sessionGuardVerify ?? false) && import.meta.client
  const verifyCache = createVerifyCache(30_000)

  // With `offline`, the version must never hold up the app's start in the browser: it loads in the background, with a
  // timeout (a WLAN without internet can stall a request for minutes), and its outcome feeds the connection state.
  const { data: version } = offline && import.meta.client
    ? await useAsyncData('version', async () => {
        const connection = useMongocampConnection()
        try {
          const result = await systemApi.version({ signal: AbortSignal.timeout(CONNECTION_CHECK_TIMEOUT_MS) })
          connection.report()
          return result
        }
        catch (error) {
          connection.report(error)
          return null
        }
      }, { lazy: true, server: false })
    : await useAsyncData('version', () => systemApi.version())

  if (offline && import.meta.client) watchConnection()

  // Registered before `global-auth` so an expired session is already cleared when that middleware looks at
  // it. Fresh composable calls per navigation, for the same reason as in `global-auth` below. There is no
  // login to guard in server proxy mode.
  if (sessionGuard && !useServerProxy) {
    addRouteMiddleware('session-guard', async (to) => {
      const { checkExpiry, invalidateSession, verify } = useMongocampSession()
      const { loginPath } = useMongocampRoles()
      const outcome = await runSessionGuard({
        path: to.path,
        loginPath,
        checkExpiry,
        invalidate: invalidateSession,
        verify: sessionGuardVerify
          ? () => verifyCache(String(useMongocampStorage().value?.token ?? ''), verify)
          : undefined,
        // a fresh call: it must read the session as it is after the invalidation
        isAllowed: path => useMongocampRoles().isAllowedPathForRoute(path),
        // only asked when a session is about to be cleared, so it costs a request only for an expired token
        serverReachable: offline ? async () => await useMongocampConnection().check() === 'online' : undefined,
      })
      if (outcome === 'redirect') return navigateTo(loginPath)
    }, { global: true })
  }

  if (useGlobalAuthMiddleware) {
    addRouteMiddleware('global-auth', async (to) => {
      // Re-invoked fresh on every navigation, not hoisted to plugin setup — useCookie() creates
      // a brand-new ref per call that reads document.cookie synchronously, so calling
      // useMongocampRoles()/useMongocampAuth() here (rather than once at boot) is what makes the
      // middleware see a just-completed login immediately. A single boot-time instance would
      // otherwise depend on the BroadcastChannel Nuxt uses to sync sibling useCookie() refs
      // across composable calls, which is asynchronous and hadn't delivered its message yet by
      // the time a same-tick post-login navigateTo() ran its middleware check.
      const { logout } = useMongocampAuth()
      const { notAllowedPath, logoutRedirectPath, logoutPath, isAllowedPathForRoute } = useMongocampRoles()

      if (to.path === logoutPath) {
        await logout()
        return navigateTo(logoutRedirectPath)
      }
      if (!isAllowedPathForRoute(to.path)) {
        return navigateTo(notAllowedPath)
      }
    }, { global: true })
  }

  return {
    provide: {
      mongocampVersion: version,
    },

  }
})

// Module option `offline`: keeps useMongocampConnection() current in the browser. The browser's online/offline events
// switch it at once; while the server cannot be reached it is checked again with a growing delay; a tab that becomes
// visible is checked at once (a phone or tablet may have been asleep). No polling while online — an app reports its
// own failing requests through `report()`.
function watchConnection() {
  const connection = useMongocampConnection()
  let timer: ReturnType<typeof setTimeout> | undefined
  let failures = 0

  function schedule() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (connection.state.value !== 'unreachable') {
      failures = 0
      return
    }
    timer = setTimeout(async () => {
      timer = undefined
      failures++
      await connection.check()
      schedule()
    }, nextDelay(CONNECTION_RETRY_MS, failures, { maxMs: CONNECTION_RETRY_MAX_MS }))
  }

  async function checkNow() {
    await connection.check()
    schedule()
  }

  window.addEventListener('online', () => {
    void checkNow()
  })
  window.addEventListener('offline', () => {
    void connection.check()
    schedule()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !connection.isOnline.value) void checkNow()
  })
  // a request reported as failed by the app starts the retries as well
  watch(connection.state, () => schedule())
}
