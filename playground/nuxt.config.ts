import NuxtUIMongocamp from '..'

export default defineNuxtConfig({
  modules: [
    NuxtUIMongocamp,
  ],
  ssr: false,
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  // Configured directly via the mongocamp module's own config key
  mongocamp: {
    url: process.env.MONGOCAMP_URL,
    paginationSize: 1000,
  },
})
