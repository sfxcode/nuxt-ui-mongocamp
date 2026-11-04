import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampFilePreview from '../../src/runtime/components/MongocampFilePreview.vue'

enableAutoUnmount(afterEach)

const mockFetchBlob = vi.fn()

vi.mock('../../src/runtime/composables/useMongocampBucket', () => ({
  useMongocampBucket: () => ({ fetchFileBlob: mockFetchBlob, downloadFile: vi.fn(), downloadingFileIds: new Set() }),
}))

const file = (filename: string, length = 10) => ({ id: 'f1', filename, length, chunkSize: 255, uploadDate: new Date(), metadata: {} })

const createUrl = vi.fn(() => 'blob:preview')
const revokeUrl = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  createUrl.mockReturnValue('blob:preview')
  URL.createObjectURL = createUrl
  URL.revokeObjectURL = revokeUrl
})

async function mountPreview(f: ReturnType<typeof file>, open = true) {
  const c = await mountSuspended(defineComponent({
    setup: () => () => h(UApp, () => h(MongocampFilePreview, { bucketName: 'photos', file: f, open })),
  }), { route: '/' })
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 50))
  return c
}

const body = () => document.body.textContent ?? ''

describe('MongocampFilePreview', () => {
  it('shows an image through a blob URL', async () => {
    mockFetchBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    await mountPreview(file('a.png'))
    expect(createUrl).toHaveBeenCalled()
    expect(document.body.querySelector('img')?.getAttribute('src')).toBe('blob:preview')
  })

  it('pretty-prints JSON', async () => {
    mockFetchBlob.mockResolvedValue(new Blob(['{"a":1}']))
    await mountPreview(file('a.json'))
    expect(document.body.querySelector('pre')?.textContent).toContain('"a": 1')
  })

  it('does not load a file above the size cap', async () => {
    await mountPreview(file('big.json', 5 * 1024 * 1024))
    expect(mockFetchBlob).not.toHaveBeenCalled()
    expect(body()).toContain('Too large to preview')
  })

  it('does not load an unknown type', async () => {
    await mountPreview(file('a.zip'))
    expect(mockFetchBlob).not.toHaveBeenCalled()
    expect(body()).toContain('No preview for this file type')
  })

  it('shows the failure and revokes nothing it never created', async () => {
    mockFetchBlob.mockRejectedValue(new Error('boom'))
    await mountPreview(file('a.png'))
    expect(body()).toContain('The file could not be loaded')
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('revokes the blob URL on unmount', async () => {
    mockFetchBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    const c = await mountPreview(file('a.png'))
    c.unmount()
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview')
  })
})
