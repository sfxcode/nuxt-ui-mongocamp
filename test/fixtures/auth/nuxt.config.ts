import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  nuxtUiMongocamp: {
    useGlobalAuthMiddleware: true,
    // Distinctive and NOT '/' — using the default would make it impossible to tell whether
    // this option is actually being read versus just falling back to its default.
    notAllowedPath: '/login',
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
