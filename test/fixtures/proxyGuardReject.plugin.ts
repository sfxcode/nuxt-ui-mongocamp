import type { H3Event } from 'h3'
import { createError } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'

// Test-only stand-in for a consumer's own `server/plugins/*.ts` guard — always rejects, to
// prove the proxy handler actually awaits and propagates the hook's error before forwarding.
interface MongocampProxyHooks {
  hook: (name: 'mongocamp-proxy:authorize', fn: (event: H3Event) => void | Promise<void>) => void
}

export default defineNitroPlugin((nitroApp) => {
  const hooks = nitroApp.hooks as unknown as MongocampProxyHooks
  hooks.hook('mongocamp-proxy:authorize', () => {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  })
})
