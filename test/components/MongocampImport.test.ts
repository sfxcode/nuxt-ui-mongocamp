import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { DOMWrapper, enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import MongocampImport from '../../src/runtime/components/MongocampImport.vue'

// See test/components/MongocampCollectionData.test.ts for why these helpers are needed.
enableAutoUnmount(afterEach)

function withUApp(component: unknown) {
  return defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () => h(UApp, () => h(component as never, attrs))
    },
  })
}

function wait(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function modal() {
  return new DOMWrapper(document.body)
}

function button(label: string) {
  return modal().findAll('button').find(b => b.text() === label)
}

const mockInsertMany = vi.fn()

mockNuxtImport('useMongocampApi', () => {
  return () => ({ documentApi: { insertMany: mockInsertMany } })
})

beforeEach(() => {
  vi.clearAllMocks()
  mockInsertMany.mockResolvedValue({ wasAcknowledged: true })
})

async function mountAndOpen() {
  const component = await mountSuspended(withUApp(MongocampImport), { route: '/', props: { collectionName: 'people' } })
  await component.find('button[aria-label="Import documents"]').trigger('click')
  await wait()
  return component
}

async function chooseFile(name: string, text: string) {
  const input = modal().find('[data-testid="import-file-input"]')
  Object.defineProperty(input.element, 'files', { value: [new File([text], name)], configurable: true })
  await input.trigger('change')
  await wait(100)
}

function sentRows(call = 0): Record<string, unknown>[] {
  return mockInsertMany.mock.calls[call]![0].requestBody
}

function responseError(status: number, msg: string) {
  return Object.assign(new Error('Response returned an error code'), {
    name: 'ResponseError',
    response: new Response(JSON.stringify({ code: -1, msg }), { status }),
  })
}

describe('MongocampImport', () => {
  it('opens a dialog that asks for a file', async () => {
    await mountAndOpen()

    expect(modal().text()).toContain('Choose a JSON or CSV file')
    expect(modal().text()).toContain('Up to 10000 rows')
  })

  it('imports a CSV with inferred types, stamps metadata and reports the result', async () => {
    const component = await mountAndOpen()
    await chooseFile('people.csv', 'name,age,active\nAnn,31,yes\nCy,45,no\n')

    expect(modal().text()).toContain('2 of 2 rows ready to import')
    expect(modal().text()).toContain('Ann')

    await button('Import 2 rows')?.trigger('click')
    await wait()

    expect(mockInsertMany).toHaveBeenCalledTimes(1)
    expect(mockInsertMany.mock.calls[0]![0].collectionName).toBe('people')
    expect(sentRows()).toEqual([
      expect.objectContaining({ name: 'Ann', age: 31, active: true, metaData: expect.objectContaining({ createdBy: expect.any(String) }) }),
      expect.objectContaining({ name: 'Cy', age: 45, active: false }),
    ])
    expect(modal().text()).toContain('2 rows imported')
    expect(component.findComponent(MongocampImport).emitted('imported')).toEqual([[2]])
  })

  it('skips the rows with problems, says which ones, and sends only the valid rows', async () => {
    await mountAndOpen()
    await chooseFile('mixed.json', '[{"a":1},5,{"$set":1},{"a":2}]')

    expect(modal().text()).toContain('2 of 4 rows ready to import')
    expect(modal().text()).toContain('2 rows have problems and will be skipped')
    expect(modal().text()).toContain('Row 2: This entry is not an object')
    expect(modal().text()).toContain('Row 3, column $set: Field names must not start with $ or be __proto__')

    await button('Import 2 rows')?.trigger('click')
    await wait()

    expect(sentRows().map(r => r.a)).toEqual([1, 2])
  })

  it('unwraps extended JSON in a JSON file so dates arrive as plain ISO strings', async () => {
    await mountAndOpen()
    await chooseFile('dates.json', '[{"when":{"$date":"2024-01-01T00:00:00Z"}}]')
    await button('Import 1 row')?.trigger('click')
    await wait()

    expect(sentRows()[0]!.when).toBe('2024-01-01T00:00:00.000Z')
  })

  it('shows a file-level error for invalid JSON and offers nothing to import', async () => {
    await mountAndOpen()
    await chooseFile('broken.json', '[{')

    expect(modal().text()).toContain('The file is not valid JSON')
    expect((button('Import 0 rows') ?? button('Import 0 row'))?.attributes('disabled')).toBeDefined()
    expect(mockInsertMany).not.toHaveBeenCalled()
  })

  it('applies a column type chosen by the user', async () => {
    const component = await mountAndOpen()
    await chooseFile('codes.csv', 'code\n007\n')

    const select = component.findAllComponents(USelect).find(s => s.html().includes('aria-label="code"'))!
    expect((select.vm.$props as unknown as { modelValue: string }).modelValue).toBe('string')
    select.vm.$emit('update:modelValue', 'number')
    await wait()
    await button('Import 1 row')?.trigger('click')
    await wait()

    expect(sentRows()[0]!.code).toBe(7)
  })

  it('shows the server\'s reason for a rejected batch and does not claim it may be partial', async () => {
    mockInsertMany.mockRejectedValueOnce(responseError(400, 'Invalid value for: body'))
    const component = await mountAndOpen()
    await chooseFile('rows.json', '[{"a":1},{"a":2}]')
    await button('Import 2 rows')?.trigger('click')
    await wait()

    expect(modal().text()).toContain('Rows 1–2 could not be imported: Invalid value for: body')
    expect(modal().text()).not.toContain('may already have been added')
    expect(component.findComponent(MongocampImport).emitted('imported')).toBeUndefined()
  })

  it('warns before retrying a batch that failed with a server error, and retries only those rows', async () => {
    mockInsertMany.mockRejectedValueOnce(responseError(500, 'boom'))
    const component = await mountAndOpen()
    await chooseFile('rows.json', '[{"a":1},{"a":2}]')
    await button('Import 2 rows')?.trigger('click')
    await wait()

    expect(modal().text()).toContain('may already have been added')

    await button('Retry failed rows')?.trigger('click')
    await wait()

    expect(mockInsertMany).toHaveBeenCalledTimes(2)
    expect(sentRows(1).map(r => r.a)).toEqual([1, 2])
    expect(modal().text()).toContain('2 rows imported')
    expect(component.findComponent(MongocampImport).emitted('imported')).toEqual([[2]])
  })
})
