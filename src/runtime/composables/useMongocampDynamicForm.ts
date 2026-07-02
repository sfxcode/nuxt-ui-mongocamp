import { parseAbsoluteToLocal } from '@internationalized/date'
import type { ColumnDefinition } from './useMongocampSchema'

// Models both FormKit input nodes ($formkit) and plain layout elements ($el) — mirrors
// FormKit's own loosely-typed schema node shape, where most fields are optional depending
// on which of $formkit/$el is present.
export interface FormKitSchemaNode {
  $formkit?: string
  $el?: string
  name?: string
  label?: string
  validation?: string
  attrs?: Record<string, unknown>
  children?: FormKitSchemaNode[]
  [key: string]: unknown
}

const SCALAR_FORMKIT_TYPES: Record<string, string> = {
  'string': 'nuxtUIInput',
  'number': 'nuxtUIInputNumber',
  'boolean': 'nuxtUISwitch',
  'date-time': 'nuxtUIInputDate',
}

function scalarNode(column: ColumnDefinition, formkitType: string): FormKitSchemaNode {
  const node: FormKitSchemaNode = {
    $formkit: formkitType,
    name: column.columnKey,
    label: column.columnName,
  }
  if (column.required) {
    node.validation = 'required'
  }
  return node
}

function groupNode(column: ColumnDefinition): FormKitSchemaNode {
  return {
    $formkit: 'group',
    name: column.columnKey,
    label: column.columnName,
    children: columnsToFormKitSchema(column.children ?? []),
  }
}

// FormKit's 'group' type renders as a bare fragment with no outer/wrapper element
// (see @formkit/inputs group.js: schema is fragment('$slots.default')) — its fields render
// as direct children of whatever DOM element surrounds it. Wrapping it in a flex column with
// its own top spacing and gap gives the group both separation from preceding fields and
// breathing room between its own fields, since there's no group-level element to style directly.
function wrapGroup(node: FormKitSchemaNode): FormKitSchemaNode {
  return {
    $el: 'div',
    attrs: { class: 'pt-4 flex flex-col gap-3' },
    children: [node],
  }
}

function scalarArrayNode(column: ColumnDefinition): FormKitSchemaNode {
  const node: FormKitSchemaNode = {
    $formkit: 'nuxtUIInputTags',
    name: column.columnKey,
    label: column.columnName,
  }
  if (column.required) {
    node.validation = 'required'
  }
  return node
}

function defaultScalarValue(formkitType: string): unknown {
  if (formkitType === 'nuxtUIInputNumber') return 0
  if (formkitType === 'nuxtUISwitch') return false
  return ''
}

function defaultValueForColumn(column: ColumnDefinition): unknown {
  if (column.columnType === 'object') return defaultObjectValue(column.children ?? [])
  if (column.columnType === 'array') return []
  const formkitType = SCALAR_FORMKIT_TYPES[column.columnType]
  return formkitType ? defaultScalarValue(formkitType) : ''
}

function defaultObjectValue(children: ColumnDefinition[]): Record<string, unknown> {
  const value: Record<string, unknown> = {}
  children.forEach((child) => {
    value[child.columnKey] = defaultValueForColumn(child)
  })
  return value
}

// nuxtUIRepeater's clone/add/delete buttons and the persistent insert button are opt-in —
// they render only when these props are explicitly true (undefined is treated as hidden)
const REPEATER_BUTTON_PROPS = {
  alwaysDisplayInsertButton: true,
  displayAddButton: true,
  displayCloneButton: true,
  displayDeleteButton: true,
}

// Row layout: drag handle + fields + button group render as unstyled block-level siblings by
// default (buttons end up stacked under the fields). listItemClass turns each row into a flex
// row; ml-auto on the button group pins the buttons to the right regardless of field count.
// A drag handle replaces the up/down move buttons, per the component's own documented pairing.
// Spacing between rows uses listClass's gap (flex column), not listItemClass's margin —
// margin-bottom on adjacent list items rendered as a no-op in manual testing.
const REPEATER_LAYOUT_PROPS = {
  listClass: 'flex flex-col gap-3',
  listItemClass: 'flex flex-wrap items-end gap-3 p-3 border border-gray-100 dark:border-gray-800 rounded-lg shadow-sm',
  buttonGroupClass: 'flex items-center gap-1 ml-auto',
  displayDragHandle: true,
  draggable: true,
  hideMoveButtons: true,
  dragHandleClass: 'cursor-grab active:cursor-grabbing text-dimmed',
}

function repeaterArrayNode(column: ColumnDefinition, itemFormkitType: string): FormKitSchemaNode {
  const node: FormKitSchemaNode = {
    $formkit: 'nuxtUIRepeater',
    name: column.columnKey,
    label: column.columnName,
    newItem: { value: defaultScalarValue(itemFormkitType) },
    ...REPEATER_BUTTON_PROPS,
    ...REPEATER_LAYOUT_PROPS,
    children: [
      { $formkit: itemFormkitType, name: 'value', label: 'Value' },
    ],
  }
  if (column.required) {
    node.validation = 'required'
  }
  return node
}

function objectArrayNode(column: ColumnDefinition): FormKitSchemaNode {
  const node: FormKitSchemaNode = {
    $formkit: 'nuxtUIRepeater',
    name: column.columnKey,
    label: column.columnName,
    newItem: defaultObjectValue(column.children ?? []),
    ...REPEATER_BUTTON_PROPS,
    ...REPEATER_LAYOUT_PROPS,
    children: columnsToFormKitSchema(column.children ?? []),
  }
  if (column.required) {
    node.validation = 'required'
  }
  return node
}

function arrayNode(column: ColumnDefinition): FormKitSchemaNode | undefined {
  if (column.arrayItemType === 'object') {
    return objectArrayNode(column)
  }
  // 'string' and the 'unknown' (always-empty-array) fallback both render as a tag list
  if (column.arrayItemType === 'string' || column.arrayItemType === 'unknown') {
    return scalarArrayNode(column)
  }
  const itemFormkitType = column.arrayItemType ? SCALAR_FORMKIT_TYPES[column.arrayItemType] : undefined
  if (itemFormkitType) {
    return repeaterArrayNode(column, itemFormkitType)
  }
  return undefined
}

export function columnsToFormKitSchema(columns: ColumnDefinition[]): FormKitSchemaNode[] {
  const schema: FormKitSchemaNode[] = []
  columns.forEach((column) => {
    if (column.columnType === 'object') {
      schema.push(wrapGroup(groupNode(column)))
      return
    }
    if (column.columnType === 'array') {
      const node = arrayNode(column)
      if (node) schema.push(node)
      return
    }
    const formkitType = SCALAR_FORMKIT_TYPES[column.columnType]
    if (formkitType) {
      schema.push(scalarNode(column, formkitType))
    }
  })
  return schema
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unwrapOid(raw: unknown): unknown {
  if (isPlainObject(raw) && typeof raw.$oid === 'string') return raw.$oid
  return raw
}

const NUMBER_WRAPPER_KEYS = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal']

function unwrapNumber(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw
  for (const key of NUMBER_WRAPPER_KEYS) {
    const wrapped = raw[key]
    if (typeof wrapped === 'string' || typeof wrapped === 'number') {
      const parsed = Number(wrapped)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return raw
}

function unwrapDateTime(raw: unknown): unknown {
  if (!isPlainObject(raw) || !('$date' in raw)) return raw
  const inner = raw.$date
  if (typeof inner === 'string' || typeof inner === 'number') {
    return new Date(inner).toISOString()
  }
  if (isPlainObject(inner) && typeof inner.$numberLong === 'string') {
    return new Date(Number(inner.$numberLong)).toISOString()
  }
  return raw
}

// nuxtUIInputDate (this composable's date-time input choice) is backed by reka-ui's DateField,
// which requires an @internationalized/date value — passing it a plain string crashes with
// "defaultValue.copy is not a function". Only a full absolute instant (an ISO string with a
// time and offset/Z, which unwrapDateTime always produces) can be parsed this way; a partial
// date-only string is passed through unchanged rather than thrown on.
function toZonedDateTime(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return parseAbsoluteToLocal(value)
  }
  catch {
    return value
  }
}

function isZonedDateTimeLike(value: unknown): value is { toAbsoluteString: () => string } {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).toAbsoluteString === 'function'
}

// Converts a raw MongoDB document (possibly containing extended-JSON wrappers) into the plain
// shape the generated FormKit schema binds to. Fields absent from the document are omitted
// entirely rather than set to null/undefined, so FormKit's own default-value behavior applies.
export function documentToFormData(doc: Record<string, unknown>, columns: ColumnDefinition[]): Record<string, unknown> {
  const formData: Record<string, unknown> = {}

  columns.forEach((column) => {
    if (!(column.columnKey in doc)) return
    const raw = doc[column.columnKey]

    if (column.columnType === 'object') {
      if (isPlainObject(raw)) {
        formData[column.columnKey] = documentToFormData(raw, column.children ?? [])
      }
      return
    }

    if (column.columnType === 'array') {
      if (!Array.isArray(raw)) return
      formData[column.columnKey] = column.arrayItemType === 'object'
        ? raw.map(item => isPlainObject(item) ? documentToFormData(item, column.children ?? []) : item)
        : raw
      return
    }

    if (column.columnType === 'date-time') {
      formData[column.columnKey] = toZonedDateTime(unwrapDateTime(raw))
    }
    else if (column.columnType === 'string') {
      formData[column.columnKey] = unwrapOid(raw)
    }
    else if (column.columnType === 'number') {
      formData[column.columnKey] = unwrapNumber(raw)
    }
    else {
      formData[column.columnKey] = raw
    }
  })

  return formData
}

function wasOriginallyOid(originalValue: unknown): boolean {
  return isPlainObject(originalValue) && typeof originalValue.$oid === 'string'
}

// Converts the plain-object shape FormKit emits back into a document payload safe for
// documentApi.insert/update. Only date-time (-> $date) and originally-$oid string fields need
// rewrapping — object/array-of-objects/number fields round-trip as plain JS values, since the
// server accepts plain shapes on write (only reads return the extended-JSON wrapped form).
// When originalDoc is given (the edit case), the result starts as a clone of it, so any field
// the sampled schema never saw (not covered by columns) survives untouched — documentApi.update
// is full-replace, so silently dropping an unsampled field here would delete it on save.
export function formDataToDocument(
  formData: Record<string, unknown>,
  columns: ColumnDefinition[],
  originalDoc?: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = originalDoc ? { ...originalDoc } : {}

  columns.forEach((column) => {
    if (!(column.columnKey in formData)) return
    const value = formData[column.columnKey]

    if (column.columnType === 'date-time' && isZonedDateTimeLike(value)) {
      result[column.columnKey] = { $date: value.toAbsoluteString() }
    }
    else if (column.columnType === 'date-time' && typeof value === 'string') {
      result[column.columnKey] = { $date: value }
    }
    else if (column.columnType === 'string' && wasOriginallyOid(originalDoc?.[column.columnKey])) {
      result[column.columnKey] = { $oid: value }
    }
    else {
      result[column.columnKey] = value
    }
  })

  delete result._id
  return result
}
