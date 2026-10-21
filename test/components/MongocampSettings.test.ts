import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MongocampSettings from '../../src/runtime/components/MongocampSettings.vue'

enableAutoUnmount(afterEach)

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

const SECRETS = ['0123456789abcdef0123456789abcdef', 'hunter2-db-password', 'mongo-admin-user', '10.20.30.40']

// shaped like the real MongoCamp 1.5.10 payload; the secrets are the point of this file
const rawConfigurations = [
  { key: 'AUTH_SECRET', value: SECRETS[0], configType: 'String', needsRestartForActivation: true, comment: 'jwt secret' },
  { key: 'CONNECTION_PASSWORD', value: { value: SECRETS[1] }, configType: 'Option[String]', needsRestartForActivation: true, comment: '' },
  { key: 'CONNECTION_USERNAME', value: { value: SECRETS[2] }, configType: 'Option[String]', needsRestartForActivation: true, comment: '' },
  { key: 'CONNECTION_HOST', value: SECRETS[3], configType: 'String', needsRestartForActivation: true, comment: '' },
  { key: 'AUTH_TOKEN', value: true, configType: 'Boolean', needsRestartForActivation: false, comment: 'enable token auth' },
  { key: 'SERVER_PORT', value: 8080, configType: 'Long', needsRestartForActivation: true, comment: 'http port' },
]
const rawSettings = {
  routesPlugins: ['mongocamp-routes'],
  filePlugins: ['local-files'],
  ignoredPlugins: [],
  configurations: { AUTH_SECRET: SECRETS[0], CONNECTION_PASSWORD: { value: SECRETS[1] } },
}

const state = { isAdmin: true }
const mockSettings = vi.fn()
const mockListConfigurations = vi.fn()
const mockShutdown = vi.fn()
const mockUpdateConfiguration = vi.fn()

mockNuxtImport('useMongocampStorage', () => () => ({ value: { token: 'x', profile: { user: 'alice@example.com', isAdmin: state.isAdmin, roles: [] } } }))
mockNuxtImport('useMongocampClientApi', () => () => ({
  databaseApi: {},
  applicationApi: { settings: mockSettings, listConfigurations: mockListConfigurations, shutdown: mockShutdown, updateConfiguration: mockUpdateConfiguration },
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.isAdmin = true
  mockSettings.mockResolvedValue(rawSettings)
  mockListConfigurations.mockResolvedValue(rawConfigurations)
})

async function mountSettings() {
  const component = await mountSuspended(withUApp(MongocampSettings), { route: '/' })
  await flushPromises()
  return component
}

type Mounted = Awaited<ReturnType<typeof mountSettings>>
const bodyRows = (component: Mounted) => component.findAll('tbody tr')
const keys = (component: Mounted) => bodyRows(component).map(tr => tr.find('td span.font-mono').text())

describe('MongocampSettings', () => {
  it('lists the configuration sorted by key, with type and restart flag, and shows the plugin lists', async () => {
    const component = await mountSettings()

    expect(keys(component)).toEqual(['AUTH_SECRET', 'AUTH_TOKEN', 'CONNECTION_HOST', 'CONNECTION_PASSWORD', 'CONNECTION_USERNAME', 'SERVER_PORT'])
    const port = bodyRows(component).find(tr => tr.text().includes('SERVER_PORT'))!
    expect(port.text()).toContain('8080')
    expect(port.text()).toContain('Long')
    expect(port.text()).toContain('needs restart')
    expect(component.text()).toContain('mongocamp-routes')
    expect(component.text()).toContain('local-files')
  })

  it('shows plain values for switches even when the key mentions a token', async () => {
    const component = await mountSettings()

    expect(bodyRows(component).find(tr => tr.text().includes('AUTH_TOKEN'))!.text()).toContain('true')
  })

  it('hides every secret: neither the table, the plugin card nor the whole document ever contains one', async () => {
    const component = await mountSettings()

    for (const key of ['AUTH_SECRET', 'CONNECTION_PASSWORD', 'CONNECTION_USERNAME', 'CONNECTION_HOST']) {
      expect(bodyRows(component).find(tr => tr.text().includes(key))!.text()).toContain('••••••••')
    }
    const html = component.html() + document.body.innerHTML
    for (const secret of SECRETS) expect(html).not.toContain(secret)
  })

  it('cannot find a secret by searching for it', async () => {
    const component = await mountSettings()

    await component.find('input[type="text"], input:not([type])').setValue('hunter2')
    await flushPromises()

    expect(bodyRows(component).some(tr => tr.text().includes('CONNECTION_PASSWORD'))).toBe(false)
    expect(component.text()).toContain('No settings found')
  })

  it('filters by key, comment or visible value', async () => {
    const component = await mountSettings()
    const input = component.find('input')

    await input.setValue('port')
    await flushPromises()
    expect(keys(component)).toEqual(['SERVER_PORT'])

    await input.setValue('enable token')
    await flushPromises()
    expect(keys(component)).toEqual(['AUTH_TOKEN'])

    await input.setValue('8080')
    await flushPromises()
    expect(keys(component)).toEqual(['SERVER_PORT'])
  })

  it('pages through a long list on the client, ten at a time', async () => {
    mockListConfigurations.mockResolvedValue(Array.from({ length: 25 }, (_, i) => ({
      key: `KEY_${String(i).padStart(2, '0')}`, value: i, configType: 'Long', needsRestartForActivation: false, comment: '',
    })))
    const component = await mountSettings()

    expect(keys(component)).toHaveLength(10)
    expect(keys(component)[0]).toBe('KEY_00')

    await component.findAll('button').find(b => b.text() === '2')!.trigger('click')
    await flushPromises()

    expect(keys(component)[0]).toBe('KEY_10')
    expect(keys(component)).toHaveLength(10)
  })

  it('shows no pager when everything fits on one page', async () => {
    const component = await mountSettings()

    expect(component.findAll('button').some(b => b.text() === '2')).toBe(false)
  })

  it('shows the error alert with retry when loading fails, and retry loads it', async () => {
    mockListConfigurations.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'FetchError' }))
    const component = await mountSettings()

    expect(component.text()).toContain('Failed to load the server settings')
    expect(bodyRows(component).some(tr => tr.text().includes('SERVER_PORT'))).toBe(false)

    await component.findAll('button').find(b => b.text() === 'Retry')!.trigger('click')
    await flushPromises()

    expect(mockListConfigurations).toHaveBeenCalledTimes(2)
    expect(keys(component)).toContain('SERVER_PORT')
  })

  it('reloads on the refresh button', async () => {
    const component = await mountSettings()

    await component.find('[aria-label="Refresh"]').trigger('click')
    await flushPromises()

    expect(mockSettings).toHaveBeenCalledTimes(2)
    expect(mockListConfigurations).toHaveBeenCalledTimes(2)
  })

  it('tells a non-admin it is for administrators, and asks the server nothing', async () => {
    state.isAdmin = false
    const component = await mountSettings()

    expect(component.text()).toContain('Only administrators can view the server settings.')
    expect(mockSettings).not.toHaveBeenCalled()
    expect(mockListConfigurations).not.toHaveBeenCalled()
    expect(component.find('table').exists()).toBe(false)
  })

  it('never writes: no shutdown, no configuration update, whatever is clicked', async () => {
    const component = await mountSettings()

    for (const button of component.findAll('button')) await button.trigger('click')
    await flushPromises()

    expect(mockShutdown).not.toHaveBeenCalled()
    expect(mockUpdateConfiguration).not.toHaveBeenCalled()
  })
})
