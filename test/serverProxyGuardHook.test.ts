import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('server proxy mode with a rejecting guard hook', async () => {
  const receivedRequests: string[] = []
  let stubServer: Server
  let stubUrl = ''

  await new Promise<void>((resolveStubReady) => {
    stubServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      receivedRequests.push(req.url ?? '')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
    stubServer.listen(0, '127.0.0.1', () => {
      const address = stubServer.address()
      const port = typeof address === 'object' && address ? address.port : 0
      stubUrl = `http://127.0.0.1:${port}`
      resolveStubReady()
    })
  })

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
    nuxtConfig: {
      mongocamp: {
        url: stubUrl,
        apiKey: 'test-api-key-123',
      },
      nuxtUiMongocamp: {
        useServerProxy: true,
      },
      nitro: {
        plugins: [fileURLToPath(new URL('./fixtures/proxyGuardReject.plugin.ts', import.meta.url))],
      },
    },
  })

  afterAll(() => {
    stubServer.close()
  })

  it('rejects with the guard hook\'s error and never reaches the upstream server', async () => {
    receivedRequests.length = 0

    await expect($fetch('/api/_mongocamp/document/find')).rejects.toMatchObject({ statusCode: 401 })

    expect(receivedRequests).toHaveLength(0)
  })
})
