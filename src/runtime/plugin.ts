import { defineNuxtPlugin, addRouteMiddleware, navigateTo, useAsyncData, useRuntimeConfig } from '#app'
import { useMongocampAuth, useMongocampClientApi } from '#imports'
import { useMongocampRoles } from './composables/useMongocampRoles'

export default defineNuxtPlugin(async (_nuxtApp) => {
  const { logout } = useMongocampAuth()
  const { informationApi } = useMongocampClientApi()
  const { notAllowedPath, logoutRedirectPath, isAllowedPathForRoute } = useMongocampRoles()

  const config = useRuntimeConfig()
  const useGlobalAuthMiddleware: boolean = config.public.nuxtUiMongocampOptions.useGlobalAuthMiddleware ?? false

  const { data: version } = await useAsyncData('version', () => informationApi.version())

  if (useGlobalAuthMiddleware) {
    addRouteMiddleware('global-auth', (to) => {
      if (to.path === '/logout') {
        logout()
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
