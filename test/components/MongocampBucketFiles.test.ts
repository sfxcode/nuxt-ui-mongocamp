import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import { clearNuxtState } from '#app'
import MongocampBucketFiles from '../../src/runtime/components/MongocampBucketFiles.vue'
import MongocampCollectionCharts from '../../src/runtime/components/MongocampCollectionCharts.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))

const mockListFilesRaw = vi.fn()
const mockGetFieldDetails = vi.fn()
const mockAggregateRaw = vi.fn()
const mockUserPermissions = vi.fn()
const session: { isAdmin: boolean } = { isAdmin: true }

mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'carol@example.com', isAdmin: session.isAdmin, roles: [] } } }))
mockNuxtImport('useMongocampApi', () => () => ({
  fileApi: { listFilesRaw: mockListFilesRaw },
  bucketApi: {},
  collectionApi: { getFieldDetails: mockGetFieldDetails, aggregateRaw: mockAggregateRaw },
  authApi: { userPermissions: mockUserPermissions },
}))

// recorded on server 1.8.1 for a GridFS `.files` collection
const FILE_FIELDS = [
  { path: '_id', types: [{ type: 'objectId', count: 5 }] },
  { path: 'filename', types: [{ type: 'string', count: 5 }] },
  { path: 'length', types: [{ type: 'long', count: 5 }] },
  { path: 'uploadDate', types: [{ type: 'date', count: 5 }] },
  { path: 'contentType', types: [{ type: 'string', count: 5 }] },
  { path: 'metadata', types: [{ type: 'object', count: 5 }] },
]

beforeEach(() => {
  vi.resetAllMocks()
  // the field types are cached per collection in shared state
  clearNuxtState('mongocamp-field-types')
  clearNuxtState('mongocamp-permissions')
  session.isAdmin = true
  mockListFilesRaw.mockResolvedValue({ raw: { headers: { get: () => '0' } }, value: () => Promise.resolve([]) })
  mockGetFieldDetails.mockResolvedValue(FILE_FIELDS)
  mockAggregateRaw.mockResolvedValue({ raw: { headers: { get: () => null } }, value: () => Promise.resolve([]) })
  mockUserPermissions.mockResolvedValue([{ name: 'photos.files', read: true, write: true, administrate: false }])
})

async function mountFiles() {
  const component = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampBucketFiles, { bucketName: 'photos' })) }), { route: '/' })
  await wait(100)
  return component
}

async function openDistribution(component: Awaited<ReturnType<typeof mountFiles>>) {
  const details = component.find('[data-test="bucket-distribution"]')
  ;(details.element as HTMLDetailsElement).open = true
  await details.trigger('toggle')
  await wait(100)
}

describe('bucket distribution', () => {
  it('hideRefresh removes the reload button; the toolbar slot and refresh() are there for the page', async () => {
    const exposed: { current: { refresh?: () => unknown } | null } = { current: null }
    const mountWith = (hideRefresh: boolean) => mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(
        MongocampBucketFiles,
        { bucketName: 'photos', hideRefresh, ref: (el: unknown) => { exposed.current = el as typeof exposed.current } },
        { toolbar: () => h('button', { 'data-test': 'page-button' }, 'Mine') },
      )),
    }), { route: '/' })

    const shown = await mountWith(false)
    await new Promise(resolve => setTimeout(resolve, 50))
    const reloadButtons = shown.findAll('button').filter(button => button.find('[class*="refresh-cw"]').exists()).length
    expect(reloadButtons).toBeGreaterThan(0)

    const hidden = await mountWith(true)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(hidden.findAll('button').filter(button => button.find('[class*="refresh-cw"]').exists())).toHaveLength(reloadButtons - 1)
    expect(hidden.find('[data-test="page-button"]').exists()).toBe(true)
    expect(typeof exposed.current?.refresh).toBe('function')
  })

  it('asks for nothing until the section is opened', async () => {
    const component = await mountFiles()

    expect(component.find('[data-test="bucket-distribution"]').exists()).toBe(true)
    expect(mockGetFieldDetails).not.toHaveBeenCalled()
    expect(component.findComponent(MongocampCollectionCharts).exists()).toBe(false)
  })

  it('charts the content type of the files in <bucket>.files once opened, offering only fields with something to count', async () => {
    const component = await mountFiles()
    await openDistribution(component)

    expect(mockGetFieldDetails.mock.calls[0]![0]).toEqual({ collectionName: 'photos.files' })
    const charts = component.findComponent(MongocampCollectionCharts)
    expect(charts.props()).toMatchObject({ collectionName: 'photos.files', field: 'contentType' })
    const select = component.findAllComponents(USelect).find(s => s.html().includes('aria-label="Field"'))!
    expect((select.vm.$props as unknown as { items: { value: string }[] }).items.map(i => i.value)).toEqual(['filename', 'length', 'uploadDate', 'contentType'])
  })

  it('falls back to the upload date when the files carry no content type', async () => {
    mockGetFieldDetails.mockResolvedValue(FILE_FIELDS.filter(f => f.path !== 'contentType'))
    const component = await mountFiles()
    await openDistribution(component)

    expect(component.findComponent(MongocampCollectionCharts).props('field')).toBe('uploadDate')
  })

  it('says so when no field can be charted', async () => {
    mockGetFieldDetails.mockResolvedValue([{ path: '_id', types: [{ type: 'objectId', count: 1 }] }])
    const component = await mountFiles()
    await openDistribution(component)

    expect(component.find('[data-test="distribution-empty"]').exists()).toBe(true)
    expect(component.findComponent(MongocampCollectionCharts).exists()).toBe(false)
  })

  it('is hidden for a user the server says may not read <bucket>.files', async () => {
    session.isAdmin = false
    mockUserPermissions.mockResolvedValue([{ name: 'photos.files', read: false, write: false, administrate: false }])
    const component = await mountFiles()

    expect(mockUserPermissions).toHaveBeenCalledWith({ collection: 'photos.files' }, expect.anything())
    expect(component.find('[data-test="bucket-distribution"]').exists()).toBe(false)
  })
})
