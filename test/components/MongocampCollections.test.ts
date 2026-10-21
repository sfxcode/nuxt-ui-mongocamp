import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampCollections from '../../src/runtime/components/MongocampCollections.vue'

// UModal's transitions are timer-based and its content is teleported to body — see
// brain/patterns/component-testing-nuxt-environment.md.
enableAutoUnmount(afterEach)

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function page() {
  return new DOMWrapper(document.body)
}

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

const state = { isAdmin: true }
const mockListCollections = vi.fn()
const mockGetInfo = vi.fn()
const mockClearCollection = vi.fn()
const mockDeleteCollection = vi.fn()
const mockClearBucket = vi.fn()
const mockDeleteBucket = vi.fn()

vi.mock('../../src/runtime/composables/useMongocampAdmin', () => ({
  default: () => ({ clearCollection: mockClearCollection, deleteCollection: mockDeleteCollection }),
}))

// The real useMongocampRoles and useMongocampBucket run on top of these two mocks.
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'alice@example.com', isAdmin: state.isAdmin } } }))
mockNuxtImport('useMongocampClientApi', () => () => ({
  collectionApi: { listCollections: mockListCollections, getCollectionInformation: mockGetInfo },
  bucketApi: { clearBucket: mockClearBucket, deleteBucket: mockDeleteBucket },
}))

const INFO = { count: 3, storageSize: 2048, nindexes: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  state.isAdmin = true
  mockListCollections.mockResolvedValue(['orders', 'mc_users', 'photos.files', 'photos.chunks'])
  mockGetInfo.mockResolvedValue(INFO)
  mockClearCollection.mockResolvedValue({ value: true })
  mockDeleteCollection.mockResolvedValue({ value: true })
  mockClearBucket.mockResolvedValue({ value: true })
  mockDeleteBucket.mockResolvedValue({ value: true })
})

async function mountCollections(props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(withUApp(MongocampCollections), { props })
  await flushPromises()
  await wait()
  return wrapper
}

function row(wrapper: Awaited<ReturnType<typeof mountCollections>>, name: string) {
  return wrapper.findAll('tbody tr').find(tr => tr.text().includes(name))!
}

function labels(tr: { findAll: (s: string) => { attributes: (n: string) => string | undefined }[] }) {
  return tr.findAll('button, a').map(el => el.attributes('aria-label'))
}

function confirmButton(label: string) {
  return page().findAll('button').find(b => b.text().includes(label))!
}

async function typeName(value: string) {
  await page().find('input[aria-label^="Type"]').setValue(value)
  await flushPromises()
}

describe('MongocampCollections — clear and drop', () => {
  it('offers clear and drop to an admin on an ordinary collection', async () => {
    const wrapper = await mountCollections()

    expect(labels(row(wrapper, 'orders'))).toEqual(expect.arrayContaining(['Clear collection', 'Drop collection']))
  })

  it('offers neither to a non-admin', async () => {
    state.isAdmin = false
    const wrapper = await mountCollections()

    expect(labels(row(wrapper, 'orders'))).not.toContain('Clear collection')
    expect(labels(row(wrapper, 'orders'))).not.toContain('Drop collection')
  })

  it('hides them when canManage is false', async () => {
    const wrapper = await mountCollections({ canManage: false })

    expect(labels(row(wrapper, 'orders'))).not.toContain('Drop collection')
  })

  it('never offers collection clear/drop for bucket members (they get the bucket actions)', async () => {
    const wrapper = await mountCollections()

    const files = labels(row(wrapper, 'photos.files'))
    expect(files).not.toContain('Clear collection')
    expect(files).not.toContain('Drop collection')
    expect(files).toContain('Clear bucket')
  })

  it('clears only after the exact name is typed, then refreshes and emits changed', async () => {
    const wrapper = await mountCollections()
    await row(wrapper, 'orders').find('button[aria-label="Clear collection"]').trigger('click')
    await wait()

    expect(confirmButton('Clear Collection').attributes('disabled')).toBeDefined()
    await typeName('order')
    expect(confirmButton('Clear Collection').attributes('disabled')).toBeDefined()
    expect(mockClearCollection).not.toHaveBeenCalled()

    await typeName('orders')
    mockListCollections.mockClear()
    await confirmButton('Clear Collection').trigger('click')
    await flushPromises()

    expect(mockClearCollection).toHaveBeenCalledWith('orders')
    expect(mockDeleteCollection).not.toHaveBeenCalled()
    expect(mockListCollections).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(MongocampCollections).emitted('changed')).toHaveLength(1)
  })

  it('drops through deleteCollection, not clearCollection', async () => {
    const wrapper = await mountCollections()
    await row(wrapper, 'orders').find('button[aria-label="Drop collection"]').trigger('click')
    await wait()

    await typeName('orders')
    await confirmButton('Drop Collection').trigger('click')
    await flushPromises()

    expect(mockDeleteCollection).toHaveBeenCalledWith('orders')
    expect(mockClearCollection).not.toHaveBeenCalled()
  })

  it('keeps the modal open with the reason when the server refuses, and does not refresh', async () => {
    mockDeleteCollection.mockRejectedValueOnce(Object.assign(new Error('nope'), { response: { status: 403 } }))
    const wrapper = await mountCollections()
    await row(wrapper, 'orders').find('button[aria-label="Drop collection"]').trigger('click')
    await wait()
    await typeName('orders')
    mockListCollections.mockClear()

    await confirmButton('Drop Collection').trigger('click')
    await flushPromises()
    await wait()

    expect(page().text()).toContain('You do not have permission to do this.')
    expect(page().find('input[aria-label^="Type"]').exists()).toBe(true)
    expect(mockListCollections).not.toHaveBeenCalled()
    expect(wrapper.findComponent(MongocampCollections).emitted('changed')).toBeUndefined()
  })
})

describe('MongocampCollections — bucket actions use the same confirmation', () => {
  it('requires the bucket name before clearing', async () => {
    const wrapper = await mountCollections()
    await row(wrapper, 'photos.files').find('button[aria-label="Clear bucket"]').trigger('click')
    await wait()

    await typeName('photos.files')
    expect(confirmButton('Clear Bucket').attributes('disabled')).toBeDefined()
    expect(mockClearBucket).not.toHaveBeenCalled()

    await typeName('photos')
    await confirmButton('Clear Bucket').trigger('click')
    await flushPromises()

    expect(mockClearBucket).toHaveBeenCalledWith({ bucketName: 'photos' })
  })

  it('deletes the bucket by its name after confirmation', async () => {
    const wrapper = await mountCollections()
    await row(wrapper, 'photos.chunks').find('button[aria-label="Delete bucket"]').trigger('click')
    await wait()

    await typeName('photos')
    await confirmButton('Delete Bucket').trigger('click')
    await flushPromises()

    expect(mockDeleteBucket).toHaveBeenCalledWith({ bucketName: 'photos' })
  })

  it('stays open when the bucket composable reports failure', async () => {
    mockDeleteBucket.mockRejectedValueOnce(new Error('bucket busy'))
    const wrapper = await mountCollections()
    await row(wrapper, 'photos.files').find('button[aria-label="Delete bucket"]').trigger('click')
    await wait()
    await typeName('photos')

    await confirmButton('Delete Bucket').trigger('click')
    await flushPromises()
    await wait()

    expect(page().text()).toContain('The action on the bucket "photos" failed.')
  })
})
