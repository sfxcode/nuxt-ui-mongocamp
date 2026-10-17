import { describe, it, expect } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { USelect } from '#components'
import MongocampFilterBuilder from '../../src/runtime/components/MongocampFilterBuilder.vue'
import type { FilterCondition, FilterFieldType, FilterGroup } from '../../src/runtime/utils/filterBuilder'

type Wrapper = VueWrapper

const fields: { key: string, type: FilterFieldType }[] = [
  { key: 'name', type: 'string' },
  { key: 'age', type: 'number' },
  { key: 'created', type: 'date-time' },
]

function condition(partial: Partial<FilterCondition> & Pick<FilterCondition, 'id' | 'field' | 'operator'>): FilterCondition {
  return partial
}

// The parent owns the v-model, so wire the update event back into the props like a real parent would.
async function mountBuilder(group: FilterGroup, builderFields = fields) {
  const holder = {} as { wrapper: Wrapper }
  let latest = group
  const wrapper = await mountSuspended(MongocampFilterBuilder, {
    route: '/',
    props: {
      'fields': builderFields,
      'modelValue': group,
      'onUpdate:modelValue': (value: FilterGroup) => {
        latest = value
        holder.wrapper.setProps({ modelValue: value })
      },
    },
  })
  holder.wrapper = wrapper
  return { wrapper, latest: () => latest }
}

// Reka UI's select commits through pointer events happy-dom doesn't reproduce faithfully, so drive the
// component's own v-model contract; the real interaction is checked in a browser.
function selects(wrapper: Wrapper, label: string) {
  return wrapper.findAllComponents(USelect).filter(select => select.html().includes(`aria-label="${label}"`))
}

function button(wrapper: Wrapper, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)
}

describe('MongocampFilterBuilder', () => {
  it('renders one row per condition, with value inputs that follow the operator', async () => {
    const { wrapper } = await mountBuilder({
      match: 'all',
      conditions: [
        condition({ id: 'a', field: 'name', operator: 'contains' }),
        condition({ id: 'b', field: 'age', operator: 'between' }),
        condition({ id: 'c', field: 'name', operator: 'isNotEmpty' }),
      ],
    })

    expect(selects(wrapper, 'Field')).toHaveLength(3)
    expect(selects(wrapper, 'Operator')).toHaveLength(3)
    // contains → 1 input, between → 2, exists → none
    expect(wrapper.findAll('input')).toHaveLength(3)
  })

  it('resets the operator and values when the new field type does not support them, but keeps a valid operator', async () => {
    const { wrapper, latest } = await mountBuilder({
      match: 'all',
      conditions: [
        condition({ id: 'a', field: 'name', operator: 'contains', value: 'ali' }),
        condition({ id: 'b', field: 'name', operator: 'equals', value: 'bob' }),
      ],
    })

    selects(wrapper, 'Field')[0]!.vm.$emit('update:modelValue', 'age')
    await wrapper.vm.$nextTick() // let the parent's v-model round-trip, as it would between two real clicks
    selects(wrapper, 'Field')[1]!.vm.$emit('update:modelValue', 'age')
    await wrapper.vm.$nextTick()

    // 'contains' doesn't exist for numbers → first number operator, value cleared
    expect(latest().conditions[0]).toMatchObject({ field: 'age', operator: 'equals', value: '' })
    // 'equals' does → kept, value still cleared (a name is not an age)
    expect(latest().conditions[1]).toMatchObject({ field: 'age', operator: 'equals', value: '' })
  })

  it('Apply emits the finished Lucene query from the edited values', async () => {
    const { wrapper } = await mountBuilder({
      match: 'all',
      conditions: [condition({ id: 'a', field: 'name', operator: 'contains' })],
    })

    await wrapper.find('input').setValue('ali')
    await button(wrapper, 'Apply filters')!.trigger('click')

    expect(wrapper.emitted('apply')).toEqual([['name:*ali*']])
    expect(wrapper.text()).toContain('name:*ali*') // the query preview
  })

  it('combines rows with the chosen match mode, and only offers the choice with two or more rows', async () => {
    const one = await mountBuilder({ match: 'all', conditions: [condition({ id: 'a', field: 'name', operator: 'contains', value: 'a' })] })
    expect(selects(one.wrapper, 'Match')).toHaveLength(0)

    const { wrapper } = await mountBuilder({
      match: 'all',
      conditions: [
        condition({ id: 'a', field: 'name', operator: 'contains', value: 'a' }),
        condition({ id: 'b', field: 'age', operator: 'equals', value: '30' }),
      ],
    })
    await button(wrapper, 'Apply filters')!.trigger('click')
    selects(wrapper, 'Match')[0]!.vm.$emit('update:modelValue', 'any')
    await wrapper.vm.$nextTick()
    await button(wrapper, 'Apply filters')!.trigger('click')

    expect(wrapper.emitted('apply')).toEqual([['(name:*a* AND age:30)'], ['(name:*a* OR age:30)']])
  })

  it('tells the user incomplete rows are ignored, and does not apply them', async () => {
    const { wrapper } = await mountBuilder({
      match: 'all',
      conditions: [condition({ id: 'a', field: 'name', operator: 'contains', value: '' })],
    })

    expect(wrapper.text()).toContain('1 incomplete condition is ignored')
    await button(wrapper, 'Apply filters')!.trigger('click')
    expect(wrapper.emitted('apply')).toEqual([['']])
  })

  it('adds a row defaulting to the first field and its first operator, and removes rows', async () => {
    const { wrapper, latest } = await mountBuilder({ match: 'all', conditions: [] })
    expect(wrapper.text()).toContain('No conditions yet')

    await button(wrapper, 'Add condition')!.trigger('click')
    await button(wrapper, 'Add condition')!.trigger('click')
    expect(latest().conditions).toHaveLength(2)
    expect(latest().conditions[0]).toMatchObject({ field: 'name', operator: 'contains' })
    expect(latest().conditions[0]!.id).not.toBe(latest().conditions[1]!.id)

    await wrapper.findAll('[aria-label="Remove condition"]')[0]!.trigger('click')
    expect(latest().conditions).toHaveLength(1)
  })

  it('Clear all empties the rows and applies "no filter" straight away', async () => {
    const { wrapper, latest } = await mountBuilder({
      match: 'all',
      conditions: [condition({ id: 'a', field: 'name', operator: 'contains', value: 'a' })],
    })

    await button(wrapper, 'Clear all')!.trigger('click')

    expect(latest().conditions).toEqual([])
    expect(wrapper.emitted('apply')).toEqual([['']])
  })

  it('says so, and offers no controls, when there are no fields to filter on', async () => {
    const { wrapper } = await mountBuilder({ match: 'all', conditions: [] }, [])

    expect(wrapper.text()).toContain('No fields to filter on yet')
    expect(button(wrapper, 'Add condition')).toBeUndefined()
  })
})
