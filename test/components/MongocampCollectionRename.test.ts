import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, shallowRef } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { UApp } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampCollectionRename from '../../src/runtime/components/MongocampCollectionRename.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))
const modal = () => new DOMWrapper(document.body)

const mockListCollections = vi.fn()
const mockRenameCollection = vi.fn()

mockNuxtImport('useMongocampApi', () => () => ({
  collectionApi: { listCollections: mockListCollections, renameCollection: mockRenameCollection },
  documentApi: {},
}))

beforeEach(() => {
  vi.resetAllMocks()
  mockListCollections.mockResolvedValue(['orders', 'users'])
  mockRenameCollection.mockImplementation(async ({ renameRequest }: { renameRequest: { target: string } }) => ({ name: renameRequest.target }))
})

async function mountRename() {
  const done: unknown[] = []
  const open = shallowRef(true)
  const Host = defineComponent({
    setup: () => () => h(UApp, () => h(MongocampCollectionRename, {
      'source': 'orders',
      'open': open.value,
      'onUpdate:open': (v: boolean) => (open.value = v),
      'onDone': (v: unknown) => done.push(v),
    })),
  })
  await mountSuspended(Host, { route: '/' })
  await wait()
  return { done, open }
}

const nameInput = () => modal().find('input[aria-label="New name"]')
const button = (label: string) => modal().findAll('button').find(b => b.text() === label)!
const type = async (value: string) => {
  await nameInput().setValue(value)
  await wait()
}

describe('MongocampCollectionRename', () => {
  it('warns that grants are by name, and keeps Rename disabled until the name is valid', async () => {
    await mountRename()
    expect(modal().find('[data-test="rename-grants-warning"]').text()).toContain('Grants are matched by name')
    expect(button('Rename').attributes('disabled')).toBeDefined()
    await type('orders_2026')
    expect(button('Rename').attributes('disabled')).toBeUndefined()
  })

  it('says why a name is refused', async () => {
    await mountRename()
    for (const [name, message] of [['users', 'already exists'], ['orders', 'other than the source'], ['mc_x', 'reserved'], ['a b', 'letters, digits']] as const) {
      await type(name)
      expect(modal().text()).toContain(message)
      expect(button('Rename').attributes('disabled')).toBeDefined()
    }
  })

  it('renames with one request, emits done and closes', async () => {
    const { done, open } = await mountRename()
    await type('orders_2026')
    await button('Rename').trigger('click')
    await wait()

    expect(mockRenameCollection).toHaveBeenCalledWith({ collectionName: 'orders', renameRequest: { target: 'orders_2026' } }, undefined)
    expect(done).toEqual([{ source: 'orders', target: 'orders_2026' }])
    expect(open.value).toBe(false)
  })

  it('stays open and says so when the name was taken meanwhile', async () => {
    mockRenameCollection.mockRejectedValue(Object.assign(new Error('x'), { name: 'ResponseError', response: new Response('{}', { status: 409 }) }))
    const { done, open } = await mountRename()
    await type('race')
    await button('Rename').trigger('click')
    await wait()

    expect(modal().text()).toContain('A collection named race exists now')
    expect(done).toEqual([])
    expect(open.value).toBe(true)
  })

  it('shows the server message for any other failure', async () => {
    mockRenameCollection.mockRejectedValue(Object.assign(new Error('x'), {
      name: 'ResponseError',
      response: new Response(JSON.stringify({ code: 4007, msg: 'the name is reserved' }), { status: 400 }),
    }))
    await mountRename()
    await type('fine_name')
    await button('Rename').trigger('click')
    await wait()

    expect(modal().text()).toContain('the name is reserved')
  })
})
