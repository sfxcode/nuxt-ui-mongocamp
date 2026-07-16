import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('ssr', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  it('renders the index page', async () => {
    // Get response to a server-rendered page with `$fetch`.
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })

  it('exposes the server-proxy defaults in public runtime config', async () => {
    const options = await $fetch<{ useServerProxy: boolean, serverProxyPath: string }>('/api/mongocamp-options')
    expect(options.useServerProxy).toBe(false)
    expect(options.serverProxyPath).toBe('/api/_mongocamp')
  })

  it('404s on the proxy route when useServerProxy is disabled (the default)', async () => {
    await expect($fetch('/api/_mongocamp/document/find')).rejects.toMatchObject({ statusCode: 404 })
  })
})
