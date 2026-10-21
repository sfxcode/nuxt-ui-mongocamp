import { defineNuxtPlugin, addRouteMiddleware, navigateTo, useAsyncData, useRuntimeConfig } from '#app'
import { useMongocampAuth, useMongocampClientApi } from '#imports'
import { useMongocampRoles } from './composables/useMongocampRoles'
import { useMongocampSession } from './composables/useMongocampSession'
import { runSessionGuard } from './utils/sessionGuard'

export default defineNuxtPlugin(async (_nuxtApp) => {
  const { informationApi } = useMongocampClientApi()

  const config = useRuntimeConfig()
  const useGlobalAuthMiddleware: boolean = config.public.nuxtUiMongocampOptions.useGlobalAuthMiddleware ?? false

  const useServerProxy: boolean = config.public.nuxtUiMongocampOptions.useServerProxy ?? false
  const sessionGuard: boolean = config.public.nuxtUiMongocampOptions.sessionGuard ?? false

  const { data: version } = await useAsyncData('version', () => informationApi.version())

  // Registered before `global-auth` so an expired session is already cleared when that middleware looks at
  // it. Fresh composable calls per navigation, for the same reason as in `global-auth` below. There is no
  // login to guard in server proxy mode.
  if (sessionGuard && !useServerProxy) {
    addRouteMiddleware('session-guard', async (to) => {
      const { checkExpiry, invalidateSession } = useMongocampSession()
      const { loginPath } = useMongocampRoles()
      const outcome = await runSessionGuard({
        path: to.path,
        loginPath,
        checkExpiry,
        invalidate: invalidateSession,
        // a fresh call: it must read the session as it is after the invalidation
        isAllowed: path => useMongocampRoles().isAllowedPathForRoute(path),
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
