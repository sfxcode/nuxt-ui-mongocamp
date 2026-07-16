import { defineNuxtModule, addPlugin, addComponentsDir, createResolver, addImportsDir, addServerHandler } from '@nuxt/kit'
import { defu } from 'defu'
import { consola } from 'consola'

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
   * Path the global auth middleware navigates to after `/logout` — e.g. '/goodbye'.
   * Always treated as allowed by the middleware itself, so it can never cause a redirect loop.
   */
  logoutRedirectPath?: string

  /**
   * Path that triggers logout when navigated to — e.g. '/signout'. Always treated as allowed
   * by the middleware itself, so it can never cause a redirect loop.
   */
  logoutPath?: string

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

  /**
   * Opt-in "server proxy" auth mode: the browser calls a local Nuxt server
   * route instead of MongoCamp directly, which forwards the request with
   * the MongoCamp api key (the dependency's own `mongocamp.apiKey` option)
   * injected server-side. There is no login/session in this mode, so it is
   * not meant to be combined with `useGlobalAuthMiddleware`'s route protection.
   */
  useServerProxy?: boolean

  /**
   * Local route prefix the proxy listens on when `useServerProxy` is enabled.
   */
  serverProxyPath?: string
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
    logoutRedirectPath: '/',
    logoutPath: '/logout',
    managerRoles: [],
    securedRouteParts: [],
    managementRouteParts: [],
    adminRouteParts: [],
    useServerProxy: false,
    serverProxyPath: '/api/_mongocamp',
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
        tokenRefreshInterval: 5000,
      },
    },
  },
  setup(options, nuxt) {
    // Normalized once here so the build-time route registered below and the runtime-config
    // value the handler reads at request time can never desync over a trailing slash.
    options.serverProxyPath = (options.serverProxyPath ?? '/api/_mongocamp').replace(/\/+$/, '') || '/api/_mongocamp'

    // Expose the module options in the public runtime config.
    nuxt.options.runtimeConfig.public.nuxtUiMongocampOptions = defu(
      nuxt.options.runtimeConfig.public.nuxtUiMongocampOptions,
      options,
    )

    if (options.useServerProxy && options.useGlobalAuthMiddleware) {
      consola.warn(
        '[nuxt-ui-mongocamp] `useServerProxy` and `useGlobalAuthMiddleware` are both enabled. '
        + 'Server proxy mode has no login/session, so `isLoggedIn`/`isAdmin`/`isManager` can never '
        + 'become true — every route matched by `securedRouteParts`, `managementRouteParts`, or '
        + '`adminRouteParts` will be permanently unreachable.',
      )
    }

    const { resolve } = createResolver(import.meta.url)
    const runtimeDir = resolve('./runtime')

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addPlugin(resolve(runtimeDir, 'plugin'))

    addComponentsDir({ path: resolve(runtimeDir, 'components') })

    addImportsDir(resolve(runtimeDir, 'composables'))

    // Registered unconditionally, same as the global-auth middleware: the handler itself
    // reads `useServerProxy` at request time and 404s when the option is off.
    addServerHandler({
      route: `${options.serverProxyPath}/**`,
      handler: resolve(runtimeDir, 'server/handlers/mongocampProxy'),
    })
  },
})
