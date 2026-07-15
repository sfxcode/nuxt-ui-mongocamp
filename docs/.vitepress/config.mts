import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'nuxt-ui-mongocamp',
  description: 'A Nuxt module wrapping MongoCamp with ready-made UI components and composables',
  // Served from https://sfxcode.github.io/nuxt-ui-mongocamp/ as a GitHub Pages project site
  base: '/nuxt-ui-mongocamp/',

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Components', link: '/components/' },
      { text: 'Composables', link: '/composables/' },
      { text: 'GitHub', link: 'https://github.com/sfxcode/nuxt-ui-mongocamp' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Route Protection', link: '/guide/route-protection' },
          ],
        },
      ],
      '/components/': [
        {
          text: 'Components',
          items: [
            { text: 'Overview', link: '/components/' },
            { text: 'MongocampLogin', link: '/components/mongocamp-login' },
            { text: 'MongocampUsers', link: '/components/mongocamp-users' },
            { text: 'MongocampRoles', link: '/components/mongocamp-roles' },
            { text: 'MongocampRoleGrants', link: '/components/mongocamp-role-grants' },
            { text: 'MongocampCollections', link: '/components/mongocamp-collections' },
            { text: 'MongocampCollectionInfos', link: '/components/mongocamp-collection-infos' },
            { text: 'MongocampCollectionData', link: '/components/mongocamp-collection-data' },
            { text: 'MongocampJobs', link: '/components/mongocamp-jobs' },
            { text: 'MongocampAccount', link: '/components/mongocamp-account' },
            { text: 'MongocampDatabases', link: '/components/mongocamp-databases' },
            { text: 'MongocampVersion', link: '/components/mongocamp-version' },
          ],
        },
      ],
      '/composables/': [
        {
          text: 'Composables',
          items: [
            { text: 'Overview', link: '/composables/' },
            { text: 'useMongocampAdmin', link: '/composables/use-mongocamp-admin' },
            { text: 'useMongocampCollection', link: '/composables/use-mongocamp-collection' },
            { text: 'useMongocampDocument', link: '/composables/use-mongocamp-document' },
            { text: 'useMongocampSchema', link: '/composables/use-mongocamp-schema' },
            { text: 'useMongocampBucket', link: '/composables/use-mongocamp-bucket' },
            { text: 'useMongocampIndex', link: '/composables/use-mongocamp-index' },
            { text: 'useMongocampJobs', link: '/composables/use-mongocamp-jobs' },
            { text: 'useMongocampAccount', link: '/composables/use-mongocamp-account' },
            { text: 'useMongocampSystem', link: '/composables/use-mongocamp-system' },
            { text: 'useMongocampQuery', link: '/composables/use-mongocamp-query' },
            { text: 'useMongocampQueryBuilder', link: '/composables/use-mongocamp-query-builder' },
            { text: 'useMongocampExtendedJson', link: '/composables/use-mongocamp-extended-json' },
            { text: 'useMongocampRoles', link: '/composables/use-mongocamp-roles' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/sfxcode/nuxt-ui-mongocamp' },
      { icon: 'npm', link: 'https://npmjs.com/package/nuxt-ui-mongocamp' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © sfxcode',
    },
  },
})
