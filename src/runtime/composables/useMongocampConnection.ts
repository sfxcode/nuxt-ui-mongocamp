import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useState } from '#app'
import { useMongocampClientApi } from '#imports'
import { CONNECTION_CHECK_TIMEOUT_MS, initialConnectionState, isNetworkFailure, nextConnectionState } from '../utils/connection'
import type { ConnectionEvent, ConnectionState } from '../utils/connection'

export interface MongocampConnection {
  /** `online`, `offline` (no network at all) or `unreachable` (network, but the server does not answer). */
  state: Ref<ConnectionState>
  /** Shorthand for `state === 'online'`. */
  isOnline: ComputedRef<boolean>
  /** When the server last answered a check or a reported request. */
  lastAnswer: Ref<string | null>
  /** Asks the server now (`GET /version`, with a short timeout) and returns the new state. */
  check: () => Promise<ConnectionState>
  /**
   * Feeds the outcome of an app's own request into the state, so a failing request switches to `unreachable` at once
   * instead of waiting for the next check: pass nothing after a success, or the caught error after a failure. An error
   * with an HTTP status (401, 404, 500, ...) still proves the server answered. Returns whether it was a network failure.
   */
  report: (error?: unknown) => boolean
}

/**
 * Whether the MongoCamp server can be reached right now. One shared state per app. With the module option `offline`,
 * the plugin keeps it current (browser online/offline events, a retry with backoff while unreachable, a check when the
 * tab becomes visible) and the session guard keeps the session while it is not `online`. Without that option the state
 * still works but only changes through `check()` and `report()`.
 */
export function useMongocampConnection(): MongocampConnection {
  const state = useState<ConnectionState>('mongocamp.connection.state', () =>
    initialConnectionState(typeof navigator === 'undefined' ? undefined : navigator.onLine))
  const lastAnswer = useState<string | null>('mongocamp.connection.lastAnswer', () => null)
  // resolved here, inside the Nuxt context: `check()` also runs later from browser events and timers
  const { systemApi } = useMongocampClientApi()

  function apply(event: ConnectionEvent) {
    state.value = nextConnectionState(state.value, event)
    if (event === 'server-answered') lastAnswer.value = new Date().toISOString()
  }

  function report(error?: unknown): boolean {
    const failed = error !== undefined && isNetworkFailure(error)
    apply(failed ? 'network-failure' : 'server-answered')
    return failed
  }

  async function check(): Promise<ConnectionState> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      apply('browser-offline')
      return state.value
    }
    // the browser has a network (again): leave `offline` before asking, or a failed check would keep the browser's
    // stale verdict and the retries — which only run while `unreachable` — would never start
    apply('browser-online')
    try {
      await systemApi.version({ signal: AbortSignal.timeout(CONNECTION_CHECK_TIMEOUT_MS) })
      report()
    }
    catch (error) {
      report(error)
    }
    return state.value
  }

  return { state, isOnline: computed(() => state.value === 'online'), lastAnswer, check, report }
}
