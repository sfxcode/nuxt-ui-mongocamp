import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampUsers from '../../src/runtime/components/MongocampUsers.vue'
import MongocampRoles from '../../src/runtime/components/MongocampRoles.vue'
import MongocampRoleGrants from '../../src/runtime/components/MongocampRoleGrants.vue'
import MongocampJobs from '../../src/runtime/components/MongocampJobs.vue'
import MongocampDatabases from '../../src/runtime/components/MongocampDatabases.vue'
import MongocampDashboard from '../../src/runtime/components/MongocampDashboard.vue'
import MongocampServerOverview from '../../src/runtime/components/MongocampServerOverview.vue'

enableAutoUnmount(afterEach)

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))

// Components that call admin endpoints on mount show "administrators only" for a signed-in non-admin, without a request.
const session: { isAdmin: boolean | undefined } = { isAdmin: false }
const calls: string[] = []

// every API method answers an empty list and is recorded
const recorder = (name: string) => new Proxy({}, {
  get: (_target, method) => (...args: unknown[]) => {
    void args
    calls.push(`${name}.${String(method)}`)
    // the cluster view is an object, everything else a list
    return Promise.resolve(method === 'viewCluster' ? { coordinator: { name: 'node-1' }, members: [] } : [])
  },
})

mockNuxtImport('useMongocampStorage', () => () => ({ value: { profile: { user: 'carol@example.com', isAdmin: session.isAdmin, roles: [] } } }))
mockNuxtImport('useMongocampApi', () => () => ({
  adminApi: recorder('adminApi'),
  collectionApi: recorder('collectionApi'),
  jobApi: recorder('jobApi'),
  databaseApi: recorder('databaseApi'),
  systemApi: recorder('systemApi'),
  documentApi: recorder('documentApi'),
}))

beforeEach(() => {
  calls.length = 0
  session.isAdmin = false
})

async function mountIt(component: unknown, props: Record<string, unknown> = {}) {
  const wrapper = await mountSuspended(defineComponent({ setup: () => () => h(UApp, () => h(component as never, props)) }), { route: '/' })
  await wait(120)
  return wrapper
}

const CASES: Array<[string, unknown, Record<string, unknown>]> = [
  ['MongocampUsers', MongocampUsers, {}],
  ['MongocampRoles', MongocampRoles, {}],
  ['MongocampRoleGrants', MongocampRoleGrants, { roleName: 'support' }],
  ['MongocampJobs', MongocampJobs, { autoRefresh: 1 }],
  ['MongocampDatabases', MongocampDatabases, {}],
  ['MongocampDashboard', MongocampDashboard, { autoRefresh: 1 }],
  ['MongocampServerOverview', MongocampServerOverview, { autoRefresh: 1 }],
]

describe.each(CASES)('%s for a non-admin', (_name, component, props) => {
  it('says administrators only and sends no request, not even on an auto-refresh', async () => {
    const wrapper = await mountIt(component, props)
    await wait(1300)

    expect(wrapper.find('[data-test="admin-only"]').text()).toContain('This area is for administrators only.')
    expect(calls).toEqual([])
  })

  it('works as before for an administrator', async () => {
    session.isAdmin = true
    const wrapper = await mountIt(component, props)

    expect(wrapper.find('[data-test="admin-only"]').exists()).toBe(false)
    expect(calls.length).toBeGreaterThan(0)
  })
})
