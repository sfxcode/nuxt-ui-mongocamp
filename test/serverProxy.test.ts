import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('server proxy mode', async () => {
  const receivedRequests: Array<{ url: string, headers: IncomingMessage['headers'] }> = []
  let stubServer: Server
  let stubUrl = ''

  await new Promise<void>((resolveStubReady) => {
    stubServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      receivedRequests.push({ url: req.url ?? '', headers: req.headers })
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
    },
  })

  afterAll(() => {
    stubServer.close()
  })

  it('forwards to the upstream server with the api key injected, stripping any caller-supplied Authorization', async () => {
    receivedRequests.length = 0

    await $fetch('/api/_mongocamp/document/find?collection=users', {
      headers: { Authorization: 'Bearer forged-token' },
    })

    expect(receivedRequests).toHaveLength(1)
    const received = receivedRequests[0]
    if (!received) throw new Error('expected the stub upstream server to receive a request')
    expect(received.url).toBe('/document/find?collection=users')
    expect(received.headers['x-auth-apikey']).toBe('test-api-key-123')
    expect(received.headers.authorization).not.toBe('Bearer forged-token')
  })
})
