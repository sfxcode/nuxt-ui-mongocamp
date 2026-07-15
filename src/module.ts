import { defineNuxtModule, addPlugin, addComponentsDir, createResolver, addImportsDir } from '@nuxt/kit'
import { defu } from 'defu'

// Module options TypeScript interface definition

export interface ModuleOptions {

  useGlobalAuthMiddleware?: boolean

  /**
   * Path the global auth middleware navigates to when a route is not allowed
   * (not logged in, or logged in without the required role) — e.g. '/login'.
   * Always treated as allowed by the middleware itself, so it can never cause a redirect loop.
   */
  notAllowedPath?: string

  /**
   * Roles with management access
   */
  managerRoles: string[]

  /**
   * Routes that can only be accessed if the user is logged in
   */
  securedRouteParts: string[]

  /**
   * Routes that can only be accessed by manager users
   */
  managementRouteParts: string[]

  /**
   * Routes that can only be accessed by admin users
   */
  adminRouteParts: string[]
}

export interface ModulePublicRuntimeConfig {
  nuxtUiMongocampOptions: ModuleOptions
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-ui-mongocamp',
    configKey: 'nuxtUiMongocamp',
    compatibility: {
      nuxt: '>=3.16.0',
    },
  },
  // Default configuration options of the Nuxt module
  defaults: {
    useGlobalAuthMiddleware: false,
    notAllowedPath: '/',
    managerRoles: [],
    securedRouteParts: [],
    managementRouteParts: [],
    adminRouteParts: [],
  },

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
  setup(options, nuxt) {
    // Expose the module options in the public runtime config.
    nuxt.options.runtimeConfig.public.nuxtUiMongocampOptions = defu(
      nuxt.options.runtimeConfig.public.nuxtUiMongocampOptions,
      options,
    )

    const { resolve } = createResolver(import.meta.url)
    const runtimeDir = resolve('./runtime')

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addPlugin(resolve(runtimeDir, 'plugin'))

    addComponentsDir({ path: resolve(runtimeDir, 'components') })

    addImportsDir(resolve(runtimeDir, 'composables'))
  },
})
