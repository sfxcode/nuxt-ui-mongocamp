import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCollectionApi = { listCollections: vi.fn(), copyCollection: vi.fn(), renameCollection: vi.fn() }
const mockCountDocuments = vi.fn()

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ collectionApi: mockCollectionApi, documentApi: { countDocuments: mockCountDocuments } }),
}))

const { useMongocampCollectionCopy } = await import('../src/runtime/composables/useMongocampCollectionCopy')
const { CollectionNotCopyableError } = await import('../src/runtime/utils/collectionCopy')

const conflict = () => Object.assign(new Error('Response returned an error code'), { name: 'ResponseError', response: new Response('{}', { status: 409 }) })

beforeEach(() => {
  vi.resetAllMocks()
  mockCollectionApi.listCollections.mockResolvedValue(['orders'])
  mockCollectionApi.copyCollection.mockImplementation(async ({ copyRequest }: { copyRequest: { target: string } }) => ({ name: copyRequest.target, count: 7, indexes: 1 }))
  mockCollectionApi.renameCollection.mockImplementation(async ({ renameRequest }: { renameRequest: { target: string } }) => ({ name: renameRequest.target }))
})

describe('copyCollection', () => {
  it('copies inside the database with one request and returns what the server reports', async () => {
    const result = await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'orders_copy', filter: 'status:open', withIndexes: true })

    expect(mockCollectionApi.copyCollection).toHaveBeenCalledTimes(1)
    expect(mockCollectionApi.copyCollection).toHaveBeenCalledWith({ collectionName: 'orders', copyRequest: { target: 'orders_copy', filter: 'status:open', withIndexes: true } }, undefined)
    expect(result).toEqual({ target: 'orders_copy', count: 7, indexes: 1 })
  })

  it('sends no filter for a blank one and no indexes unless asked', async () => {
    await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', filter: '  ' })

    expect(mockCollectionApi.copyCollection.mock.calls[0]![0].copyRequest).toEqual({ target: 'x', filter: undefined, withIndexes: false })
  })

  it('passes an abort signal on', async () => {
    const controller = new AbortController()
    await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'x', signal: controller.signal })

    expect(mockCollectionApi.copyCollection.mock.calls[0]![1]).toEqual({ signal: controller.signal })
  })

  it('returns `refused` for a target that exists (409) and throws every other failure', async () => {
    mockCollectionApi.copyCollection.mockRejectedValueOnce(conflict())
    expect(await useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'taken' })).toMatchObject({ refused: 'target-exists', target: 'taken' })

    const boom = Object.assign(new Error('bad'), { response: new Response('{}', { status: 400 }) })
    mockCollectionApi.copyCollection.mockRejectedValueOnce(boom)
    await expect(useMongocampCollectionCopy().copyCollection({ source: 'orders', target: 'mc_x' })).rejects.toBe(boom)
  })
})

describe('backupCollection', () => {
  it('copies into <source>_backup_<timestamp> and reports the chosen name first', async () => {
    const seen: string[] = []
    const result = await useMongocampCollectionCopy().backupCollection({ source: 'orders', now: new Date(2026, 10, 8, 15, 30, 45), onTarget: name => seen.push(name), withIndexes: true })

    expect(seen).toEqual(['orders_backup_20261108_153045'])
    expect(result.target).toBe('orders_backup_20261108_153045')
    expect(mockCollectionApi.copyCollection.mock.calls[0]![0].copyRequest.withIndexes).toBe(true)
  })

  it('takes the next name when it exists, and tries again when another session took it first', async () => {
    mockCollectionApi.listCollections.mockResolvedValue(['orders', 'orders_backup_20261108_153045'])
    mockCollectionApi.copyCollection.mockRejectedValueOnce(conflict())
    const result = await useMongocampCollectionCopy().backupCollection({ source: 'orders', now: new Date(2026, 10, 8, 15, 30, 45) })

    expect(mockCollectionApi.copyCollection).toHaveBeenCalledTimes(2)
    expect(mockCollectionApi.copyCollection.mock.calls[0]![0].copyRequest.target).toBe('orders_backup_20261108_153045_2')
    expect(result.refused).toBeUndefined()
  })

  it('refuses a source that cannot be copied before any request', async () => {
    await expect(useMongocampCollectionCopy().backupCollection({ source: 'mc_users' })).rejects.toBeInstanceOf(CollectionNotCopyableError)
    expect(mockCollectionApi.copyCollection).not.toHaveBeenCalled()
  })
})

describe('renameCollection', () => {
  it('renames with one request and returns the new name', async () => {
    expect(await useMongocampCollectionCopy().renameCollection('orders', 'orders_old')).toEqual({ target: 'orders_old' })
    expect(mockCollectionApi.renameCollection).toHaveBeenCalledWith({ collectionName: 'orders', renameRequest: { target: 'orders_old' } }, undefined)
  })

  it('returns `refused` for a target that exists', async () => {
    mockCollectionApi.renameCollection.mockRejectedValueOnce(conflict())

    expect(await useMongocampCollectionCopy().renameCollection('orders', 'users')).toEqual({ refused: 'target-exists', target: 'users' })
  })
})

describe('countDocuments', () => {
  it('counts with the filter through the count endpoint', async () => {
    mockCountDocuments.mockResolvedValue({ count: 12 })

    expect(await useMongocampCollectionCopy().countDocuments('orders', 'a:1')).toBe(12)
    expect(mockCountDocuments.mock.calls[0]![0]).toMatchObject({ collectionName: 'orders', filter: 'a:1' })
  })
})
