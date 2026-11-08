import { beforeEach, describe, expect, it, vi } from 'vitest'

const countDocuments = vi.fn()
const deleteMany = vi.fn()
const updateMany = vi.fn()

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ documentApi: { countDocuments, deleteMany, updateMany } }),
}))

const { useMongocampBulkByFilter } = await import('../src/runtime/composables/useMongocampBulkByFilter')

beforeEach(() => vi.clearAllMocks())

describe('useMongocampBulkByFilter', () => {
  it('counts with the Lucene filter, and without one for an empty filter', async () => {
    countDocuments.mockResolvedValue({ count: 7 })
    const { countDocuments: count } = useMongocampBulkByFilter()

    expect(await count('people', 'age:[18 TO 99]')).toBe(7)
    expect(countDocuments).toHaveBeenLastCalledWith({ collectionName: 'people', filter: 'age:[18 TO 99]' }, undefined)

    await count('people', '  ')
    expect(countDocuments).toHaveBeenLastCalledWith({ collectionName: 'people', filter: undefined }, undefined)
  })

  it('deletes by the filter with an empty body and no matchAll', async () => {
    deleteMany.mockResolvedValue({ deletedCount: 3 })
    const controller = new AbortController()

    expect(await useMongocampBulkByFilter().deleteByFilter('people', 'name:a*', controller.signal)).toBe(3)
    expect(deleteMany).toHaveBeenCalledWith(
      { collectionName: 'people', requestBody: {}, filter: 'name:a*', matchAll: undefined },
      { signal: controller.signal },
    )
  })

  it('asks for matchAll only when there is no filter at all', async () => {
    deleteMany.mockResolvedValue({ deletedCount: 9 })
    await useMongocampBulkByFilter().deleteByFilter('people', '')

    expect(deleteMany).toHaveBeenCalledWith({ collectionName: 'people', requestBody: {}, filter: undefined, matchAll: true }, undefined)
  })

  it('updates by the filter with an empty body filter and reports matched and modified', async () => {
    updateMany.mockResolvedValue({ matchedCount: 5, modifiedCount: 4 })

    const result = await useMongocampBulkByFilter().updateByFilter('people', 'active:true', { status: 'x', n: 2 })

    expect(result).toEqual({ matched: 5, modified: 4 })
    expect(updateMany).toHaveBeenCalledWith(
      { collectionName: 'people', updateRequest: { filter: {}, document: { status: 'x', n: 2 } }, filter: 'active:true', matchAll: undefined },
      undefined,
    )
  })
})
