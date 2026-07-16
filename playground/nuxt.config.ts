import NuxtUIMongocamp from '..'

export default defineNuxtConfig({
  modules: [
    NuxtUIMongocamp,
  ],
  ssr: false,
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  vite: {
    optimizeDeps: {
      include: [
        '@formkit/addons',
        '@formkit/core',
        '@formkit/i18n',
        'nuxt > @nuxt/devtools > @vitejs/devtools-kit/client',
        'nuxt > @nuxt/devtools > @vitejs/devtools/client/inject',
        'nuxt > @nuxt/devtools > @vue/devtools-core',
        'nuxt > @nuxt/devtools > @vue/devtools-kit',
        'nuxt > @nuxt/devtools > error-stack-parser-es',
        'nuxt > @nuxt/devtools > vite-plugin-vue-tracer/client/overlay',
        'tailwindcss/colors',
      ],
    },
  },
  // Configured directly via the mongocamp module's own config key
  mongocamp: {
    url: process.env.MONGOCAMP_URL,
    // Optional — only needed to demo server proxy auth mode (MONGOCAMP_USE_SERVER_PROXY=true
    // below). Stored server-side only, never sent to the browser.
    apiKey: process.env.MONGOCAMP_API_KEY,
    paginationSize: 1000,
    tokenRefreshInterval: 60 * 1000,
  },
  nuxtUiMongocamp: {
    useGlobalAuthMiddleware: true,
    notAllowedPath: '/',
    managerRoles: ['manager'],
    securedRouteParts: ['/secured/**'],
    managementRouteParts: ['/secured/manager/**'],
    adminRouteParts: ['/secured/admin/**'],
    // Opt-in demo of server proxy auth mode — see docs/guide/server-proxy-auth.md and
    // server/plugins/mongocamp-proxy-guard.ts. Off by default so the playground's normal
    // login-based workflow above is unaffected.
    useServerProxy: process.env.MONGOCAMP_USE_SERVER_PROXY === 'true',
  },
})
