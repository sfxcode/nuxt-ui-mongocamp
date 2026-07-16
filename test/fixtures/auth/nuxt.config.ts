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
  nuxtUiMongocamp: {
    useGlobalAuthMiddleware: true,
    // Distinctive and NOT '/' — using the default would make it impossible to tell whether
    // this option is actually being read versus just falling back to its default.
    notAllowedPath: '/login',
    // Mirrors notAllowedPath here since this fixture models an app gated entirely behind
    // login — logout should land back on the login page, not the (unrelated) default '/'.
    logoutRedirectPath: '/login',
    managerRoles: ['support'],
    // '/login' is deliberately also listed here — notAllowedPath must stay reachable even when
    // it overlaps a configured pattern (phase 7's guarantee test); without this, that test
    // would pass vacuously since nothing would otherwise block /login anyway.
    securedRouteParts: ['/secured/**', '/login'],
    managementRouteParts: ['/secured/manage/**'],
    // Deliberately also covered by securedRouteParts above — mirrors real-world layering and
    // is what phase 6's "secured check runs first" ordering test exercises.
    adminRouteParts: ['/secured/admin/**'],
  },
})
