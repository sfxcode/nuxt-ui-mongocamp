import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampErrorAlert from '../../src/runtime/components/MongocampErrorAlert.vue'

const fetchError = Object.assign(new Error('The request failed'), { name: 'FetchError' })

describe('MongocampErrorAlert', () => {
  it('renders nothing when there is no error', async () => {
    const component = await mountSuspended(MongocampErrorAlert, { props: { error: null }, route: '/' })
    expect(component.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows a readable message instead of the raw FetchError text, and emits retry', async () => {
    const component = await mountSuspended(MongocampErrorAlert, { props: { error: fetchError }, route: '/' })

    expect(component.text()).toContain('could not be reached')
    expect(component.text()).not.toContain('The request failed')

    await component.findAll('button').find(b => b.text() === 'Retry')?.trigger('click')
    expect(component.emitted('retry')).toHaveLength(1)
  })

  it('offers a login link instead of retry when the session is gone (401)', async () => {
    const error = { name: 'ResponseError', response: { status: 401 } }
    const component = await mountSuspended(MongocampErrorAlert, { props: { error, loginPath: '/login' }, route: '/' })

    expect(component.findAll('button').some(b => b.text() === 'Retry')).toBe(false)
    expect(component.find('a[href="/login"]').text()).toContain('Log in again')
  })

  it('says the filter was rejected, instead of blaming the network, and offers to clear it', async () => {
    const component = await mountSuspended(MongocampErrorAlert, { props: { error: fetchError, filterRejected: true }, route: '/' })

    expect(component.text()).toContain('The filter could not be applied')
    expect(component.text()).not.toContain('could not be reached')
    expect(component.findAll('button').some(b => b.text() === 'Retry')).toBe(false)

    await component.findAll('button').find(b => b.text() === 'Clear filters')?.trigger('click')
    expect(component.emitted('clearFilters')).toHaveLength(1)
  })
})
