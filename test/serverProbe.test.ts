import { describe, it, expect, vi } from 'vitest'
import { createServerProbe } from '../src/runtime/utils/serverProbe'

function setup(options: { url?: string | undefined, response?: () => Promise<Response> } = {}) {
  let nowMs = 1_000_000
  const fetchFn = vi.fn(options.response ?? (() => Promise.resolve(new Response('{}', { status: 200 }))))
  const probe = createServerProbe({
    getUrl: () => ('url' in options ? options.url : 'https://mc.example.com/'),
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => nowMs,
    cooldownMs: 5000,
    timeoutMs: 5000,
  })
  function advance(ms: number) {
    nowMs += ms
  }
  return { probe, fetchFn, advance }
}

describe('createServerProbe', () => {
  it('asks GET <url>/version with no credentials and no custom headers', async () => {
    const { probe, fetchFn } = setup()

    await probe()

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://mc.example.com/version')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('omit')
    expect(init.headers).toBeUndefined()
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('is reachable on a successful answer', async () => {
    expect(await setup().probe()).toBe('reachable')
  })

  it('is unreachable when the request fails (server down, DNS, blocked)', async () => {
    const { probe } = setup({ response: () => Promise.reject(new TypeError('Failed to fetch')) })

    expect(await probe()).toBe('unreachable')
  })

  it('is unreachable on an HTTP error answer — a sick server must not look like a dead session', async () => {
    const { probe } = setup({ response: () => Promise.resolve(new Response('', { status: 503 })) })

    expect(await probe()).toBe('unreachable')
  })

  it('is skipped (no request) when there is no URL to ask', async () => {
    const { probe, fetchFn } = setup({ url: undefined })

    expect(await probe()).toBe('skipped')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('shares one request between concurrent callers', async () => {
    let resolve!: (r: Response) => void
    function pending() {
      return new Promise<Response>((r) => {
        resolve = r
      })
    }
    const { probe, fetchFn } = setup({ response: pending })

    const first = probe()
    const second = probe()
    const third = probe()
    resolve(new Response('{}', { status: 200 }))

    expect(await Promise.all([first, second, third])).toEqual(['reachable', 'reachable', 'reachable'])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('answers from the last result during the cooldown, then asks again', async () => {
    const { probe, fetchFn, advance } = setup()

    await probe()
    advance(4999)
    await probe()
    expect(fetchFn).toHaveBeenCalledTimes(1)

    advance(1)
    await probe()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('reuses a failed result during the cooldown too (a burst of failures must not hammer the server)', async () => {
    const { probe, fetchFn } = setup({ response: () => Promise.reject(new TypeError('down')) })

    await probe()
    await probe()
    await probe()

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('recovers: asks again after the cooldown and can turn reachable', async () => {
    let up = false
    const { probe, advance } = setup({ response: () => (up ? Promise.resolve(new Response('{}')) : Promise.reject(new TypeError('down'))) })

    expect(await probe()).toBe('unreachable')
    up = true
    advance(5000)

    expect(await probe()).toBe('reachable')
  })

  it('does not stay stuck in flight after a failure', async () => {
    const { probe, fetchFn, advance } = setup({ response: () => Promise.reject(new TypeError('down')) })

    await probe()
    advance(5000)
    await probe()

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('tolerates a URL without or with several trailing slashes', async () => {
    for (const url of ['https://mc.example.com', 'https://mc.example.com///']) {
      const { probe, fetchFn } = setup({ url })
      await probe()
      expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('https://mc.example.com/version')
    }
  })
})
