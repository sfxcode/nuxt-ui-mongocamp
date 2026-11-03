import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_MAX_ROWS, DEFAULT_PAGE_SIZE, fetchAllPages } from '../src/runtime/utils/pagedFetch'
import type { PageResult } from '../src/runtime/utils/pagedFetch'

// a fake list of `n` numbered rows served page by page, like the server does (page ≥ 1, `rowsPerPage` = pageSize)
function listOf(n: number, options: { reportTotal?: boolean, serverMax?: number } = {}) {
  const { reportTotal = true, serverMax } = options
  const calls: [number, number][] = []
  const fetchPage = vi.fn(async (page: number, pageSize: number): Promise<PageResult<number>> => {
    calls.push([page, pageSize])
    const size = serverMax ? Math.min(pageSize, serverMax) : pageSize
    const rows = Array.from({ length: Math.max(0, Math.min(size, n - (page - 1) * size)) }, (_, i) => (page - 1) * size + i)
    return reportTotal ? { rows, total: n } : { rows }
  })
  return { fetchPage, calls }
}

describe('fetchAllPages', () => {
  it('reads every page in order and reports the totals', async () => {
    const { fetchPage, calls } = listOf(25)

    const result = await fetchAllPages(fetchPage, { pageSize: 10 })

    expect(result.rows).toEqual(Array.from({ length: 25 }, (_, i) => i))
    expect(calls).toEqual([[1, 10], [2, 10], [3, 10]])
    expect(result).toMatchObject({ total: 25, truncated: false, totalChanged: false, duplicates: 0, pages: 3 })
  })

  it('does not ask for a page beyond the reported total', async () => {
    const { fetchPage } = listOf(20)

    const result = await fetchAllPages(fetchPage, { pageSize: 10 })

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(result.rows).toHaveLength(20)
  })

  it('returns no rows for an empty list after one request', async () => {
    const { fetchPage } = listOf(0)

    expect(await fetchAllPages(fetchPage, { pageSize: 10 })).toMatchObject({ rows: [], total: 0, truncated: false, pages: 1 })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('defaults to 500 rows a page and a cap of 10 000, and sanitises silly sizes', async () => {
    expect(DEFAULT_PAGE_SIZE).toBe(500)
    expect(DEFAULT_MAX_ROWS).toBe(10_000)
    const { fetchPage, calls } = listOf(3)
    await fetchAllPages(fetchPage)
    await fetchAllPages(fetchPage, { pageSize: 0 })
    await fetchAllPages(fetchPage, { pageSize: Number.NaN })

    expect(calls.map(([, size]) => size)).toEqual([500, 500, 500])
  })

  describe('the cap', () => {
    it('stops in the middle of a page at maxRows and says there was more', async () => {
      const { fetchPage } = listOf(100)

      const result = await fetchAllPages(fetchPage, { pageSize: 10, maxRows: 25 })

      expect(result.rows).toEqual(Array.from({ length: 25 }, (_, i) => i))
      expect(result.truncated).toBe(true)
      expect(result.pages).toBe(3)
      expect(fetchPage).toHaveBeenCalledTimes(3)
    })

    it('is not truncated when the cap equals the number of rows, and is when one more exists', async () => {
      expect((await fetchAllPages(listOf(30).fetchPage, { pageSize: 10, maxRows: 30 })).truncated).toBe(false)
      expect((await fetchAllPages(listOf(31).fetchPage, { pageSize: 10, maxRows: 30 })).truncated).toBe(true)
    })

    it('without a reported total, a full page at the cap counts as "maybe more", a short one does not', async () => {
      expect((await fetchAllPages(listOf(30, { reportTotal: false }).fetchPage, { pageSize: 10, maxRows: 30 })).truncated).toBe(true)
      expect((await fetchAllPages(listOf(25, { reportTotal: false }).fetchPage, { pageSize: 10, maxRows: 30 })).truncated).toBe(false)
    })
  })

  describe('without a total from the server', () => {
    it('reads on while pages are full and stops at the first short one', async () => {
      const { fetchPage } = listOf(25, { reportTotal: false })

      const result = await fetchAllPages(fetchPage, { pageSize: 10 })

      expect(result.rows).toHaveLength(25)
      expect(result.total).toBeUndefined()
      expect(fetchPage).toHaveBeenCalledTimes(3)
    })

    it('stops at an empty page after a full last page', async () => {
      const { fetchPage } = listOf(20, { reportTotal: false })

      const result = await fetchAllPages(fetchPage, { pageSize: 10 })

      expect(result.rows).toHaveLength(20)
      expect(fetchPage).toHaveBeenCalledTimes(3)
    })
  })

  it('does not take a short page for the end when the server reports a total — it may cap the page size', async () => {
    const { fetchPage, calls } = listOf(120, { serverMax: 50 })

    const result = await fetchAllPages(fetchPage, { pageSize: 100 })

    expect(result.rows).toHaveLength(120)
    expect(calls).toEqual([[1, 100], [2, 100], [3, 100]])
  })

  describe('the list changing while it is read', () => {
    it('follows a growing total and says it changed', async () => {
      let total = 20
      const fetchPage = vi.fn(async (page: number): Promise<PageResult<number>> => {
        if (page === 2) total = 25 // five rows added after the first page
        const start = (page - 1) * 10
        return { rows: Array.from({ length: Math.max(0, Math.min(10, total - start)) }, (_, i) => start + i), total }
      })

      const result = await fetchAllPages(fetchPage, { pageSize: 10 })

      expect(result.rows).toHaveLength(25)
      expect(result.total).toBe(25)
      expect(result.totalChanged).toBe(true)
    })

    it('stops when rows were removed and the total fell below what was read', async () => {
      const fetchPage = vi.fn(async (page: number): Promise<PageResult<number>> => ({
        rows: Array.from({ length: 10 }, (_, i) => (page - 1) * 10 + i),
        total: page === 1 ? 40 : 15,
      }))

      const result = await fetchAllPages(fetchPage, { pageSize: 10 })

      expect(result.rows).toHaveLength(20)
      expect(result.totalChanged).toBe(true)
      expect(fetchPage).toHaveBeenCalledTimes(2)
    })

    it('drops a row that appears on two pages when keyOf is given, and counts it', async () => {
      const pages = [[1, 2, 3], [3, 4, 5], [6]]
      const fetchPage = vi.fn(async (page: number): Promise<PageResult<number>> => ({ rows: pages[page - 1] ?? [], total: 7 }))

      const result = await fetchAllPages(fetchPage, { pageSize: 3, keyOf: row => String(row) })

      expect(result.rows).toEqual([1, 2, 3, 4, 5, 6])
      expect(result.duplicates).toBe(1)
      expect(fetchPage).toHaveBeenCalledTimes(3) // 6 rows + 1 duplicate = the reported 7
    })

    it('keeps repeats without keyOf — it cannot know', async () => {
      const pages = [[1, 2], [2, 3]]
      const fetchPage = vi.fn(async (page: number): Promise<PageResult<number>> => ({ rows: pages[page - 1] ?? [], total: 4 }))

      expect((await fetchAllPages(fetchPage, { pageSize: 2 })).rows).toEqual([1, 2, 2, 3])
    })

    it('gives up on a server that keeps answering the same page (nothing new, no total)', async () => {
      const fetchPage = vi.fn(async (): Promise<PageResult<number>> => ({ rows: [1, 2, 3] }))

      const result = await fetchAllPages(fetchPage, { pageSize: 3, keyOf: row => String(row) })

      expect(result.rows).toEqual([1, 2, 3])
      expect(fetchPage).toHaveBeenCalledTimes(2)
    })

    it('is bounded by the cap even for a server that ignores the page number', async () => {
      const fetchPage = vi.fn(async (): Promise<PageResult<number>> => ({ rows: [1, 2, 3] }))

      const result = await fetchAllPages(fetchPage, { pageSize: 3, maxRows: 9 })

      expect(result.rows).toHaveLength(9)
      expect(fetchPage).toHaveBeenCalledTimes(3)
    })
  })

  describe('progress', () => {
    it('reports after every page: rows loaded, the server total, the target and the page', async () => {
      const onProgress = vi.fn()

      await fetchAllPages(listOf(25).fetchPage, { pageSize: 10, onProgress })

      expect(onProgress.mock.calls.map(([p]) => p)).toEqual([
        { loaded: 10, total: 25, target: 25, page: 1 },
        { loaded: 20, total: 25, target: 25, page: 2 },
        { loaded: 25, total: 25, target: 25, page: 3 },
      ])
    })

    it('caps the target at maxRows and leaves total and target out when the server reports none', async () => {
      const capped = vi.fn()
      await fetchAllPages(listOf(100).fetchPage, { pageSize: 10, maxRows: 15, onProgress: capped })
      expect(capped.mock.calls.at(-1)![0]).toEqual({ loaded: 15, total: 100, target: 15, page: 2 })

      const unknown = vi.fn()
      await fetchAllPages(listOf(5, { reportTotal: false }).fetchPage, { pageSize: 10, onProgress: unknown })
      expect(unknown.mock.calls[0]![0]).toEqual({ loaded: 5, total: undefined, target: undefined, page: 1 })
    })
  })

  describe('abort', () => {
    it('rejects with an AbortError and asks for nothing when the signal is already aborted', async () => {
      const { fetchPage } = listOf(25)
      const controller = new AbortController()
      controller.abort()

      await expect(fetchAllPages(fetchPage, { pageSize: 10, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
      expect(fetchPage).not.toHaveBeenCalled()
    })

    it('rejects after the page in flight when aborted midway — a half-read list is never returned as complete', async () => {
      const controller = new AbortController()
      const fetchPage = vi.fn(async (page: number): Promise<PageResult<number>> => {
        if (page === 2) controller.abort()
        return { rows: [page], total: 10 }
      })

      await expect(fetchAllPages(fetchPage, { pageSize: 1, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
      expect(fetchPage).toHaveBeenCalledTimes(2)
    })

    it('rejects with the signal\'s own reason', async () => {
      const controller = new AbortController()
      controller.abort(new Error('user cancelled'))

      await expect(fetchAllPages(listOf(5).fetchPage, { signal: controller.signal })).rejects.toThrow('user cancelled')
    })
  })

  it('lets a failing page through, and ignores a total that is not a number', async () => {
    await expect(fetchAllPages(async () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')

    const result = await fetchAllPages(async page => ({ rows: page === 1 ? [1] : [], total: Number.NaN }), { pageSize: 5 })
    expect(result.total).toBeUndefined()
    expect(result.rows).toEqual([1])
  })
})
