import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useMongocampAutoRefresh } from '../src/runtime/composables/useMongocampAutoRefresh'

class FakeDocument extends EventTarget {
  hidden = false
  setHidden(value: boolean) {
    this.hidden = value
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

let doc: FakeDocument

beforeEach(() => {
  vi.useFakeTimers()
  doc = new FakeDocument()
  vi.stubGlobal('document', doc)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useMongocampAutoRefresh', () => {
  it('loads after each interval, not immediately', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const r = useMongocampAutoRefresh(load, { intervalMs: 5000 })
    r.start()
    expect(r.running.value).toBe(true)
    expect(load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).toHaveBeenCalledTimes(2)
    expect(r.lastRefreshed.value).toBeInstanceOf(Date)
    r.stop()
  })

  it('never overlaps: the wait starts after a slow load ended', async () => {
    let finish!: () => void
    const load = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const r = useMongocampAutoRefresh(load, { intervalMs: 1000 })
    r.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000) // the load is still running
    expect(load).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(999)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(2)
    r.stop()
  })

  it('backs off after failures, records the error and recovers', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValue(undefined)
    const r = useMongocampAutoRefresh(load, { intervalMs: 1000 })
    r.start()
    await vi.advanceTimersByTimeAsync(1000) // fails → next wait 2 s
    expect(load).toHaveBeenCalledTimes(1)
    expect((r.lastError.value as Error).message).toBe('a')
    await vi.advanceTimersByTimeAsync(1999)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1) // fails again → 4 s
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000)
    expect(load).toHaveBeenCalledTimes(3)
    expect(r.lastError.value).toBeNull()
    await vi.advanceTimersByTimeAsync(1000) // back to the plain interval
    expect(load).toHaveBeenCalledTimes(4)
    r.stop()
  })

  it('does not slow down with backoff off', async () => {
    const load = vi.fn().mockRejectedValue(new Error('x'))
    const r = useMongocampAutoRefresh(load, { intervalMs: 1000, backoff: false })
    r.start()
    await vi.advanceTimersByTimeAsync(3000)
    expect(load).toHaveBeenCalledTimes(3)
    r.stop()
  })

  it('pauses while the tab is hidden and loads once when it is shown again', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const r = useMongocampAutoRefresh(load, { intervalMs: 1000 })
    r.start()
    doc.setHidden(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load).not.toHaveBeenCalled()
    doc.setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(load).toHaveBeenCalledTimes(2)
    r.stop()
  })

  it('keeps going while hidden with pauseWhenHidden off', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    doc.hidden = true
    const r = useMongocampAutoRefresh(load, { intervalMs: 1000, pauseWhenHidden: false })
    r.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(load).toHaveBeenCalledTimes(2)
    r.stop()
  })

  it('stop cancels the timer and a load finishing afterwards does not schedule again', async () => {
    let finish!: () => void
    const load = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const r = useMongocampAutoRefresh(load, { intervalMs: 1000 })
    r.start()
    await vi.advanceTimersByTimeAsync(1000)
    r.stop()
    finish()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(load).toHaveBeenCalledTimes(1)
    expect(r.running.value).toBe(false)
    // and a restart works
    load.mockResolvedValue(undefined as never)
    r.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(load).toHaveBeenCalledTimes(2)
    r.stop()
  })

  it('start is idempotent and the interval may be a getter', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    let ms = 1000
    const r = useMongocampAutoRefresh(load, { intervalMs: () => ms })
    r.start()
    r.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(load).toHaveBeenCalledTimes(1)
    // the getter is read when a wait is scheduled, so the change applies from the wait after the one already running
    ms = 3000
    await vi.advanceTimersByTimeAsync(1000)
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2999)
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(3)
    r.stop()
  })

  it('refuses an interval below one second', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const r = useMongocampAutoRefresh(load, { intervalMs: 10 })
    r.start()
    await vi.advanceTimersByTimeAsync(999)
    expect(load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(1)
    r.stop()
  })

  it('refreshNow loads at once, shares a running load and restarts the wait', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const r = useMongocampAutoRefresh(load, { intervalMs: 5000 })
    r.start()
    await vi.advanceTimersByTimeAsync(4000)
    await Promise.all([r.refreshNow(), r.refreshNow()])
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4999)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(2)
    r.stop()
  })

  it('is cleaned up with its effect scope', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const scope = effectScope()
    const r = scope.run(() => useMongocampAutoRefresh(load, { intervalMs: 1000 }))!
    r.start()
    scope.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).not.toHaveBeenCalled()
    expect(r.running.value).toBe(false)
  })

  it('does nothing on the server (no document)', async () => {
    vi.unstubAllGlobals()
    const load = vi.fn().mockResolvedValue(undefined)
    const r = useMongocampAutoRefresh(load, { intervalMs: 1000 })
    r.start()
    await r.refreshNow()
    await vi.advanceTimersByTimeAsync(5000)
    expect(r.running.value).toBe(false)
    expect(load).not.toHaveBeenCalled()
  })
})
