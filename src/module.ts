import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit'

// Module options TypeScript interface definition
export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-ui-mongocamp',
    configKey: 'nuxtUiMongocamp',
    compatibility: {
      nuxt: '>=3.16.0',
    },
  },
  // Default configuration options of the Nuxt module
  defaults: {},

  moduleDependencies: {
    '@nuxt/ui': {},
    '@sfxcode/nuxt-ui-formkit': {},
    '@sfxcode/nuxt-mongocamp-server': {
      defaults: {
        paginationSize: 500,
        refreshToken: true,
        tokenRefreshIntervall: 5000,
      },
    },
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addPlugin(resolver.resolve('./runtime/plugin'))
  },
})
