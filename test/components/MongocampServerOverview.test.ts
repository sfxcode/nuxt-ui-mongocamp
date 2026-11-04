import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, UChart, USelect } from '#components'
import MongocampServerOverview from '../../src/runtime/components/MongocampServerOverview.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))

const api = {
  collectionApi: { listCollections: vi.fn(), getCollectionInformation: vi.fn() },
  databaseApi: { databaseInfos: vi.fn() },
  systemApi: { viewCluster: vi.fn() },
  jobApi: { jobsList: vi.fn() },
}

mockNuxtImport('useMongocampApi', () => () => api)

const member = { name: 'node-1', siteMaster: true, siteAddress: false, multicast: false, coordinator: true }
const info = (count: number, storageSize: number, avgObjSize: number, totalIndexSize: number) => ({ count, size: storageSize / 2, storageSize, avgObjSize, nindexes: 2, totalIndexSize })
const INFOS: Record<string, ReturnType<typeof info>> = {
  orders: info(1000, 900 * 1024, 120, 50 * 1024),
  users: info(50, 20 * 1024, 4000, 8 * 1024),
  logs: info(5000, 2 * 1024 * 1024, 90, 300 * 1024),
}

beforeEach(() => {
  vi.resetAllMocks()
  api.databaseApi.databaseInfos.mockResolvedValue([{ name: 'mongocamp', sizeOnDisk: 5 * 1024 * 1024, empty: false }, { name: 'scratch', sizeOnDisk: 4096, empty: true }])
  api.systemApi.viewCluster.mockResolvedValue({ coordinator: member, members: [member] })
  api.jobApi.jobsList.mockResolvedValue([
    { name: 'later', group: 'g', cronExpression: '0 0 * * * ?', priority: 5, nextScheduledFireTime: new Date('2030-01-02T00:00:00Z') },
    { name: 'sooner', group: 'g', cronExpression: '0 0 * * * ?', priority: 5, nextScheduledFireTime: new Date('2030-01-01T00:00:00Z') },
    { name: 'paused', group: 'g', cronExpression: '0 0 * * * ?', priority: 5 },
  ])
  api.collectionApi.listCollections.mockResolvedValue(['orders', 'users', 'logs', 'mc_users'])
  api.collectionApi.getCollectionInformation.mockImplementation(async ({ collectionName }: { collectionName: string }) => INFOS[collectionName] ?? info(1, 1024, 1, 0))
})

async function mountOverview(props: Record<string, unknown> = {}) {
  const component = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampServerOverview, props)) }), { route: '/' })
  await wait(120)
  return component
}

type Mounted = Awaited<ReturnType<typeof mountOverview>>
const text = (c: Mounted, test: string) => c.find(`[data-test="${test}"]`).text()
const ranked = (c: Mounted) => c.findAll('[data-test="ranked-list"] li').map(li => li.find('a').text())

describe('MongocampServerOverview', () => {
  it('shows the totals of the collections and the databases, leaving out MongoCamp\'s own collections', async () => {
    const c = await mountOverview()
    expect(text(c, 'stat-databases')).toBe('2')
    expect(c.text()).toContain('5.0 MB on disk')
    expect(text(c, 'stat-collections')).toBe('3')
    expect(text(c, 'stat-documents')).toBe('6,050')
    expect(text(c, 'stat-storage')).toBe('2.9 MB')
    expect(text(c, 'stat-indexes')).toBe('358 KB')
    expect(api.collectionApi.getCollectionInformation).toHaveBeenCalledTimes(3)
  })

  it('ranks the biggest collections by storage, with a chart and links to each collection', async () => {
    const c = await mountOverview()
    expect(ranked(c)).toEqual(['logs', 'orders', 'users'])
    const props = c.findAllComponents(UChart)[0]!.props() as { data: Array<{ name: string, value: number }>, type: string, ariaLabel: string, ariaDescription: string }
    expect(props.type).toBe('bar')
    expect(props.data.map(d => d.name)).toEqual(['logs', 'orders', 'users'])
    expect(props.ariaLabel).toBe('Biggest collections by Storage on disk')
    expect(props.ariaDescription).toBe('3 collections; the biggest is logs with 2.0 MB.')
    const links = c.findAll('[data-test="ranked-list"] a').map(a => a.attributes('href'))
    expect(links).toContain('/secured/admin/collections/logs')
    expect(c.findAll('[data-test="ranked-list"] a').some(a => a.attributes('href') === '/secured/admin/collections/logs/data')).toBe(true)
  })

  it('ranks by documents, average size or index size, and formats counts and bytes accordingly', async () => {
    const c = await mountOverview()
    const select = c.findAllComponents(USelect).find(s => s.html().includes('aria-label="Rank by"'))!
    select.vm.$emit('update:modelValue', 'count')
    await wait()
    expect(ranked(c)).toEqual(['logs', 'orders', 'users'])
    expect(c.find('[data-test="ranked-list"]').text()).toContain('5,000')

    select.vm.$emit('update:modelValue', 'avgObjSize')
    await wait()
    expect(ranked(c)).toEqual(['users', 'orders', 'logs'])
    expect(c.find('[data-test="ranked-list"]').text()).toContain('3.9 KB')

    select.vm.$emit('update:modelValue', 'totalIndexSize')
    await wait()
    expect(ranked(c)).toEqual(['logs', 'orders', 'users'])
  })

  it('honours topN', async () => {
    const c = await mountOverview({ topN: 2 })
    expect(ranked(c)).toEqual(['logs', 'orders'])
  })

  it('draws the share of storage as a donut (the biggest slices and the rest as one) and the databases as bars', async () => {
    api.collectionApi.listCollections.mockResolvedValue(Array.from({ length: 8 }, (_, i) => `c${i}`))
    api.collectionApi.getCollectionInformation.mockImplementation(async ({ collectionName }: { collectionName: string }) => info(10, (9 - Number(collectionName.slice(1))) * 1000, 10, 0))
    const c = await mountOverview()
    const charts = c.findAllComponents(UChart).map(x => x.props() as { type: string, data: Array<{ name: string }> })
    const donut = charts.find(x => x.type === 'donut')!
    expect(donut.data).toHaveLength(6)
    expect(donut.data.at(-1)!.name).toBe('All other collections')
    const bars = charts.filter(x => x.type === 'bar')
    expect(bars.at(-1)!.data.map(d => d.name)).toEqual(['mongocamp', 'scratch'])
  })

  it('lists the databases, the cluster members and the next jobs, soonest first, leaving out an unscheduled one', async () => {
    const c = await mountOverview()
    expect(text(c, 'database-list')).toContain('mongocamp')
    expect(text(c, 'database-list')).toContain('empty')
    expect(text(c, 'cluster-list')).toContain('node-1')
    expect(text(c, 'cluster-list')).toContain('Coordinator')
    expect(text(c, 'cluster-list')).toContain('Site master')
    const jobs = c.findAll('[data-test="jobs-list"] li').map(li => li.text())
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toContain('g / sooner')
    expect(jobs[1]).toContain('g / later')
  })

  it('says when no job has a next run', async () => {
    api.jobApi.jobsList.mockResolvedValue([])
    const c = await mountOverview()
    expect(text(c, 'jobs-none')).toContain('No job has a next run')
  })

  it('says which collections it left out because of the limit', async () => {
    api.collectionApi.listCollections.mockResolvedValue(Array.from({ length: 6 }, (_, i) => `c${i}`))
    const c = await mountOverview({ maxCollections: 4 })
    expect(text(c, 'stat-collections')).toBe('6')
    expect(text(c, 'overview-partial')).toBe('4 of 6 collections were read; 2 were left out (the limit is 4).')
    expect(api.collectionApi.getCollectionInformation).toHaveBeenCalledTimes(4)
  })

  it('names a collection that could not be read and still shows the rest', async () => {
    api.collectionApi.getCollectionInformation.mockImplementation(async ({ collectionName }: { collectionName: string }) => {
      if (collectionName === 'users') throw new Error('x')
      return INFOS[collectionName]!
    })
    const c = await mountOverview()
    expect(text(c, 'overview-failed')).toBe('1 collections could not be read: users')
    expect(ranked(c)).toEqual(['logs', 'orders'])
    expect(c.find('[data-test="overview-partial"]').exists()).toBe(false) // nothing was left out, one failed
  })

  it('keeps the other parts when one fails, names it, and Try again reads again', async () => {
    api.databaseApi.databaseInfos.mockRejectedValueOnce(new Error('no'))
    const c = await mountOverview()
    expect(text(c, 'overview-error')).toContain('The databases could not be read.')
    expect(text(c, 'stat-databases')).toBe('—')
    expect(c.find('[data-test="database-list"]').exists()).toBe(false)
    expect(ranked(c)).toEqual(['logs', 'orders', 'users'])

    await c.findAll('button').find(b => b.text() === 'Try again')!.trigger('click')
    await wait(150)
    expect(c.find('[data-test="overview-error"]').exists()).toBe(false)
    expect(text(c, 'stat-databases')).toBe('2')
  })

  it('shows progress while it reads and can be stopped', async () => {
    let release!: () => void
    api.collectionApi.getCollectionInformation.mockImplementation((_r: unknown, init: { signal: AbortSignal }) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      release = () => resolve(info(1, 1, 1, 1))
    }))
    const c = await mountOverview()
    expect(text(c, 'overview-progress')).toContain('Reading collections: 0 of 3')
    await c.findAll('button').find(b => b.text() === 'Stop')!.trigger('click')
    await wait()
    expect(c.find('[data-test="overview-progress"]').exists()).toBe(false)
    expect(c.find('[data-test="stat-collections"]').exists()).toBe(false) // nothing half-read is shown
    release?.()
  })

  it('shows no charts with hideCharts', async () => {
    const c = await mountOverview({ hideCharts: true })
    expect(c.findAllComponents(UChart)).toHaveLength(0)
    expect(ranked(c)).toEqual(['logs', 'orders', 'users'])
  })

  it('uses the given paths for the links', async () => {
    const c = await mountOverview({ infoPath: '/c', dataPath: '/d', jobsPath: '/j' })
    const hrefs = c.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('/c/logs')
    expect(hrefs).toContain('/d/logs/data')
    expect(hrefs).toContain('/j')
  })

  it('says so when there is nothing to rank', async () => {
    api.collectionApi.listCollections.mockResolvedValue(['mc_users'])
    const c = await mountOverview()
    expect(text(c, 'overview-no-collections')).toContain('No collections to show')
  })
})

describe('MongocampServerOverview — autoRefresh', () => {
  it('does not reload by default, and reloads quietly every N seconds when asked, keeping the data when that fails', async () => {
    const off = await mountOverview()
    await wait(1300)
    expect(api.databaseApi.databaseInfos).toHaveBeenCalledTimes(1)
    off.unmount()

    api.databaseApi.databaseInfos.mockClear()
    const on = await mountOverview({ autoRefresh: 1 })
    await wait(1300)
    expect(api.databaseApi.databaseInfos.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(on.find('[data-test="overview-progress"]').exists()).toBe(false)

    api.collectionApi.listCollections.mockRejectedValue(new Error('down'))
    await wait(1300)
    // the failed background reload shows its warning but the numbers stay
    expect(on.find('[data-test="stat-documents"]').exists()).toBe(true)
  })
})
