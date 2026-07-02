import { describe, it, expect } from 'vitest'
import { columnsToFormKitSchema, documentToFormData, formDataToDocument } from '../src/runtime/composables/useMongocampDynamicForm'
import type { FormKitSchemaNode } from '../src/runtime/composables/useMongocampDynamicForm'
import type { ColumnDefinition } from '../src/runtime/composables/useMongocampSchema'

function column(overrides: Partial<ColumnDefinition>): ColumnDefinition {
  return {
    columnName: 'field',
    columnKey: 'field',
    columnType: 'string',
    required: false,
    ...overrides,
  }
}

// A 'group' node has no outer element of its own, so object columns are wrapped in a
// top-padding `$el: 'div'` — unwrap it to reach the actual group node in assertions.
function unwrapGroup(entry: FormKitSchemaNode): FormKitSchemaNode {
  return entry.$el ? entry.children![0]! : entry
}

// documentToFormData unwraps date-time fields to an @internationalized/date value (required by
// nuxtUIInputDate — a plain string crashes it), not a plain string — toAbsoluteString() round-trips
// to the same UTC instant regardless of the local timezone used internally, so this is deterministic.
function isoOf(value: unknown): string {
  return (value as { toAbsoluteString: () => string }).toAbsoluteString()
}

describe('columnsToFormKitSchema — scalar mapping', () => {
  it('maps string to nuxtUIInput', () => {
    const schema = columnsToFormKitSchema([column({ columnType: 'string' })])
    expect(schema[0]?.$formkit).toBe('nuxtUIInput')
  })

  it('maps number to nuxtUIInputNumber', () => {
    const schema = columnsToFormKitSchema([column({ columnType: 'number' })])
    expect(schema[0]?.$formkit).toBe('nuxtUIInputNumber')
  })

  it('maps boolean to nuxtUISwitch', () => {
    const schema = columnsToFormKitSchema([column({ columnType: 'boolean' })])
    expect(schema[0]?.$formkit).toBe('nuxtUISwitch')
  })

  it('maps date-time to nuxtUIInputDate', () => {
    const schema = columnsToFormKitSchema([column({ columnType: 'date-time' })])
    expect(schema[0]?.$formkit).toBe('nuxtUIInputDate')
  })

  it('skips array columns', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'arr', columnType: 'array' }),
    ])
    expect(schema).toEqual([])
  })

  it('adds validation: required when required is true', () => {
    const schema = columnsToFormKitSchema([column({ required: true })])
    expect(schema[0]?.validation).toBe('required')
  })

  it('omits validation key entirely when required is false', () => {
    const schema = columnsToFormKitSchema([column({ required: false })])
    expect(schema[0]).not.toHaveProperty('validation')
  })

  it('uses columnKey (not columnName) as the schema node name', () => {
    const schema = columnsToFormKitSchema([column({ columnKey: 'field_key', columnName: 'Field Label' })])
    expect(schema[0]?.name).toBe('field_key')
    expect(schema[0]?.label).toBe('Field Label')
  })

  it('round-trips a columnKey containing a space or dot without crashing or stripping it', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'nested.field', columnName: 'nested.field' }),
      column({ columnKey: 'field with space', columnName: 'field with space' }),
    ])
    expect(schema[0]?.name).toBe('nested.field')
    expect(schema[1]?.name).toBe('field with space')
  })

  it('produces an empty schema array for an empty columns array', () => {
    expect(columnsToFormKitSchema([])).toEqual([])
  })
})

describe('columnsToFormKitSchema — nested object mapping', () => {
  it('maps an object column with scalar children to a group node', () => {
    const schema = columnsToFormKitSchema([
      column({
        columnKey: 'address',
        columnName: 'Address',
        columnType: 'object',
        children: [
          column({ columnKey: 'street', columnName: 'Street', columnType: 'string' }),
          column({ columnKey: 'zip', columnName: 'Zip', columnType: 'number' }),
        ],
      }),
    ])

    const group = unwrapGroup(schema[0]!)
    expect(group.$formkit).toBe('group')
    expect(group.name).toBe('address')
    expect(group.label).toBe('Address')

    const children = group.children!
    expect(children).toHaveLength(2)
    expect(children[0]?.$formkit).toBe('nuxtUIInput')
    expect(children[0]?.name).toBe('street')
    expect(children[1]?.$formkit).toBe('nuxtUIInputNumber')
    expect(children[1]?.name).toBe('zip')
  })

  it('wraps the group in a top-padded, gapped container, since group itself renders no element', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'address', columnType: 'object', children: [] }),
    ])
    expect(schema[0]?.$el).toBe('div')
    expect(schema[0]?.attrs?.class).toContain('pt-4')
    expect(schema[0]?.attrs?.class).toContain('gap-3')
  })

  it('recurses through a nested object-within-object (3 levels)', () => {
    const schema = columnsToFormKitSchema([
      column({
        columnKey: 'level1',
        columnType: 'object',
        children: [
          column({
            columnKey: 'level2',
            columnType: 'object',
            children: [
              column({ columnKey: 'level3', columnType: 'string' }),
            ],
          }),
        ],
      }),
    ])

    const level1 = unwrapGroup(schema[0]!)
    const level2 = unwrapGroup(level1.children![0]!)
    expect(level2.$formkit).toBe('group')
    expect(level2.name).toBe('level2')

    const level3 = level2.children!
    expect(level3[0]?.$formkit).toBe('nuxtUIInput')
    expect(level3[0]?.name).toBe('level3')
  })

  it('produces an empty children array for an object column with no children', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'empty', columnType: 'object' }),
    ])
    const group = unwrapGroup(schema[0]!)
    expect(group.$formkit).toBe('group')
    expect(group.children).toEqual([])
  })
})

describe('columnsToFormKitSchema — scalar array mapping', () => {
  it('maps a string array to nuxtUIInputTags', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'tags', columnType: 'array', arrayItemType: 'string' }),
    ])
    expect(schema[0]?.$formkit).toBe('nuxtUIInputTags')
    expect(schema[0]?.name).toBe('tags')
  })

  it('maps a number array to nuxtUIRepeater wrapping one nuxtUIInputNumber', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'scores', columnType: 'array', arrayItemType: 'number' }),
    ])
    expect(schema[0]?.$formkit).toBe('nuxtUIRepeater')
    const children = schema[0]?.children as ReturnType<typeof columnsToFormKitSchema>
    expect(children).toHaveLength(1)
    expect(children[0]?.$formkit).toBe('nuxtUIInputNumber')
  })

  it('enables the repeater add/clone/delete buttons and provides a typed newItem default', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'scores', columnType: 'array', arrayItemType: 'number' }),
    ])
    expect(schema[0]?.alwaysDisplayInsertButton).toBe(true)
    expect(schema[0]?.displayAddButton).toBe(true)
    expect(schema[0]?.displayCloneButton).toBe(true)
    expect(schema[0]?.displayDeleteButton).toBe(true)
    expect(schema[0]?.newItem).toEqual({ value: 0 })
  })

  it('lays out the repeater row with a right-aligned button group and drag handle', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'scores', columnType: 'array', arrayItemType: 'number' }),
    ])
    expect(schema[0]?.listClass).toContain('gap-3')
    expect(schema[0]?.listItemClass).toContain('flex')
    expect(schema[0]?.listItemClass).toContain('shadow-sm')
    expect(schema[0]?.buttonGroupClass).toContain('ml-auto')
    expect(schema[0]?.displayDragHandle).toBe(true)
    expect(schema[0]?.draggable).toBe(true)
    expect(schema[0]?.hideMoveButtons).toBe(true)
  })

  it('maps a boolean array to nuxtUIRepeater wrapping one nuxtUISwitch', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'flags', columnType: 'array', arrayItemType: 'boolean' }),
    ])
    expect(schema[0]?.$formkit).toBe('nuxtUIRepeater')
    const children = schema[0]?.children as ReturnType<typeof columnsToFormKitSchema>
    expect(children[0]?.$formkit).toBe('nuxtUISwitch')
  })

  it('maps a date-time array to nuxtUIRepeater wrapping one nuxtUIInputDate', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'dates', columnType: 'array', arrayItemType: 'date-time' }),
    ])
    expect(schema[0]?.$formkit).toBe('nuxtUIRepeater')
    const children = schema[0]?.children as ReturnType<typeof columnsToFormKitSchema>
    expect(children[0]?.$formkit).toBe('nuxtUIInputDate')
  })

  it('falls back to nuxtUIInputTags for arrayItemType unknown', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'mystery', columnType: 'array', arrayItemType: 'unknown' }),
    ])
    expect(schema[0]?.$formkit).toBe('nuxtUIInputTags')
  })

  it('adds validation: required on the outer array node, not the inner repeater child', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'scores', columnType: 'array', arrayItemType: 'number', required: true }),
    ])
    expect(schema[0]?.validation).toBe('required')
    const children = schema[0]?.children as ReturnType<typeof columnsToFormKitSchema>
    expect(children[0]).not.toHaveProperty('validation')
  })
})

describe('columnsToFormKitSchema — array-of-objects mapping', () => {
  it('maps arrayItemType object with 2 scalar children to nuxtUIRepeater', () => {
    const schema = columnsToFormKitSchema([
      column({
        columnKey: 'items',
        columnName: 'Items',
        columnType: 'array',
        arrayItemType: 'object',
        children: [
          column({ columnKey: 'sku', columnName: 'SKU', columnType: 'string' }),
          column({ columnKey: 'qty', columnName: 'Qty', columnType: 'number' }),
        ],
      }),
    ])

    expect(schema[0]?.$formkit).toBe('nuxtUIRepeater')
    expect(schema[0]?.name).toBe('items')
    const children = schema[0]?.children as ReturnType<typeof columnsToFormKitSchema>
    expect(children).toHaveLength(2)
    expect(children[0]?.$formkit).toBe('nuxtUIInput')
    expect(children[0]?.name).toBe('sku')
    expect(children[1]?.$formkit).toBe('nuxtUIInputNumber')
    expect(children[1]?.name).toBe('qty')
  })

  it('enables the repeater add/clone/delete buttons and provides a per-field-typed newItem default', () => {
    const schema = columnsToFormKitSchema([
      column({
        columnKey: 'items',
        columnType: 'array',
        arrayItemType: 'object',
        children: [
          column({ columnKey: 'sku', columnType: 'string' }),
          column({ columnKey: 'qty', columnType: 'number' }),
          column({ columnKey: 'active', columnType: 'boolean' }),
        ],
      }),
    ])
    expect(schema[0]?.alwaysDisplayInsertButton).toBe(true)
    expect(schema[0]?.displayAddButton).toBe(true)
    expect(schema[0]?.displayCloneButton).toBe(true)
    expect(schema[0]?.displayDeleteButton).toBe(true)
    expect(schema[0]?.newItem).toEqual({ sku: '', qty: 0, active: false })
  })

  it('lays out the object-array repeater row with a right-aligned button group and drag handle', () => {
    const schema = columnsToFormKitSchema([
      column({
        columnKey: 'items',
        columnType: 'array',
        arrayItemType: 'object',
        children: [column({ columnKey: 'sku', columnType: 'string' })],
      }),
    ])
    expect(schema[0]?.listClass).toContain('gap-3')
    expect(schema[0]?.listItemClass).toContain('flex')
    expect(schema[0]?.listItemClass).toContain('shadow-sm')
    expect(schema[0]?.buttonGroupClass).toContain('ml-auto')
    expect(schema[0]?.displayDragHandle).toBe(true)
    expect(schema[0]?.draggable).toBe(true)
    expect(schema[0]?.hideMoveButtons).toBe(true)
  })

  it('recurses through a doubly-nested array-of-objects-within-array-of-objects', () => {
    const schema = columnsToFormKitSchema([
      column({
        columnKey: 'orders',
        columnType: 'array',
        arrayItemType: 'object',
        children: [
          column({ columnKey: 'label', columnType: 'string' }),
          column({
            columnKey: 'lineItems',
            columnType: 'array',
            arrayItemType: 'object',
            children: [
              column({ columnKey: 'sku', columnType: 'string' }),
            ],
          }),
        ],
      }),
    ])

    expect(schema[0]?.$formkit).toBe('nuxtUIRepeater')
    const orderFields = schema[0]?.children as ReturnType<typeof columnsToFormKitSchema>
    expect(orderFields[0]?.$formkit).toBe('nuxtUIInput')
    expect(orderFields[1]?.$formkit).toBe('nuxtUIRepeater')
    expect(orderFields[1]?.name).toBe('lineItems')

    const lineItemFields = orderFields[1]?.children as ReturnType<typeof columnsToFormKitSchema>
    expect(lineItemFields[0]?.$formkit).toBe('nuxtUIInput')
    expect(lineItemFields[0]?.name).toBe('sku')
  })

  it('produces an empty children array for an object-array column with no children', () => {
    const schema = columnsToFormKitSchema([
      column({ columnKey: 'empty', columnType: 'array', arrayItemType: 'object' }),
    ])
    expect(schema[0]?.$formkit).toBe('nuxtUIRepeater')
    expect(schema[0]?.children).toEqual([])
  })
})

describe('documentToFormData — extended-JSON unwrap', () => {
  it('unwraps an $oid on a string column to the plain string', () => {
    const columns = [column({ columnKey: '_id', columnType: 'string' })]
    const formData = documentToFormData({ _id: { $oid: '507f1f77bcf86cd799439011' } }, columns)
    expect(formData._id).toBe('507f1f77bcf86cd799439011')
  })

  it('leaves a plain string untouched', () => {
    const columns = [column({ columnKey: 'name', columnType: 'string' })]
    expect(documentToFormData({ name: 'Alice' }, columns).name).toBe('Alice')
  })

  it('unwraps a $date ISO string on a date-time column to an @internationalized/date value round-tripping to the same instant', () => {
    const columns = [column({ columnKey: 'createdAt', columnType: 'date-time' })]
    const formData = documentToFormData({ createdAt: { $date: '2024-01-15T10:30:00.000Z' } }, columns)
    expect(isoOf(formData.createdAt)).toBe('2024-01-15T10:30:00.000Z')
  })

  it('unwraps a $date epoch-millis number to the same instant as the string form', () => {
    const columns = [column({ columnKey: 'createdAt', columnType: 'date-time' })]
    const iso = new Date('2024-01-15T10:30:00.000Z').getTime()
    const formData = documentToFormData({ createdAt: { $date: iso } }, columns)
    expect(isoOf(formData.createdAt)).toBe('2024-01-15T10:30:00.000Z')
  })

  it('unwraps a $date wrapping a $numberLong to the same instant', () => {
    const columns = [column({ columnKey: 'createdAt', columnType: 'date-time' })]
    const millis = new Date('2024-01-15T10:30:00.000Z').getTime()
    const formData = documentToFormData({ createdAt: { $date: { $numberLong: String(millis) } } }, columns)
    expect(isoOf(formData.createdAt)).toBe('2024-01-15T10:30:00.000Z')
  })

  it.each(['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'])('unwraps %s on a number column to a JS number', (key) => {
    const columns = [column({ columnKey: 'count', columnType: 'number' })]
    const formData = documentToFormData({ count: { [key]: '42' } }, columns)
    expect(formData.count).toBe(42)
  })

  it('recurses through one level of extended-JSON fields inside a nested object', () => {
    const columns = [
      column({
        columnKey: 'meta',
        columnType: 'object',
        children: [
          column({ columnKey: 'ownerId', columnType: 'string' }),
          column({ columnKey: 'updatedAt', columnType: 'date-time' }),
        ],
      }),
    ]
    const formData = documentToFormData({
      meta: { ownerId: { $oid: 'abc123' }, updatedAt: { $date: '2024-01-15T10:30:00.000Z' } },
    }, columns)
    const meta = formData.meta as { ownerId: string, updatedAt: unknown }
    expect(meta.ownerId).toBe('abc123')
    expect(isoOf(meta.updatedAt)).toBe('2024-01-15T10:30:00.000Z')
  })

  it('applies the unwrap to every item of an array-of-objects column', () => {
    const columns = [
      column({
        columnKey: 'items',
        columnType: 'array',
        arrayItemType: 'object',
        children: [column({ columnKey: 'sku', columnType: 'string' })],
      }),
    ]
    const formData = documentToFormData({
      items: [{ sku: { $oid: 'a1' } }, { sku: { $oid: 'b2' } }],
    }, columns)
    expect(formData.items).toEqual([{ sku: 'a1' }, { sku: 'b2' }])
  })

  it('passes a scalar array through as-is with no per-item unwrapping', () => {
    const columns = [column({ columnKey: 'tags', columnType: 'array', arrayItemType: 'string' })]
    const formData = documentToFormData({ tags: ['a', 'b'] }, columns)
    expect(formData.tags).toEqual(['a', 'b'])
  })

  it('omits a field missing from the document entirely, rather than setting null', () => {
    const columns = [
      column({ columnKey: 'name', columnType: 'string' }),
      column({ columnKey: 'nickname', columnType: 'string' }),
    ]
    const formData = documentToFormData({ name: 'Alice' }, columns)
    expect(formData).toEqual({ name: 'Alice' })
    expect(formData).not.toHaveProperty('nickname')
  })
})

describe('formDataToDocument — extended-JSON rewrap', () => {
  it('rewraps a plain ISO string on a date-time field to { $date: isoString }', () => {
    const columns = [column({ columnKey: 'createdAt', columnType: 'date-time' })]
    const doc = formDataToDocument({ createdAt: '2024-01-15T10:30:00.000Z' }, columns)
    expect(doc.createdAt).toEqual({ $date: '2024-01-15T10:30:00.000Z' })
  })

  it('rewraps the @internationalized/date value nuxtUIInputDate actually emits to { $date: isoString }', () => {
    const columns = [column({ columnKey: 'createdAt', columnType: 'date-time' })]
    const zonedValue = documentToFormData({ createdAt: { $date: '2024-01-15T10:30:00.000Z' } }, columns).createdAt
    const doc = formDataToDocument({ createdAt: zonedValue }, columns)
    expect(doc.createdAt).toEqual({ $date: '2024-01-15T10:30:00.000Z' })
  })

  it('rewraps a string field back to { $oid: value } when the original was $oid-wrapped', () => {
    const columns = [column({ columnKey: '_ownerId', columnType: 'string' })]
    const originalDoc = { _ownerId: { $oid: '507f1f77bcf86cd799439011' } }
    const doc = formDataToDocument({ _ownerId: '507f1f77bcf86cd799439011' }, columns, originalDoc)
    expect(doc._ownerId).toEqual({ $oid: '507f1f77bcf86cd799439011' })
  })

  it('leaves a plain string field alone when the original was not $oid-wrapped', () => {
    const columns = [column({ columnKey: 'name', columnType: 'string' })]
    const doc = formDataToDocument({ name: 'Alice' }, columns, { name: 'Bob' })
    expect(doc.name).toBe('Alice')
  })

  it('preserves an originalDoc field not covered by columns (full-replace safety)', () => {
    const columns = [
      column({ columnKey: 'name', columnType: 'string' }),
      column({ columnKey: 'age', columnType: 'number' }),
    ]
    const originalDoc = { name: 'Alice', age: 30, legacyFlag: true }
    const doc = formDataToDocument({ name: 'Alice', age: 31 }, columns, originalDoc)
    expect(doc).toEqual({ name: 'Alice', age: 31, legacyFlag: true })
  })

  it('contains only the rewrapped form fields when originalDoc is omitted (insert case)', () => {
    const columns = [
      column({ columnKey: 'name', columnType: 'string' }),
      column({ columnKey: 'age', columnType: 'number' }),
    ]
    const doc = formDataToDocument({ name: 'Alice', age: 30 }, columns)
    expect(doc).toEqual({ name: 'Alice', age: 30 })
  })

  it('never includes _id in the output, even if present in formData or originalDoc', () => {
    const columns = [column({ columnKey: 'name', columnType: 'string' })]
    const originalDoc = { _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Bob' }
    const doc = formDataToDocument({ _id: 'should-be-stripped', name: 'Alice' }, columns, originalDoc)
    expect(doc).not.toHaveProperty('_id')
    expect(doc.name).toBe('Alice')
  })

  it('passes object and array-of-objects fields through as plain JS values', () => {
    const columns = [
      column({ columnKey: 'meta', columnType: 'object', children: [column({ columnKey: 'ownerId', columnType: 'string' })] }),
      column({ columnKey: 'items', columnType: 'array', arrayItemType: 'object', children: [column({ columnKey: 'sku', columnType: 'string' })] }),
    ]
    const doc = formDataToDocument({
      meta: { ownerId: 'abc123' },
      items: [{ sku: 'A1' }, { sku: 'B2' }],
    }, columns)
    expect(doc.meta).toEqual({ ownerId: 'abc123' })
    expect(doc.items).toEqual([{ sku: 'A1' }, { sku: 'B2' }])
  })
})
