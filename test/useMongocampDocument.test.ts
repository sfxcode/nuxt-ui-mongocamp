import { describe, it, expect, vi } from 'vitest'

vi.mock('#imports', () => ({
  useMongocampStorage: () => ({ value: { profile: { user: 'alice' } } }),
}))

const { default: useMongocampDocument } = await import('../src/runtime/composables/useMongocampDocument')

describe('ensureMetaData — no existing metaData', () => {
  it('stamps createdBy and updatedBy with the current user, and created/updated with the same timestamp', () => {
    const { ensureMetaData } = useMongocampDocument()
    const result = ensureMetaData<{ metaData?: { createdBy: string, updatedBy: string, created: string | Date, updated: string | Date } }>({})

    expect(result.metaData?.createdBy).toBe('alice')
    expect(result.metaData?.updatedBy).toBe('alice')
    expect(result.metaData?.created).toBeInstanceOf(Date)
    expect(result.metaData?.created).toBe(result.metaData?.updated)
  })

  it('treats a metaData object with an empty createdBy as "no existing metaData"', () => {
    const { ensureMetaData } = useMongocampDocument()
    const result = ensureMetaData({ metaData: { createdBy: '', updatedBy: 'someone', created: 'old', updated: 'old' } })

    expect(result.metaData?.createdBy).toBe('alice')
    expect(result.metaData?.updatedBy).toBe('alice')
    expect(result.metaData?.created).toBeInstanceOf(Date)
  })
})

describe('ensureMetaData — existing metaData with a createdBy', () => {
  it('preserves createdBy and created, refreshes updatedBy and updated', () => {
    const originalCreated = new Date('2020-01-01T00:00:00Z')
    const { ensureMetaData } = useMongocampDocument()
    const result = ensureMetaData({
      metaData: { createdBy: 'bob', updatedBy: 'bob', created: originalCreated, updated: originalCreated },
    })

    expect(result.metaData?.createdBy).toBe('bob')
    expect(result.metaData?.created).toBe(originalCreated)
    expect(result.metaData?.updatedBy).toBe('alice')
    expect(result.metaData?.updated).not.toBe(originalCreated)
    expect(result.metaData?.updated).toBeInstanceOf(Date)
  })

  it('falls back to now for created when createdBy is present but created is missing', () => {
    const { ensureMetaData } = useMongocampDocument()
    const result = ensureMetaData({
      metaData: { createdBy: 'bob' } as { createdBy: string, updatedBy: string, created: string | Date, updated: string | Date },
    })

    expect(result.metaData?.created).toBeInstanceOf(Date)
  })
})

describe('updateFromPartial', () => {
  it('shallow-merges updates over the original object', () => {
    const { updateFromPartial } = useMongocampDocument()
    const result = updateFromPartial({ name: 'Alice', age: 30 }, { age: 31 })

    expect(result).toEqual({ name: 'Alice', age: 31 })
  })

  it('does not mutate the original object', () => {
    const { updateFromPartial } = useMongocampDocument()
    const original = { name: 'Alice', age: 30 }
    updateFromPartial(original, { age: 31 })

    expect(original.age).toBe(30)
  })
})
