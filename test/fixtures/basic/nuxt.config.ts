import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  // @sfxcode/nuxt-mongocamp-server >=1.5.0 throws during boot (even in tests) if `url` is
  // missing — this fixture never talks to a real MongoCamp server, so a dummy value is enough.
  mongocamp: {
    url: 'http://localhost:9999',
  },
})
