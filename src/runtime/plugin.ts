import { defineNuxtPlugin, addRouteMiddleware, navigateTo, useAsyncData } from '#app'
import { useMongocampStorage, useMongocampApi, useMongocampAuth } from '#imports'

export default defineNuxtPlugin(async (_nuxtApp) => {
  const { logout, isLoggedIn } = useMongocampAuth()
  const { informationApi } = useMongocampApi()
  const state = useMongocampStorage()

  const { data: version } = await useAsyncData('version', () => informationApi.version())

  addRouteMiddleware('global-auth', (to) => {
    if ((to.path.startsWith('/admin') || to.path.startsWith('/secured/admin')) && (!isLoggedIn.value || !state.value.profile.isAdmin)) {
      return navigateTo('/secured')
    }
    else if (to.path.startsWith('/secured') && !isLoggedIn.value) {
      return navigateTo('/')
    }
    else if (to.path === '/logout') {
      logout()
      return navigateTo('/')
    }
  }, { global: true })

  return {
    provide: {
      mongocampVersion: version,
    },

  }
})

