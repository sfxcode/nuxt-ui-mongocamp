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
    paginationSize: 1000,
  },
})
