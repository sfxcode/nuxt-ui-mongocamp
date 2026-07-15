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
    ],
  },
})
