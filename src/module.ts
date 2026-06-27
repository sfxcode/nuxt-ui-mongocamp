import { defineNuxtModule, addPlugin, addComponentsDir, createResolver, addImportsDir } from '@nuxt/kit'

// Module options TypeScript interface definition
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- public extension point; options are forwarded to dependencies
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
    'unocss-nuxt-ui': {},
    '@formkit/nuxt': {},
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
    const { resolve } = createResolver(import.meta.url)
    const runtimeDir = resolve('./runtime')

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addPlugin(resolve(runtimeDir, 'plugin'))

    addComponentsDir({ path: resolve(runtimeDir, 'components') })

    addImportsDir(resolve(runtimeDir, 'composables'))
  },
})
