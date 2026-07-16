import type { H3Event } from 'h3'

// Working example of the `mongocamp-proxy:authorize` guard hook from the "Server Proxy Auth"
// guide — only active when MONGOCAMP_PROXY_SHARED_SECRET is set, so the playground's default
// (login-based) workflow is unaffected when server proxy mode isn't being demoed.
//
// `NitroApp['hooks']` doesn't know about this module's hook name, so it's reached through a
// small local interface instead of an `any` cast.
interface MongocampProxyHooks {
  hook: (name: 'mongocamp-proxy:authorize', fn: (event: H3Event) => void | Promise<void>) => void
}

export default defineNitroPlugin((nitroApp) => {
  const sharedSecret = process.env.MONGOCAMP_PROXY_SHARED_SECRET
  if (!sharedSecret) return

  const hooks = nitroApp.hooks as unknown as MongocampProxyHooks
  hooks.hook('mongocamp-proxy:authorize', (event) => {
    if (getHeader(event, 'x-mongocamp-proxy-secret') !== sharedSecret) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  })
})
