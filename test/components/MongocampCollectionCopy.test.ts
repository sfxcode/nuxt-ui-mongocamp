import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampCollectionCopy from '../../src/runtime/components/MongocampCollectionCopy.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const modal = () => new DOMWrapper(document.body)

const mockListCollections = vi.fn()
const mockCopyCollection = vi.fn()
const mockCountDocuments = vi.fn()

mockNuxtImport('useMongocampApi', () => () => ({
  collectionApi: { listCollections: mockListCollections, copyCollection: mockCopyCollection },
  documentApi: { countDocuments: mockCountDocuments },
}))
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'alice@example.com' } } }))

const targetExists = () => Object.assign(new Error('Response returned an error code'), {
  name: 'ResponseError',
  response: new Response(JSON.stringify({ code: 4091, msg: 'the collection exists, send dropTarget true to replace it' }), { status: 409 }),
})

beforeEach(() => {
  vi.resetAllMocks()
  mockListCollections.mockResolvedValue(['orders', 'users'])
  mockCountDocuments.mockResolvedValue({ count: 3 })
  mockCopyCollection.mockImplementation(async ({ copyRequest }: { copyRequest: { target: string } }) => ({ name: copyRequest.target, count: 3, indexes: 2 }))
})

// the dialog is opened by its parent through v-model:open, like in MongocampCollections
async function mountCopy(props: Record<string, unknown> = {}) {
  const done: unknown[] = []
  const open = shallowRef(true)
  const Host = defineComponent({
    setup: () => () => h(UApp, () => h(MongocampCollectionCopy, {
      'source': 'orders',
      'open': open.value,
      'onUpdate:open': (v: boolean) => (open.value = v),
      'onDone': (v: unknown) => done.push(v),
      ...props,
    })),
  })
  const component = await mountSuspended(Host, { route: '/' })
  await wait()
  return { component, done, open }
}

const nameInput = () => modal().find('input[aria-label="Name of the new collection"]')
const button = (label: string) => modal().findAll('button').find(b => b.text() === label)!
const type = async (value: string) => {
  await nameInput().setValue(value)
  await wait()
}

describe('MongocampCollectionCopy — form', () => {
  it('shows how many documents will be copied and keeps Copy disabled until the name is valid', async () => {
    await mountCopy()
    expect(modal().find('[data-test="copy-count"]').text()).toBe('3 documents will be copied.')
    expect(button('Copy').attributes('disabled')).toBeDefined()
    await type('orders_copy')
    expect(button('Copy').attributes('disabled')).toBeUndefined()
  })

  it('says why a name is refused', async () => {
    await mountCopy()
    for (const [name, message] of [['users', 'already exists'], ['orders', 'other than the source'], ['mc_users', 'reserved'], ['a b', 'letters, digits'], ['photos.files', 'reserved']] as const) {
      await type(name)
      expect(modal().text()).toContain(message)
      expect(button('Copy').attributes('disabled')).toBeDefined()
    }
  })

  it('titles a filtered copy and counts the matching documents with the filter', async () => {
    await mountCopy({ filter: 'status:open' })
    expect(modal().text()).toContain('Copy matching documents of orders')
    expect(modal().find('[data-test="copy-count"]').text()).toBe('3 matching documents will be copied.')
    expect(mockCountDocuments.mock.calls[0]![0]).toMatchObject({ collectionName: 'orders', filter: 'status:open' })
  })

  it('has no document cap any more', async () => {
    mockCountDocuments.mockResolvedValue({ count: 5_000_000 })
    await mountCopy()
    await type('big_copy')
    expect(modal().text()).toContain('5000000 documents will be copied.')
    expect(button('Copy').attributes('disabled')).toBeUndefined()
  })

  it('says so when the documents cannot be counted', async () => {
    mockCountDocuments.mockRejectedValue(new Error('down'))
    await mountCopy()
    expect(modal().text()).toContain('could not be counted')
  })

  it('reads the names and the count again each time it is opened', async () => {
    const { open } = await mountCopy()
    expect(mockListCollections).toHaveBeenCalledTimes(1)
    open.value = false
    await wait()
    mockListCollections.mockResolvedValue(['orders', 'users', 'fresh'])
    open.value = true
    await wait()
    expect(mockListCollections).toHaveBeenCalledTimes(2)
    expect(mockCountDocuments).toHaveBeenCalledTimes(2)
    await type('fresh')
    expect(modal().text()).toContain('already exists')
  })
})

describe('MongocampCollectionCopy — copying', () => {
  it('copies with ONE request, asks for the indexes by default, shows the result and emits done', async () => {
    const { done } = await mountCopy()
    await type('orders_copy')
    await button('Copy').trigger('click')
    await wait()

    expect(mockCopyCollection).toHaveBeenCalledTimes(1)
    expect(mockCopyCollection.mock.calls[0]![0]).toEqual({ collectionName: 'orders', copyRequest: { target: 'orders_copy', filter: undefined, withIndexes: true } })
    expect(modal().find('[data-test="copy-result"]').text()).toContain('Copied 3 documents to orders_copy.')
    expect(modal().find('[data-test="copy-indexes"]').text()).toBe('Indexes created: 2')
    expect(done).toEqual([{ target: 'orders_copy', copied: 3 }])
  })

  it('copies only the matching documents of a filtered dialog, and without indexes when unticked', async () => {
    await mountCopy({ filter: 'status:open' })
    await type('open_orders')
    await modal().find('button[role="checkbox"]').trigger('click')
    await button('Copy').trigger('click')
    await wait()

    expect(mockCopyCollection.mock.calls[0]![0].copyRequest).toEqual({ target: 'open_orders', filter: 'status:open', withIndexes: false })
    expect(modal().find('[data-test="copy-indexes"]').exists()).toBe(false)
  })

  it('goes back to the form when the name was taken meanwhile', async () => {
    mockCopyCollection.mockRejectedValue(targetExists())
    const { done } = await mountCopy()
    await type('race')
    await button('Copy').trigger('click')
    await wait()

    expect(modal().text()).toContain('A collection named race exists now')
    expect(modal().find('[data-test="copy-result"]').exists()).toBe(false)
    expect(done).toEqual([])
    await type('race')
    expect(button('Copy').attributes('disabled')).toBeDefined()
  })

  it('shows the server\'s message when the copy fails and keeps the form', async () => {
    mockCopyCollection.mockRejectedValue(Object.assign(new Error('x'), {
      name: 'ResponseError',
      response: new Response(JSON.stringify({ code: 4007, msg: 'the name is reserved' }), { status: 400 }),
    }))
    await mountCopy()
    await type('fine_name')
    await button('Copy').trigger('click')
    await wait()

    expect(modal().text()).toContain('the name is reserved')
    expect(nameInput().exists()).toBe(true)
  })

  it('cannot be dismissed while the server copies', async () => {
    let release!: () => void
    mockCopyCollection.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ name: 'slow_copy', count: 3, indexes: 0 })
    }))
    const { open } = await mountCopy()
    await type('slow_copy')
    await button('Copy').trigger('click')
    await wait()

    expect(modal().find('[data-test="copy-progress"]').text()).toContain('Copying 3 documents inside the database')
    expect(modal().findAll('button').some(b => b.text() === 'Cancel')).toBe(false)
    release()
    await wait()
    expect(modal().find('[data-test="copy-result"]').exists()).toBe(true)
    expect(open.value).toBe(true)
  })
})

describe('MongocampCollectionCopy — quick backup', () => {
  it('copies everything under a timestamped name without asking for one', async () => {
    const { done } = await mountCopy()
    await button('Quick backup').trigger('click')
    await wait()

    const request = mockCopyCollection.mock.calls[0]![0]
    expect(request.collectionName).toBe('orders')
    expect(request.copyRequest.target).toMatch(/^orders_backup_\d{8}_\d{6}$/)
    expect(request.copyRequest.withIndexes).toBe(true)
    expect(modal().find('[data-test="copy-result"]').text()).toContain(request.copyRequest.target)
    expect(done).toHaveLength(1)
  })

  it('takes the next free name when another session took it between the check and the request', async () => {
    mockCopyCollection.mockRejectedValueOnce(targetExists())
    await mountCopy()
    await button('Quick backup').trigger('click')
    await wait()

    expect(mockCopyCollection).toHaveBeenCalledTimes(2)
    expect(modal().find('[data-test="copy-result"]').exists()).toBe(true)
  })

  it('is disabled for a source that cannot be copied', async () => {
    await mountCopy({ source: 'photos.files' })
    expect(button('Quick backup').attributes('disabled')).toBeDefined()
  })
})
