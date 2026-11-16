// Rules of useMongocampConnection (module option `offline`), kept pure so they can be tested without a browser.

/**
 * - `online`: the MongoCamp server answered recently.
 * - `offline`: the browser itself reports no network.
 * - `unreachable`: the browser has a network, but the server does not answer (e.g. a WLAN without internet, or the
 *   server is down). Also the state right after the browser reports a network again, until a check succeeds.
 */
export type ConnectionState = 'online' | 'offline' | 'unreachable'

// browser-online / browser-offline: the browser's own network events.
// server-answered: a request or check got an answer from the server, whatever its HTTP status.
// network-failure: a request or check failed without an answer (network error, timeout).
export type ConnectionEvent = 'browser-online' | 'browser-offline' | 'server-answered' | 'network-failure'

/** First wait between checks while the server cannot be reached; it doubles per failed check up to the ceiling. */
export const CONNECTION_RETRY_MS = 5000
export const CONNECTION_RETRY_MAX_MS = 60_000
/** A check that takes longer than this counts as failed (a WLAN without internet can stall a request for minutes). */
export const CONNECTION_CHECK_TIMEOUT_MS = 5000

export function nextConnectionState(current: ConnectionState, event: ConnectionEvent): ConnectionState {
  switch (event) {
    case 'browser-offline':
      return 'offline'
    case 'browser-online':
      // the network is back, the server is not proven yet
      return current === 'online' ? 'online' : 'unreachable'
    case 'server-answered':
      return 'online'
    case 'network-failure':
      // without a network the browser's own verdict stays the more precise one
      return current === 'offline' ? 'offline' : 'unreachable'
  }
}

/** The state to start with, from the browser's own flag (`navigator.onLine`); `undefined` (server side) counts as online. */
export function initialConnectionState(browserOnline: boolean | undefined): ConnectionState {
  return browserOnline === false ? 'offline' : 'online'
}

function statusOf(error: Record<string, unknown>): unknown {
  const response = error.response
  const responseStatus = typeof response === 'object' && response !== null ? (response as Record<string, unknown>).status : undefined
  return error.status ?? error.statusCode ?? responseStatus
}

/**
 * True when a request failed without any answer from the server: a network error, a timeout or an abort. An error that
 * carries an HTTP status (401, 404, 500, ...) is an answer and therefore never a network failure — the server was there.
 * Covers the generated MongoCamp client (`FetchError` with a `cause`, `ResponseError` with a `response`), ofetch/`$fetch`
 * (`FetchError` with `statusCode` only when the server answered), plain `fetch` (`TypeError`) and `AbortSignal.timeout`.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as Record<string, unknown>
  if (statusOf(e) !== undefined) return false
  if (e.name === 'AbortError' || e.name === 'TimeoutError' || e.name === 'FetchError') return true
  if (error instanceof TypeError) return true
  // a wrapper around one of the above
  return e.cause !== undefined && e.cause !== error && isNetworkFailure(e.cause)
}
