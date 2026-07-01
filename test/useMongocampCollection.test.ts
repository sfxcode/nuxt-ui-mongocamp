import { describe, it, expect } from 'vitest'
import useMongocampCollection from '../src/runtime/composables/useMongocampCollection'

describe('default state', () => {
  it('defaults pagination to pageIndex 1 and pageSize 20', () => {
    const { pagination } = useMongocampCollection()
    expect(pagination.value).toEqual({ pageIndex: 1, pageSize: 20 })
  })

  it('defaults total to 0', () => {
    const { total } = useMongocampCollection()
    expect(total.value).toBe(0)
  })

  it('defaults filter, sort, and projection to undefined', () => {
    const { filter, sort, projection } = useMongocampCollection()
    expect(filter.value).toBeUndefined()
    expect(sort.value).toBeUndefined()
    expect(projection.value).toBeUndefined()
  })
})

describe('instance independence', () => {
  it('each call returns its own refs, not shared module-level state', () => {
    const a = useMongocampCollection()
    const b = useMongocampCollection()

    a.pagination.value.pageIndex = 5
    a.total.value = 100
    a.filter.value = 'status:active'

    expect(b.pagination.value.pageIndex).toBe(1)
    expect(b.total.value).toBe(0)
    expect(b.filter.value).toBeUndefined()
  })
})
