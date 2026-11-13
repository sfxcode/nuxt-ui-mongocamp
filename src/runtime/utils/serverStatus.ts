// Pure part of MongocampServerStatus: one word for how the server is doing, from what the two requests answered.

export type ServerHealth = 'ok' | 'partial' | 'down'

/**
 * What one request did: it answered (`ok`), the server answered with an error (`refused` — no right, or a server older than
 * 1.9.0 without the route), nothing came back (`failed`), or it was not sent (`skipped` — not signed in, not allowed).
 */
export type Outcome = 'ok' | 'refused' | 'failed' | 'skipped'

/** An error that carries an HTTP response proves the server is there; anything else (network, timeout) does not. */
export function outcomeOfError(error: unknown): Outcome {
  const response = (error as { response?: { status?: unknown } } | null)?.response
  return typeof response?.status === 'number' ? 'refused' : 'failed'
}

/**
 * - `down`: nothing that was asked came back at all — or nothing could be asked and the server's version is unknown too.
 * - `partial`: the server is there but something is missing: a request failed or was refused, or the load came without its connection numbers (the database
 *   user lacks `clusterMonitor`).
 * - `ok`: everything that was asked answered.
 */
export function serverHealth(input: { info: Outcome, stats: Outcome, hasConnections: boolean, versionKnown: boolean }): ServerHealth {
  const asked = [input.info, input.stats].filter(outcome => outcome !== 'skipped')
  if (!asked.length) return input.versionKnown ? 'ok' : 'down'
  if (asked.every(outcome => outcome === 'failed')) return 'down'
  if (asked.some(outcome => outcome !== 'ok')) return 'partial'
  return input.stats === 'ok' && !input.hasConnections ? 'partial' : 'ok'
}
