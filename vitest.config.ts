import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/*.test.ts'],
        },
      },
      await defineVitestProject({
        test: {
          name: 'components',
          include: ['test/components/**/*.test.ts'],
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('./test/fixtures/basic', import.meta.url)),
              domEnvironment: 'happy-dom',
            },
          },
        },
      }),
      // Real-browser (Playwright) tests via @nuxt/test-utils/e2e's createPage — deliberately
      // NOT included in the default `pnpm test` run (package.json's "test" script explicitly
      // pins --project unit --project components so this one is never swept in automatically).
      // Playwright browsers aren't installed in CI; run via `pnpm run test:e2e:auth` locally
      // after a one-time `npx playwright install chromium`.
      {
        test: {
          name: 'e2e-auth',
          environment: 'node',
          include: ['test/e2e-auth/**/*.test.ts'],
        },
      },
    ],
  },
})
