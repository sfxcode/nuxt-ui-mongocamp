import { getCurrentScope, onScopeDispose, ref, toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { nextDelay } from '../utils/autoRefresh'
import type { BackoffOptions } from '../utils/autoRefresh'

export interface AutoRefreshOptions {
  /** Time between the end of one load and the start of the next (at least 1000; a ref or getter is read at every schedule). */
  intervalMs: MaybeRefOrGetter<number>
  /** Wait while the tab is hidden and load again as soon as it is shown (default true). */
  pauseWhenHidden?: boolean
  /** Slow down after failures (`false` = always the plain interval). Default: ×2 up to 5 minutes. */
  backoff?: BackoffOptions | false
}

export interface AutoRefresh {
  start: () => void
  stop: () => void
  /** Loads now (unless a load is running) and restarts the wait; works while stopped too, without starting the timer. */
  refreshNow: () => Promise<void>
  running: Ref<boolean>
  lastRefreshed: Ref<Date | null>
  /** The error of the latest load, cleared by the next success. */
  lastError: Ref<unknown>
}

/**
 * Calls `load` repeatedly while running. Loads never overlap (the next wait starts after the previous load ended), a
 * failing load backs the delay off and is reported in `lastError` instead of being thrown, a hidden tab pauses it, and it
 * stops with the component/effect scope that created it. It never runs on the server.
 */
export function useMongocampAutoRefresh(load: () => Promise<unknown> | unknown, options: AutoRefreshOptions): AutoRefresh {
  const running = ref(false)
  const lastRefreshed = ref<Date | null>(null)
  const lastError = ref<unknown>(null)
  const pauseWhenHidden = options.pauseWhenHidden ?? true
  const isBrowser = typeof document !== 'undefined'

  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined
  let failures = 0
  let generation = 0 // bumped by stop(): a load that finishes after it must not schedule again
  let listening = false

  const hidden = () => pauseWhenHidden && isBrowser && document.hidden
  const delay = () => nextDelay(toValue(options.intervalMs), failures, options.backoff)

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    clearTimer()
    if (!running.value || hidden()) return // a hidden tab is picked up again by `onVisibility`
    timer = setTimeout(() => void run(), delay())
  }

  function run(): Promise<void> {
    if (inFlight) return inFlight // never two loads at once
    clearTimer()
    const mine = generation
    inFlight = (async () => {
      try {
        await load()
        failures = 0
        lastError.value = null
        lastRefreshed.value = new Date()
      }
      catch (e) {
        failures++
        lastError.value = e
      }
      finally {
        inFlight = undefined
        if (mine === generation) schedule()
      }
    })()
    return inFlight
  }

  function onVisibility() {
    if (!running.value) return
    if (document.hidden) {
      if (pauseWhenHidden) clearTimer()
      return
    }
    // shown again: the data may be stale, so load now (the wait restarts after it)
    if (pauseWhenHidden && !inFlight) void run()
  }

  function start() {
    if (!isBrowser || running.value) return
    running.value = true
    failures = 0
    if (!listening) {
      document.addEventListener('visibilitychange', onVisibility)
      listening = true
    }
    schedule()
  }

  function stop() {
    generation++
    running.value = false
    clearTimer()
    if (listening && isBrowser) {
      document.removeEventListener('visibilitychange', onVisibility)
      listening = false
    }
  }

  async function refreshNow() {
    if (!isBrowser) return
    await run()
  }

  if (getCurrentScope()) onScopeDispose(stop)

  return { start, stop, refreshNow, running, lastRefreshed, lastError }
}
