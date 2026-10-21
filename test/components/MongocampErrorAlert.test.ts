import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MongocampErrorAlert from '../../src/runtime/components/MongocampErrorAlert.vue'

const fetchError = Object.assign(new Error('The request failed'), { name: 'FetchError' })
const unauthorized = { name: 'ResponseError', response: { status: 401 } }

const order: string[] = []
const mockDiagnose = vi.fn()
const mockInvalidate = vi.fn()
const mockNavigate = vi.fn()

mockNuxtImport('useMongocampSession', () => () => ({ diagnoseFailure: mockDiagnose, invalidateSession: mockInvalidate }))
mockNuxtImport('navigateTo', () => (to: string) => mockNavigate(to))

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  mockDiagnose.mockResolvedValue('unknown')
  mockInvalidate.mockImplementation(async () => {
    order.push('invalidate')
  })
  mockNavigate.mockImplementation((to: string) => {
    order.push(`navigate:${to}`)
  })
})

async function mountAlert(props: { error: unknown, loginPath?: string, filterRejected?: boolean }) {
  const component = await mountSuspended(MongocampErrorAlert, { props, route: '/' })
  await flushPromises()
  return component
}

const button = (component: Awaited<ReturnType<typeof mountAlert>>, label: string) => component.findAll('button').find(b => b.text() === label)

describe('MongocampErrorAlert', () => {
  it('renders nothing when there is no error, and asks nobody anything', async () => {
    const component = await mountAlert({ error: null })

    expect(component.find('[role="alert"]').exists()).toBe(false)
    expect(mockDiagnose).not.toHaveBeenCalled()
  })

  it('shows a readable message instead of the raw FetchError text, and emits retry, when the diagnosis is inconclusive', async () => {
    const component = await mountAlert({ error: fetchError })

    expect(component.text()).toContain('could not be reached')
    expect(component.text()).not.toContain('The request failed')

    await button(component, 'Retry')?.trigger('click')
    expect(component.emitted('retry')).toHaveLength(1)
  })

  describe('a network failure, diagnosed', () => {
    it.each(['rejected', 'expired'] as const)('%s: says the session has ended and offers to log in again instead of retrying', async (state) => {
      mockDiagnose.mockResolvedValue(state)
      const component = await mountAlert({ error: fetchError })

      expect(component.text()).toContain('Your session has expired')
      expect(component.text()).not.toContain('could not be reached')
      expect(button(component, 'Retry')).toBeUndefined()
      expect(button(component, 'Log in again')).toBeDefined()
    })

    it('active: says the server refused this request while the session is fine, and keeps Retry', async () => {
      mockDiagnose.mockResolvedValue('active')
      const component = await mountAlert({ error: fetchError })

      expect(component.text()).toContain('your session is valid, but it refused this request')
      expect(button(component, 'Retry')).toBeDefined()
      expect(button(component, 'Log in again')).toBeUndefined()
    })

    it('unknown (for instance the server is down): keeps the plain network message with Retry', async () => {
      mockDiagnose.mockResolvedValue('unknown')
      const component = await mountAlert({ error: fetchError })

      expect(component.text()).toContain('could not be reached')
      expect(button(component, 'Log in again')).toBeUndefined()
    })

    it('survives a diagnosis that throws', async () => {
      mockDiagnose.mockRejectedValue(new Error('boom'))
      const component = await mountAlert({ error: fetchError })

      expect(component.text()).toContain('could not be reached')
    })

    it('ignores a slow answer for an error that has since been replaced', async () => {
      let resolveFirst!: (v: string) => void
      mockDiagnose.mockReturnValueOnce(new Promise<string>((r) => {
        resolveFirst = r
      }))
      const component = await mountAlert({ error: fetchError })

      mockDiagnose.mockResolvedValue('active')
      await component.setProps({ error: Object.assign(new Error('second'), { name: 'FetchError' }) })
      await flushPromises()
      resolveFirst('rejected')
      await flushPromises()

      expect(component.text()).toContain('your session is valid, but it refused this request')
      expect(button(component, 'Log in again')).toBeUndefined()
    })
  })

  describe('"Log in again"', () => {
    it('clears the session first and only then navigates to loginPath', async () => {
      mockDiagnose.mockResolvedValue('rejected')
      const component = await mountAlert({ error: fetchError, loginPath: '/login' })

      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()

      expect(order).toEqual(['invalidate', 'navigate:/login'])
    })

    it('does not navigate when clearing the session is still pending', async () => {
      mockDiagnose.mockResolvedValue('rejected')
      let release!: () => void
      mockInvalidate.mockImplementation(() => new Promise<void>((r) => {
        release = r
      }))
      const component = await mountAlert({ error: fetchError, loginPath: '/login' })

      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()
      expect(mockNavigate).not.toHaveBeenCalled()

      release()
      await flushPromises()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })

    it('falls back to the module\'s loginPath option when no loginPath prop is given', async () => {
      mockDiagnose.mockResolvedValue('rejected')
      const component = await mountAlert({ error: fetchError })

      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()

      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('a readable 401 gets the same button — and the same order — without any diagnosis', async () => {
      const component = await mountAlert({ error: unauthorized, loginPath: '/login' })

      expect(button(component, 'Retry')).toBeUndefined()
      await button(component, 'Log in again')!.trigger('click')
      await flushPromises()

      expect(mockDiagnose).not.toHaveBeenCalled()
      expect(order).toEqual(['invalidate', 'navigate:/login'])
    })
  })

  it('does not diagnose a 403 or a plain error: they are not about the session', async () => {
    await mountAlert({ error: { name: 'ResponseError', response: { status: 403 } } })
    await mountAlert({ error: new Error('boom') })

    expect(mockDiagnose).not.toHaveBeenCalled()
  })

  it('says the filter was rejected, instead of blaming the network, and offers to clear it — without diagnosing', async () => {
    const component = await mountAlert({ error: fetchError, filterRejected: true })

    expect(component.text()).toContain('The filter could not be applied')
    expect(component.text()).not.toContain('could not be reached')
    expect(button(component, 'Retry')).toBeUndefined()
    expect(mockDiagnose).not.toHaveBeenCalled()

    await button(component, 'Clear filters')?.trigger('click')
    expect(component.emitted('clearFilters')).toHaveLength(1)
  })
})
