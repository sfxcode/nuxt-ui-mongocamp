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

const clusterNode = { name: 'node-1', siteMaster: false, siteAddress: false, multicast: false, coordinator: true }

const state = { isAdmin: true }
const mockSettings = vi.fn()
const mockListConfigurations = vi.fn()
const mockViewCluster = vi.fn()
const mockShutdown = vi.fn()
const mockUpdateConfiguration = vi.fn()

mockNuxtImport('useMongocampStorage', () => () => ({ value: { token: 'x', profile: { user: 'alice@example.com', isAdmin: state.isAdmin, roles: [] } } }))
mockNuxtImport('useMongocampClientApi', () => () => ({
  databaseApi: {},
  systemApi: { viewCluster: mockViewCluster },
  applicationApi: { settings: mockSettings, listConfigurations: mockListConfigurations, shutdown: mockShutdown, updateConfiguration: mockUpdateConfiguration },
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.isAdmin = true
  mockSettings.mockResolvedValue(rawSettings)
  mockListConfigurations.mockResolvedValue(rawConfigurations)
  mockViewCluster.mockResolvedValue({ coordinator: clusterNode, members: [clusterNode] })
})

async function mountSettings(props: Record<string, unknown> = {}) {
  const component = await mountSuspended(withUApp(MongocampSettings), { route: '/', props })
  await flushPromises()
  return component
}

type Mounted = Awaited<ReturnType<typeof mountSettings>>
const bodyRows = (component: Mounted) => component.findAll('tbody tr')
const keys = (component: Mounted) => bodyRows(component).map(tr => tr.find('td span.font-mono').text())

describe('MongocampSettings', () => {
  describe('hide props', () => {
    it('hideHeading and hideRefresh remove the header row', async () => {
      const component = await mountSettings({ hideHeading: true, hideRefresh: true })

      expect(component.find('h2').exists()).toBe(false)
      expect(component.find('button[aria-label="Refresh"]').exists()).toBe(false)
    })

    it('hideHeading alone keeps the refresh button', async () => {
      const component = await mountSettings({ hideHeading: true })

      expect(component.find('h2').exists()).toBe(false)
      expect(component.find('button[aria-label="Refresh"]').exists()).toBe(true)
    })

    it('hidePlugins hides the plugin card and skips the plugins request', async () => {
      const component = await mountSettings({ hidePlugins: true })

      expect(mockSettings).not.toHaveBeenCalled()
      expect(component.text()).not.toContain('mongocamp-routes')
      expect(bodyRows(component)).toHaveLength(6)
    })

    it('hideConfigurations hides table, search and note and skips the configuration request', async () => {
      const component = await mountSettings({ hideConfigurations: true })

      expect(mockListConfigurations).not.toHaveBeenCalled()
      expect(component.find('table').exists()).toBe(false)
      expect(component.find('input').exists()).toBe(false)
      expect(component.text()).toContain('mongocamp-routes')
    })

    it('shows the cluster members with a coordinator badge', async () => {
      const component = await mountSettings()

      expect(component.text()).toContain('Cluster')
      expect(component.text()).toContain('node-1')
      expect(component.text()).toContain('coordinator')
    })

    it('hideCluster hides the card and skips the cluster request', async () => {
      const component = await mountSettings({ hideCluster: true })

      expect(mockViewCluster).not.toHaveBeenCalled()
      expect(component.text()).not.toContain('node-1')
    })

    it('a failing cluster request only hides the card, the rest still loads', async () => {
      mockViewCluster.mockRejectedValue(new Error('boom'))
      const component = await mountSettings()

      expect(component.text()).not.toContain('node-1')
      expect(component.text()).toContain('mongocamp-routes')
      expect(bodyRows(component)).toHaveLength(6)
    })

    it('hideSearch removes only the search box', async () => {
      const component = await mountSettings({ hideSearch: true })

      expect(component.find('input').exists()).toBe(false)
      expect(component.find('table').exists()).toBe(true)
    })

    it('hideMaskedNote removes only the note', async () => {
      const withNote = await mountSettings()
      const note = withNote.find('p.text-xs.text-dimmed').text()
      expect(note).not.toBe('')

      const component = await mountSettings({ hideMaskedNote: true })
      expect(component.text()).not.toContain(note)
      expect(component.find('input').exists()).toBe(true)
    })
  })

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

  it('has the page contract of the list components: refresh() and a toolbar slot, also with the reload hidden', async () => {
    const exposed: { current: { refresh?: () => Promise<unknown> } | null } = { current: null }
    const component = await mountSuspended(defineComponent({
      setup: () => () => h(UApp, () => h(
        MongocampSettings,
        { hideHeading: true, hideRefresh: true, ref: (el: unknown) => { exposed.current = el as typeof exposed.current } },
        { toolbar: () => h('button', { 'data-test': 'page-button' }, 'Mine') },
      )),
    }), { route: '/' })
    await flushPromises()
    expect(component.find('[data-test="page-button"]').exists()).toBe(true)
    expect(component.find('button[aria-label="Refresh"]').exists()).toBe(false)

    const calls = mockListConfigurations.mock.calls.length
    await exposed.current!.refresh!()
    expect(mockListConfigurations.mock.calls.length).toBe(calls + 1)
  })

  it('makes the configuration table a named, focusable region, since long values scroll it sideways', async () => {
    const component = await mountSettings()
    const region = component.find('[role="region"]')
    expect(region.attributes('aria-label')).toBe('Server configuration')
    expect(region.attributes('tabindex')).toBe('0')
    expect(region.find('table').exists()).toBe(true)
  })

  describe('grant status hint', () => {
    const withGrantStatus = (status: number) => [...rawConfigurations, { key: 'AUTH_GRANT_DENIED_STATUS', value: status, configType: 'Long', needsRestartForActivation: false, comment: '' }]

    it('explains that a missing grant is answered with 401, and what the module does about it', async () => {
      mockListConfigurations.mockResolvedValue(withGrantStatus(401))
      const component = await mountSettings()

      const hint = component.find('[data-test="grant-hint"]')
      expect(hint.text()).toContain('A missing grant is answered with 401')
      expect(hint.text()).toContain('AUTH_GRANT_DENIED_STATUS to 403')
    })

    it('says nothing for 403, without the setting, or with hideGrantHint', async () => {
      mockListConfigurations.mockResolvedValue(withGrantStatus(403))
      expect((await mountSettings()).find('[data-test="grant-hint"]').exists()).toBe(false)

      mockListConfigurations.mockResolvedValue(rawConfigurations)
      expect((await mountSettings()).find('[data-test="grant-hint"]').exists()).toBe(false)

      mockListConfigurations.mockResolvedValue(withGrantStatus(401))
      expect((await mountSettings({ hideGrantHint: true })).find('[data-test="grant-hint"]').exists()).toBe(false)
    })
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
    expect(mockViewCluster).not.toHaveBeenCalled()
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
