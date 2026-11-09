import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampDatabases from '../../src/runtime/components/MongocampDatabases.vue'

// these components are for administrators: the gate (useMongocampAdminGate) lets an admin profile through
mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'admin@example.com', isAdmin: true, roles: [] } } }))

enableAutoUnmount(afterEach)

const mockInfos = vi.fn()
const mockCollections = vi.fn()

mockNuxtImport('useMongocampSystem', () => () => ({ getDatabaseInfos: mockInfos, listCollectionsByDatabase: mockCollections }))

beforeEach(() => {
  vi.resetAllMocks()
  mockCollections.mockResolvedValue(['a', 'b'])
})

async function mountDatabases() {
  const c = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(MongocampDatabases)) }), { route: '/' })
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 50))
  return c
}

describe('MongocampDatabases — chart', () => {
  it('charts the size per database, biggest first, in a collapsed section', async () => {
    mockInfos.mockResolvedValue([{ name: 'small', sizeOnDisk: 2048, empty: false }, { name: 'big', sizeOnDisk: 1048576, empty: false }])
    const c = await mountDatabases()
    const chart = c.find('[data-testid="databases-chart"]')
    expect(chart.exists()).toBe(true)
    expect(chart.attributes('open')).toBeUndefined()
    const rows = chart.findAll('[data-test="chart-table"] tbody tr').map(tr => tr.findAll('td').map(td => td.text()))
    expect(rows).toEqual([['big', '1.0 MB'], ['small', '2.0 KB']])
  })

  it('has no chart for a single database', async () => {
    mockInfos.mockResolvedValue([{ name: 'only', sizeOnDisk: 2048, empty: false }])
    const c = await mountDatabases()
    expect(c.find('[data-testid="databases-chart"]').exists()).toBe(false)
  })
})
