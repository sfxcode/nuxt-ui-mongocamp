---
layout: home

hero:
  name: nuxt-ui-mongocamp
  text: MongoCamp UI for Nuxt
  tagline: Ready-made components, composables, and route protection on top of @sfxcode/nuxt-mongocamp-server, built with Nuxt UI and FormKit.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Components
      link: /components/
    - theme: alt
      text: View on GitHub
      link: https://github.com/sfxcode/nuxt-ui-mongocamp

features:
  - icon: 🔐
    title: Auth out of the box
    details: Global route middleware protects /secured/** (login required) and /admin/** (admin role required) — no extra setup.
  - icon: 🧩
    title: Ready-made components
    details: Login form, user/role management tables, grant management, and a full collection browser with stats, schema, and a paginated data table.
  - icon: 🗂️
    title: Schema inferred from real data
    details: Column types (including nested objects and arrays) are inferred by sampling documents — with one click to copy a matching TypeScript interface.
  - icon: 📦
    title: GridFS bucket support
    details: Browse .files/.chunks collections with per-row download and bucket upload built in.
  - icon: 🔍
    title: Lucene query helpers
    details: useMongocampQuery and useMongocampQueryBuilder give you type-safe helpers for building MongoCamp filter expressions.
  - icon: ⚡
    title: Zero extra config
    details: Peer modules (@nuxt/ui, @formkit/nuxt, unocss-nuxt-ui, @sfxcode/nuxt-ui-formkit) are declared as moduleDependencies and set up automatically.
---
