// "Is the MongoCamp server up at all?" — the question that separates a dead session from a dead server.
// An expired or rejected token is answered with a 401 *without CORS headers*, so the browser reports it
// exactly like a network failure (see brain/project/mongocamp-session-behavior.md); an unauthenticated
// `GET /version` that works while authenticated calls fail points at the session.
//
// The request carries no credentials, at most one is in flight, and the last answer (success or not) is
// reused for a few seconds, so a burst of failing requests never turns into a burst of probes.

import { createThrottled } from './throttled'

export type ProbeResult = 'reachable' | 'unreachable' | 'skipped'

interface ServerProbeOptions {
  getUrl: () => string | undefined
  fetchFn?: typeof fetch
  now?: () => number
  cooldownMs?: number
  timeoutMs?: number
}

export function createServerProbe(options: ServerProbeOptions): () => Promise<ProbeResult> {
  const { getUrl, fetchFn = (...args) => fetch(...args), now, cooldownMs, timeoutMs = 5000 } = options

  async function ask(url: string): Promise<ProbeResult> {
    try {
      const response = await fetchFn(`${url.replace(/\/+$/, '')}/version`, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })
      // an HTTP error answer is a sick server, not proof of a dead session
      return response.ok ? 'reachable' : 'unreachable'
    }
    catch {
      return 'unreachable'
    }
  }

  let currentUrl = ''
  const throttled = createThrottled(() => ask(currentUrl), { now, cooldownMs })

  return function probe() {
    const url = getUrl()
    if (!url) return Promise.resolve('skipped')
    currentUrl = url
    return throttled()
  }
}
